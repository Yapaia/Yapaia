package de.yapaia.cam

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import kotlin.math.PI
import kotlin.math.sin

/**
 * Sprachsatellit für Home Assistant (Wyoming-Protokoll, Port [PORT]).
 *
 * Home Assistant verbindet sich (Integration „Wyoming Protocol“, Host = Radio,
 * Port 10700). Auf „run-satellite“ streamt das Radio das gewählte Mikrofon
 * (Standard: `back`, das Klinkenmikro hinten) als 16 kHz mono und bittet HA
 * um eine Pipeline ab dem Weckwort (openWakeWord läuft in HA). Die Antwort
 * (TTS) spielt es über die Lautsprecher des Radios; beim erkannten Weckwort
 * kommt ein kurzer Ton.
 *
 * - `/assist/einstellen?an=1&mikro=back&quelle=camcorder&verstaerkung=4&rauschfilter=0`
 * - `/status` → `assist`: verbunden, streamt, letzter Text, Pegel
 *
 * Protokoll: eine JSON-Kopfzeile je Ereignis (`type`, `data_length`,
 * `payload_length`), danach die Daten (JSON) und die Nutzlast (PCM).
 */
class SatellitModul(private val ctx: Context) : Modul {

    override val name = "assist"

    private val audio = ctx.getSystemService(AudioManager::class.java)
    private val einstellungen = ctx.getSharedPreferences("dienst_assist", Context.MODE_PRIVATE)

    @Volatile private var an = einstellungen.getBoolean("an", true)
    @Volatile private var mikro = einstellungen.getString("mikro", "back") ?: "back"
    @Volatile private var verstaerkung = einstellungen.getFloat("verstaerkung", 4f)
    @Volatile private var rauschfilter = einstellungen.getBoolean("rauschfilter", false)
    /** Aufnahmeart: `camcorder` nimmt das hintere Mikro ohne das harte Rauschtor,
     *  das `mic` dort hat (in Ruhe 98 % exakte Nullen → Sprache zerhackt). */
    @Volatile private var quelle = einstellungen.getString("quelle", "camcorder") ?: "camcorder"

    @Volatile private var server: ServerSocket? = null
    @Volatile private var verbindung: Socket? = null
    @Volatile private var aus: OutputStream? = null
    private val schreibSperre = Object()
    @Volatile private var streamt = false
    @Volatile private var mikroFaden: Thread? = null
    @Volatile private var fehler: String? = null
    @Volatile private var letzterText: String? = null
    @Volatile private var letzteAntwort: String? = null
    @Volatile private var zustand = "aus"
    @Volatile private var pegelDb = -96.0
    @Volatile private var weckwoerter = 0
    private var nsdHoerer: NsdManager.RegistrationListener? = null

    // Wiedergabe (TTS)
    private var spur: AudioTrack? = null
    private var spurFrames = 0L          // geschriebene Frames
    private var spurBytesProFrame = 2

    override fun starten() {
        if (an) serverStarten()
    }

    override fun stoppen() {
        serverStoppen()
    }

    // ── Server ──────────────────────────────────────────────────────────────

    private fun serverStarten() {
        if (server != null) return
        Thread({
            try {
                val s = ServerSocket(PORT)
                server = s
                zustand = "wartet auf Home Assistant"
                anmelden()
                while (!s.isClosed) {
                    val k = try { s.accept() } catch (e: Exception) { break }
                    // nur eine Verbindung: eine neue ersetzt die alte
                    trennen()
                    verbindung = k
                    k.tcpNoDelay = true
                    aus = k.getOutputStream()
                    zustand = "verbunden"
                    Thread({ lesen(k) }, "assist-lesen").start()
                }
            } catch (e: Exception) {
                fehler = "Server: $e"
                Log.w(TAG, "Server", e)
            } finally {
                server = null
            }
        }, "assist-server").start()
    }

    private fun serverStoppen() {
        abmelden()
        trennen()
        try { server?.close() } catch (_: Exception) {}
        server = null
        zustand = "aus"
    }

    private fun trennen() {
        streamt = false
        try { verbindung?.close() } catch (_: Exception) {}
        verbindung = null
        aus = null
        spurSchliessen()
    }

