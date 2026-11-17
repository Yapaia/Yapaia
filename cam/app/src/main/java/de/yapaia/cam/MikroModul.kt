package de.yapaia.cam

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Die beiden eingebauten Mikrofone (`bottom` und `back`).
 *
 * - `/mikro/waehlen?mikro=back` – Mikrofon für Pegel und Aufnahme
 * - `/mikro/messen` – beide Mikros je 1 s messen (dBFS)
 * - `/mikro/dauer?an=1` – Pegel des gewählten Mikros laufend messen (Sensor)
 * - `/mikro/aufnahme.wav?s=3[&mikro=bottom]` – kurze Aufnahme 16 kHz mono,
 *   das Format von Assist/Wyoming (zum Prüfen der Sprachqualität)
 * - `/mikro/stereo?s=5[&maske=frontback|stereo][&quelle=mic|unprocessed|camcorder|erkennung|gespraech]`
 *   – Versuch, beide Mikros gleichzeitig aufzunehmen (zwei Kanäle). Antwort:
 *   Pegel je Kanal, Ähnlichkeit (Korrelation), Pegel der Differenz, das
 *   tatsächlich gewählte Gerät. Die Aufnahme liegt danach unter `/mikro/stereo.wav`.
 *
 * Braucht RECORD_AUDIO (`adb shell pm grant de.yapaia.cam android.permission.RECORD_AUDIO`).
 */
class MikroModul(private val ctx: Context) : Modul {

    override val name = "mikro"

    private val audio = ctx.getSystemService(AudioManager::class.java)
    private val einstellungen = ctx.getSharedPreferences("dienst_mikro", Context.MODE_PRIVATE)
    private val sperre = Object()

    @Volatile private var gewaehlt = einstellungen.getString("mikro", "bottom") ?: "bottom"
    @Volatile private var dauer = einstellungen.getBoolean("dauer", false)
    @Volatile private var laeuft = false
    private val pegel = mutableMapOf<String, JSONObject>()
    @Volatile private var fehler: String? = null
    /** Nur eine Aufnahme zur Zeit (Dauermessung pausiert während des Stereo-Tests). */
    private val aufnahmeSperre = Object()
    @Volatile private var letzteStereo: ByteArray? = null

    override fun starten() {
        if (dauer) dauerStarten()
    }

    override fun stoppen() {
        dauer = false
    }

    private fun erlaubt() = ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun mikros(): List<AudioDeviceInfo> =
        audio.getDevices(AudioManager.GET_DEVICES_INPUTS).filter { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }

