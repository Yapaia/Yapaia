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
    private fun aufnehmen(adresse: String, ms: Int): ShortArray {
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
            return daten
        } finally {
            r.release()
        }
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
            else -> return false
        }
        return true
    }

    private fun wav(d: ShortArray): ByteArray {
        val daten = ByteBuffer.allocate(d.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        d.forEach { daten.putShort(it) }
        val k = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        k.put("RIFF".toByteArray()).putInt(36 + d.size * 2).put("WAVE".toByteArray())
            .put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(RATE).putInt(RATE * 2)
            .putShort(2).putShort(16).put("data".toByteArray()).putInt(d.size * 2)
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