    /** Zeroconf `_wyoming._tcp`, damit HA den Satelliten selbst findet. */
    private fun anmelden() {
        try {
            val nsd = ctx.getSystemService(NsdManager::class.java) ?: return
            val info = NsdServiceInfo().apply {
                serviceName = "yapaia-radio"
                serviceType = "_wyoming._tcp"
                port = PORT
            }
            val h = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(i: NsdServiceInfo) {}
                override fun onRegistrationFailed(i: NsdServiceInfo, code: Int) { fehler = "Zeroconf: $code" }
                override fun onServiceUnregistered(i: NsdServiceInfo) {}
                override fun onUnregistrationFailed(i: NsdServiceInfo, code: Int) {}
            }
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, h)
            nsdHoerer = h
        } catch (e: Exception) {
            fehler = "Zeroconf: $e"
        }
    }

    private fun abmelden() {
        val h = nsdHoerer ?: return
        nsdHoerer = null
        try { ctx.getSystemService(NsdManager::class.java)?.unregisterService(h) } catch (_: Exception) {}
    }

    // ── Wyoming lesen/schreiben ─────────────────────────────────────────────

    private fun zeile(e: InputStream): String? {
        val b = java.io.ByteArrayOutputStream()
        while (true) {
            val c = e.read()
            if (c < 0) return if (b.size() > 0) b.toString("UTF-8") else null
            if (c == '\n'.code) return b.toString("UTF-8")
            b.write(c)
        }
    }

    private fun lesenGenau(e: InputStream, n: Int): ByteArray {
        val d = ByteArray(n)
        var g = 0
        while (g < n) {
            val k = e.read(d, g, n - g)
            if (k < 0) throw java.io.EOFException()
            g += k
        }
        return d
    }

    private fun lesen(k: Socket) {
        try {
            val ein = BufferedInputStream(k.getInputStream())
            while (true) {
                val kopfText = zeile(ein) ?: break
                if (kopfText.isBlank()) continue
                val kopf = JSONObject(kopfText)
                var daten = kopf.optJSONObject("data") ?: JSONObject()
                val dl = kopf.optInt("data_length", 0)
                if (dl > 0) {
                    val extra = JSONObject(String(lesenGenau(ein, dl), Charsets.UTF_8))
                    extra.keys().forEach { daten.put(it, extra.get(it)) }
                }
                val pl = kopf.optInt("payload_length", 0)
                val nutz = if (pl > 0) lesenGenau(ein, pl) else null
                ereignis(kopf.optString("type"), daten, nutz)
            }
        } catch (e: Exception) {
            if (verbindung === k) fehler = "Verbindung: $e"
        } finally {
            if (verbindung === k) {
                trennen()
                zustand = if (an) "wartet auf Home Assistant" else "aus"
            }
        }
    }

    private fun senden(typ: String, daten: JSONObject? = null, nutz: ByteArray? = null, bis: Int = nutz?.size ?: 0) {
        val o = aus ?: return
        val d = daten?.toString()?.toByteArray(Charsets.UTF_8)
        val kopf = JSONObject().put("type", typ).put("version", WYOMING_VERSION)
        if (d != null) kopf.put("data_length", d.size)
        if (nutz != null) kopf.put("payload_length", bis)
        synchronized(schreibSperre) {
            try {
                o.write((kopf.toString() + "\n").toByteArray(Charsets.UTF_8))
                if (d != null) o.write(d)
                if (nutz != null) o.write(nutz, 0, bis)
                o.flush()
            } catch (e: Exception) {
                fehler = "Senden: $e"
                trennen()
            }
        }
    }

    private fun ereignis(typ: String, d: JSONObject, nutz: ByteArray?) {
        when (typ) {
            "describe" -> senden("info", info())
            "ping" -> senden("pong", JSONObject().put("text", d.optString("text")))
            "run-satellite" -> streamStarten()
            "pause-satellite" -> { streamt = false; zustand = "pausiert" }
            "detection" -> { weckwoerter++; zustand = "hört zu"; Thread({ ton() }, "assist-ton").start() }
            "voice-started" -> zustand = "hört zu"
            "voice-stopped" -> zustand = "denkt nach"
            "transcript" -> letzterText = d.optString("text")
            "synthesize" -> letzteAntwort = d.optString("text")
            "audio-start" -> spurOeffnen(d.optInt("rate", 22050), d.optInt("width", 2), d.optInt("channels", 1))
            "audio-chunk" -> if (nutz != null) spurSchreiben(d, nutz)
            "audio-stop" -> { spurBeenden(); senden("played"); zustand = "wartet auf Weckwort" }
            "error" -> { fehler = "HA: ${d.optString("text")}"; zustand = "wartet auf Weckwort" }
            else -> {}
        }
    }

    private fun info(): JSONObject = JSONObject()
        .put("asr", org.json.JSONArray()).put("tts", org.json.JSONArray()).put("handle", org.json.JSONArray())
        .put("intent", org.json.JSONArray()).put("wake", org.json.JSONArray())
        .put("satellite", JSONObject()
            .put("name", "Yapaia Radio")
            .put("attribution", JSONObject().put("name", "Yapaia").put("url", "https://github.com/Yapaia"))
            .put("installed", true)
            .put("description", "Sprachsatellit im Autoradio")
            .put("version", try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName } catch (_: Exception) { "?" })
            .put("area", JSONObject.NULL)
            .put("has_vad", false)
            .put("active_wake_words", org.json.JSONArray())
            .put("max_active_wake_words", 1)
            .put("supports_trigger", false))

    // ── Mikrofon ────────────────────────────────────────────────────────────

    private fun streamStarten() {
        if (streamt && mikroFaden?.isAlive == true) return
        if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            fehler = "RECORD_AUDIO fehlt"
            return
        }
        streamt = true
        // Pipeline ab dem Weckwort (openWakeWord in HA), bis zur Sprachausgabe; HA startet sie immer neu
        senden("run-pipeline", JSONObject()
            .put("start_stage", "wake").put("end_stage", "tts").put("restart_on_end", true)
            .put("snd_format", JSONObject().put("rate", TTS_RATE).put("width", 2).put("channels", 1)))
        mikroFaden = Thread({ mikroSchleife() }, "assist-mikro").also { it.start() }
    }

    @SuppressLint("MissingPermission")
    private fun mikroSchleife() {
        aktiv = true
        zustand = "wartet auf Weckwort"
        var r: AudioRecord? = null
        var ns: NoiseSuppressor? = null
        var agc: AutomaticGainControl? = null
        try {
            val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val src = when (quelle) {
                "mic" -> MediaRecorder.AudioSource.MIC
                "erkennung" -> MediaRecorder.AudioSource.VOICE_RECOGNITION
                "unprocessed" -> MediaRecorder.AudioSource.UNPROCESSED
                "gespraech" -> MediaRecorder.AudioSource.VOICE_COMMUNICATION
                else -> MediaRecorder.AudioSource.CAMCORDER
            }
            r = AudioRecord(src, RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, maxOf(min, RATE))
            audio.getDevices(AudioManager.GET_DEVICES_INPUTS)
                .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC && it.address == mikro }
                ?.let { r.setPreferredDevice(it) }
            if (rauschfilter) {
                if (NoiseSuppressor.isAvailable()) ns = NoiseSuppressor.create(r.audioSessionId)?.also { it.enabled = true }
                if (AutomaticGainControl.isAvailable()) agc = AutomaticGainControl.create(r.audioSessionId)?.also { it.enabled = true }
            }
            val proben = ShortArray(CHUNK)
            val bytes = ByteArray(CHUNK * 2)
            r.startRecording()
            val start = System.currentTimeMillis()
            senden("audio-start", format().put("timestamp", 0))
            var pegelSumme = 0.0
            var pegelN = 0
            while (streamt && aus != null) {
                val k = r.read(proben, 0, CHUNK)
                if (k <= 0) throw IllegalStateException("AudioRecord.read = $k")
                val g = verstaerkung
                for (i in 0 until k) {
                    val v = (proben[i] * g).toInt().coerceIn(-32768, 32767)
                    bytes[2 * i] = (v and 0xff).toByte()
                    bytes[2 * i + 1] = ((v shr 8) and 0xff).toByte()
                    pegelSumme += v.toDouble() * v
                }
                pegelN += k
                if (pegelN >= RATE) {
                    val rms = kotlin.math.sqrt(pegelSumme / pegelN)
                    pegelDb = if (rms <= 0) -96.0 else Math.round(20 * kotlin.math.log10(rms / 32768.0) * 10) / 10.0
                    pegelSumme = 0.0; pegelN = 0
                }
                senden("audio-chunk", format().put("timestamp", System.currentTimeMillis() - start), bytes, k * 2)
            }
            senden("audio-stop", JSONObject().put("timestamp", System.currentTimeMillis() - start))
        } catch (e: Exception) {
            fehler = "Mikro: $e"
            Log.w(TAG, "Mikro", e)
        } finally {
            try { r?.stop() } catch (_: Exception) {}
            r?.release()
            ns?.release()
            agc?.release()
            aktiv = false
            streamt = false
        }
    }

    private fun format() = JSONObject().put("rate", RATE).put("width", 2).put("channels", 1)

    // ── Wiedergabe ──────────────────────────────────────────────────────────

    private fun spurOeffnen(rate: Int, breite: Int, kanaele: Int) {
        spurSchliessen()
        zustand = "spricht"
        val kanal = if (kanaele == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
        val enc = if (breite == 1) AudioFormat.ENCODING_PCM_8BIT else AudioFormat.ENCODING_PCM_16BIT
        val min = AudioTrack.getMinBufferSize(rate, kanal, enc)
        spur = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setChannelMask(kanal).setEncoding(enc).build())
            .setBufferSizeInBytes(maxOf(min, rate * breite * kanaele / 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build().also { it.play() }
        spurFrames = 0
        spurBytesProFrame = breite * kanaele
    }

    private fun spurSchreiben(d: JSONObject, nutz: ByteArray) {
        if (spur == null) spurOeffnen(d.optInt("rate", 22050), d.optInt("width", 2), d.optInt("channels", 1))
        try {
            val n = spur?.write(nutz, 0, nutz.size) ?: 0
            if (n > 0) spurFrames += n / spurBytesProFrame
        } catch (e: Exception) { fehler = "Wiedergabe: $e" }
    }

    private fun spurBeenden() {
        val s = spur ?: return
        spur = null
        try {
            // 300 ms Stille hinterher, damit auch der Verstärker das Ende ausspielt
            val stille = ByteArray(s.sampleRate * spurBytesProFrame * 3 / 10)
            val n = s.write(stille, 0, stille.size)
            if (n > 0) spurFrames += n / spurBytesProFrame
            // warten, bis wirklich alles abgespielt ist (stop() + release() schneidet sonst ab)
            val bis = System.currentTimeMillis() + 15_000
            while (System.currentTimeMillis() < bis &&
                (s.playbackHeadPosition.toLong() and 0xffffffffL) < spurFrames) Thread.sleep(20)
            s.stop()
        } catch (_: Exception) {}
        s.release()
    }

    private fun spurSchliessen() {
        val s = spur ?: return
        spur = null
        try { s.pause(); s.flush() } catch (_: Exception) {}
        s.release()
    }

    /** Kurzer Doppelton: Weckwort erkannt. */
    private fun ton() {
        val rate = 22050
        val n = rate * 18 / 100
        val p = ShortArray(n)
        for (i in 0 until n) {
            val f = if (i < n / 2) 880.0 else 1320.0
            val huelle = minOf(1.0, minOf(i, n - i) / (rate * 0.01))
            p[i] = (sin(2 * PI * f * i / rate) * 9000 * huelle).toInt().toShort()
        }
        try {
            val t = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAudioFormat(AudioFormat.Builder().setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                .setBufferSizeInBytes(n * 2).setTransferMode(AudioTrack.MODE_STATIC).build()
            t.write(p, 0, n)
            t.play()
            Thread.sleep(400)
            t.release()
        } catch (_: Exception) {}
    }

    // ── HTTP ────────────────────────────────────────────────────────────────

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        if (rest != "einstellen") return false
        val p = anfrage.parameter
        val e = einstellungen.edit()
        p["mikro"]?.let { mikro = it; e.putString("mikro", it) }
        p["verstaerkung"]?.toFloatOrNull()?.let { verstaerkung = it.coerceIn(0.5f, 16f); e.putFloat("verstaerkung", verstaerkung) }
        p["rauschfilter"]?.let { rauschfilter = it == "1" || it == "true"; e.putBoolean("rauschfilter", rauschfilter) }
        p["quelle"]?.let { quelle = it; e.putString("quelle", it) }
        p["an"]?.let {
            an = it == "1" || it == "true"
            e.putBoolean("an", an)
            if (an) serverStarten() else serverStoppen()
        }
        e.apply()
        // Mikro-Einstellungen gelten beim nächsten Start des Streams: neu starten
        if (streamt && (p.containsKey("mikro") || p.containsKey("rauschfilter") || p.containsKey("quelle"))) {
            streamt = false
            Thread({ Thread.sleep(300); if (aus != null) streamStarten() }, "assist-neu").start()
        }
        antwort.text(200, status().toString(2) + "\n", "application/json")
        return true
    }

    override fun status(): JSONObject = JSONObject()
        .put("an", an)
        .put("zustand", zustand)
        .put("verbunden", verbindung?.inetAddress?.hostAddress ?: JSONObject.NULL)
        .put("streamt", streamt)
        .put("mikro", mikro)
        .put("verstaerkung", verstaerkung.toDouble())
        .put("rauschfilter", rauschfilter)
        .put("quelle", quelle)
        .put("pegel_db", pegelDb)
        .put("weckwoerter", weckwoerter)
        .put("letzter_text", letzterText ?: JSONObject.NULL)
        .put("letzte_antwort", letzteAntwort ?: JSONObject.NULL)
        .put("fehler", fehler ?: JSONObject.NULL)

    companion object {
        const val TAG = "YapaiaAssist"
        const val PORT = 10700
        const val RATE = 16000
        const val TTS_RATE = 22050
        const val CHUNK = 1024
        const val WYOMING_VERSION = "1.5.4"
        /** Mikro gerade vom Satelliten belegt (die Pegel-Dauermessung pausiert dann). */
        @Volatile var aktiv = false
    }
}