    /** [sekunden] vom Mikro [adresse] aufnehmen (16 kHz, mono, 16 Bit). */
    @SuppressLint("MissingPermission")
    private fun aufnehmen(adresse: String, ms: Int): ShortArray = synchronized(aufnahmeSperre) {
        val rate = RATE
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val r = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, maxOf(min, rate / 5 * 2))
        try {
            mikros().firstOrNull { it.address == adresse }?.let { r.setPreferredDevice(it) }
            val n = rate * ms / 1000
            val daten = ShortArray(n)
            r.startRecording()
            var gelesen = 0
            while (gelesen < n) {
                val k = r.read(daten, gelesen, minOf(1600, n - gelesen))
                if (k <= 0) throw IllegalStateException("AudioRecord.read = $k")
                gelesen += k
            }
            r.stop()
            daten
        } finally {
            r.release()
        }
    }

    /** Zwei Kanäle gleichzeitig aufnehmen; liefert verschränkte Proben (L,R,L,R …) und Infos. */
    @SuppressLint("MissingPermission")
    private fun stereoAufnehmen(ms: Int, maske: String, quelle: String): Pair<ShortArray, JSONObject> = synchronized(aufnahmeSperre) {
        val kanal = if (maske == "stereo") AudioFormat.CHANNEL_IN_STEREO
            else AudioFormat.CHANNEL_IN_FRONT or AudioFormat.CHANNEL_IN_BACK
        val src = when (quelle) {
            "unprocessed" -> MediaRecorder.AudioSource.UNPROCESSED
            "camcorder" -> MediaRecorder.AudioSource.CAMCORDER
            "erkennung" -> MediaRecorder.AudioSource.VOICE_RECOGNITION
            "gespraech" -> MediaRecorder.AudioSource.VOICE_COMMUNICATION
            else -> MediaRecorder.AudioSource.MIC
        }
        val rate = RATE
        val min = AudioRecord.getMinBufferSize(rate, kanal, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) throw IllegalStateException("Format nicht unterstützt (getMinBufferSize = $min)")
        val r = AudioRecord(src, rate, kanal, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, rate * 2 * 2 / 5 * 2))
        try {
            if (r.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("AudioRecord nicht bereit")
            val n = rate * ms / 1000 * r.channelCount
            val daten = ShortArray(n)
            r.startRecording()
            var gelesen = 0
            while (gelesen < n) {
                val k = r.read(daten, gelesen, minOf(3200, n - gelesen))
                if (k <= 0) throw IllegalStateException("AudioRecord.read = $k")
                gelesen += k
            }
            val info = JSONObject().put("kanaele", r.channelCount).put("maske", maske).put("quelle", quelle)
                .put("geraet", r.routedDevice?.let { "${it.productName} @${it.address}" } ?: JSONObject.NULL)
            r.stop()
            Pair(daten, info)
        } finally {
            r.release()
        }
    }

    /** Pegel je Kanal, Korrelation und Pegel der Differenz. */
    private fun stereoAuswerten(d: ShortArray, kanaele: Int): JSONObject {
        fun db(x: Double) = if (x <= 0) -96.0 else Math.round(20 * log10(x / 32768.0) * 10) / 10.0
        if (kanaele < 2) return JSONObject().put("hinweis", "nur ein Kanal geliefert")
        val ab = RATE / 10
        var sl = 0.0; var sr = 0.0; var slr = 0.0; var sd = 0.0; var pl = 0; var pr = 0
        var n = 0
        var i = ab * kanaele
        while (i + 1 < d.size) {
            val l = d[i].toDouble(); val rr = d[i + 1].toDouble()
            sl += l * l; sr += rr * rr; slr += l * rr; sd += (l - rr) * (l - rr)
            pl = maxOf(pl, kotlin.math.abs(d[i].toInt())); pr = maxOf(pr, kotlin.math.abs(d[i + 1].toInt()))
            n++; i += kanaele
        }
        n = maxOf(1, n)
        val korr = if (sl > 0 && sr > 0) slr / sqrt(sl * sr) else 0.0
        return JSONObject()
            .put("kanal1", JSONObject().put("rms_db", db(sqrt(sl / n))).put("spitze_db", db(pl.toDouble())))
            .put("kanal2", JSONObject().put("rms_db", db(sqrt(sr / n))).put("spitze_db", db(pr.toDouble())))
            .put("korrelation", Math.round(korr * 1000) / 1000.0)
            .put("differenz_rms_db", db(sqrt(sd / n)))
            .put("gleich", sd == 0.0)
    }

    private fun auswerten(d: ShortArray): JSONObject {
        // die ersten 100 ms auslassen (Einschwingen)
        val ab = minOf(d.size, RATE / 10)
        var summe = 0.0
        var spitze = 0
        for (i in ab until d.size) {
            val v = d[i].toInt()
            summe += v.toDouble() * v
            if (kotlin.math.abs(v) > spitze) spitze = kotlin.math.abs(v)
        }
        val rms = sqrt(summe / maxOf(1, d.size - ab))
        fun db(x: Double) = if (x <= 0) -96.0 else Math.round(20 * log10(x / 32768.0) * 10) / 10.0
        return JSONObject().put("rms_db", db(rms)).put("spitze_db", db(spitze.toDouble()))
            .put("zeit", System.currentTimeMillis() / 1000)
    }

    private fun messen(adresse: String, ms: Int = 1000) {
        val j = auswerten(aufnehmen(adresse, ms))
        synchronized(sperre) { pegel[adresse] = j }
    }

    private fun dauerStarten() {
        if (laeuft || !erlaubt()) return
        laeuft = true
        Thread({
            try {
                while (dauer) {
                    try {
                        messen(gewaehlt, 1000)
                        fehler = null
                    } catch (e: Exception) {
                        fehler = e.toString()
                        Thread.sleep(5000)
                    }
                    Thread.sleep(1000)
                }
            } finally {
                laeuft = false
            }
        }, "mikro-pegel").start()
    }

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        val p = anfrage.parameter
        when (rest) {
            "waehlen" -> {
                val m = p["mikro"] ?: return false
                if (mikros().none { it.address == m }) { antwort.text(400, "unbekanntes Mikro: $m\n"); return true }
                gewaehlt = m
                einstellungen.edit().putString("mikro", m).apply()
                antwort.text(200, status().toString(2) + "\n", "application/json")
            }
            "dauer" -> {
                dauer = p["an"] == "1" || p["an"] == "true"
                einstellungen.edit().putBoolean("dauer", dauer).apply()
                if (dauer) dauerStarten()
                antwort.text(200, status().toString(2) + "\n", "application/json")
            }
            "messen" -> {
                if (!erlaubt()) { antwort.text(403, "RECORD_AUDIO fehlt\n"); return true }
                try {
                    for (m in mikros()) messen(m.address)
                    fehler = null
                } catch (e: Exception) {
                    fehler = e.toString()
                }
                antwort.text(200, status().toString(2) + "\n", "application/json")
            }
            "aufnahme.wav" -> {
                if (!erlaubt()) { antwort.text(403, "RECORD_AUDIO fehlt\n"); return true }
                val s = (p["s"]?.toIntOrNull() ?: 3).coerceIn(1, 10)
                val d = aufnehmen(p["mikro"] ?: gewaehlt, s * 1000)
                antwort.senden(200, "audio/wav", wav(d))
            }
            "stereo" -> {
                if (!erlaubt()) { antwort.text(403, "RECORD_AUDIO fehlt\n"); return true }
                val s = (p["s"]?.toIntOrNull() ?: 5).coerceIn(1, 15)
                val j = try {
                    val (d, info) = stereoAufnehmen(s * 1000, p["maske"] ?: "frontback", p["quelle"] ?: "mic")
                    letzteStereo = wav(d, info.getInt("kanaele"))
                    info.put("auswertung", stereoAuswerten(d, info.getInt("kanaele"))).put("wav", "/mikro/stereo.wav")
                } catch (e: Exception) {
                    JSONObject().put("fehler", e.toString())
                }
                antwort.text(200, j.toString(2) + "\n", "application/json")
            }
            "stereo.wav" -> {
                val w = letzteStereo
                if (w == null) antwort.text(404, "noch keine Stereo-Aufnahme – erst /mikro/stereo\n")
                else antwort.senden(200, "audio/wav", w)
            }
            else -> return false
        }
        return true
    }

    private fun wav(d: ShortArray, kanaele: Int = 1): ByteArray {
        val daten = ByteBuffer.allocate(d.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        d.forEach { daten.putShort(it) }
        val k = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        k.put("RIFF".toByteArray()).putInt(36 + d.size * 2).put("WAVE".toByteArray())
            .put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(kanaele.toShort()).putInt(RATE)
            .putInt(RATE * 2 * kanaele).putShort((2 * kanaele).toShort()).putShort(16).put("data".toByteArray()).putInt(d.size * 2)
        return ByteArrayOutputStream().apply { write(k.array()); write(daten.array()) }.toByteArray()
    }

    override fun status(): JSONObject {
        val liste = JSONArray()
        for (m in mikros()) {
            liste.put(JSONObject().put("adresse", m.address).put("name", m.productName.toString())
                .put("pegel", synchronized(sperre) { pegel[m.address] } ?: JSONObject.NULL))
        }
        val g = synchronized(sperre) { pegel[gewaehlt] }
        return JSONObject()
            .put("erlaubt", erlaubt())
            .put("gewaehlt", gewaehlt)
            .put("dauer", dauer)
            .put("pegel_db", g?.optDouble("rms_db") ?: JSONObject.NULL)
            .put("mikros", liste)
            .put("fehler", fehler ?: JSONObject.NULL)
    }

    companion object {
        const val RATE = 16000
    }
}
