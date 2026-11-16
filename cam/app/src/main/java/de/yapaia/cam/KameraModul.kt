package de.yapaia.cam

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Paint
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.util.Size
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Kamerastreams für Home Assistant.
 *
 * Eonon/Witstek: Kamera 1 ist der Videowandler TP9951 mit vier Eingängen
 * (Datei `mhl_camera_input`, 0–3). Er zeigt **immer nur einen Eingang**;
 * umschalten geht nur bei geschlossener Kamera (sonst Fehler DEVICE).
 *
 * Wer bekommt den Wandler?
 * - der zuletzt geöffnete, noch laufende MJPEG-Strom;
 * - sonst ein Einzelbild-Wunsch (`.jpg`), der nicht aus dem Zwischenspeicher
 *   bedient werden kann;
 * - sonst, wenn alles ruht, die Signalsuche (alle [SUCHE_ALLE] ms jeder Eingang kurz).
 * Andere Ströme bekommen ihr letztes Bild abgedunkelt mit Hinweis
 * („Standbild“) bzw. einen Platzhalter.
 *
 * Öffnet die Hersteller-App (Rückwärtsgang) die Kamera, verdrängt sie uns;
 * sobald sie sie freigibt, geht es weiter. Kamera 0 wird nie geöffnet.
 */
class KameraModul(private val ctx: Context) : Modul {

    override val name = "kamera"

    private val manager = ctx.getSystemService(CameraManager::class.java)
    private val steuerFaden = HandlerThread("kamera").apply { start() }
    private val steuer = Handler(steuerFaden.looper)
    private val bildFaden = HandlerThread("bild").apply { start() }
    private val bildHandler = Handler(bildFaden.looper)
    private val einstellungen = ctx.getSharedPreferences("dienst_kamera", Context.MODE_PRIVATE)
    private val eingangDatei = File("/sys/kernel/mhl_camera_config/mhl_camera_input")
    private val kameraId = "1"
    private val anzahl get() = if (eingangDatei.exists()) 4 else 1
    private val wandler = Bildwandler()

    /** Ein Bild eines Eingangs. */
    class Bild(val jpeg: ByteArray, val zeit: Long, val nr: Long)

    private class Strom(val eingang: Int, val beginn: Long)

    private val sperre = Object()
    // Alles unten nur unter [sperre] ändern.
    private val bilder = arrayOfNulls<Bild>(4)
    private val signal = arrayOfNulls<Boolean>(4)
    private val geprueft = LongArray(4)
    private val helligkeit = DoubleArray(4)
    private val streuung = DoubleArray(4)
    private val stroeme = mutableListOf<Strom>()
    private var bildNr = 0L

    @Volatile private var darstellung = darstellungLaden()
    @Volatile private var rohWunsch = false
    @Volatile private var rohBild: Bild? = null

    // Zustand der Kamera (nur im Steuerfaden)
    private var geraet: CameraDevice? = null
    private var sitzung: CameraCaptureSession? = null
    private var yuvLeser: ImageReader? = null
    private var jpegLeser: ImageReader? = null
    @Volatile private var offenerEingang = -1
    private var wunsch = -1
    private var oeffnetSeit = 0L
    @Volatile private var belegt = false
    @Volatile private var pausiert = false
    private var pauseBis = 0L
    @Volatile private var fehler: String? = null
    @Volatile private var letzteNachfrage = 0L
    @Volatile private var einzelWunsch = -1
    @Volatile private var einzelWunschZeit = 0L
    private var suche: MutableList<Int>? = null
    private var sucheSeit = 0L
    private var letzteSuche = 0L
    @Volatile private var sucheAngefordert = true

    // fps
    @Volatile private var bilderSeitOeffnen = 0
    private var zaehler = 0
    @Volatile private var fps = 0
    private var fpsZeit = 0L
    private var letzteKodierung = 0L

    private val verfuegbarkeit = object : CameraManager.AvailabilityCallback() {
        override fun onCameraAvailable(id: String) {
            if (id == kameraId && belegt) {
                belegt = false
                steuer.postDelayed({ steuern() }, 1000)
            }
        }
    }

    override fun starten() {
        manager.registerAvailabilityCallback(verfuegbarkeit, steuer)
        steuer.post(takt)
    }

    override fun stoppen() {
        steuer.removeCallbacks(takt)
        manager.unregisterAvailabilityCallback(verfuegbarkeit)
        steuer.post { schliessen() }
    }

    override fun befehl(aktion: String) {
        when (aktion) {
            // Die Vorschau-Activity braucht die Kamera selbst
            YapaiaDienst.PAUSE -> { pausiert = true; steuer.post { steuern() } }
            YapaiaDienst.WEITER -> { pausiert = false; pauseBis = SystemClock.elapsedRealtime() + 1500; steuer.post { steuern() } }
        }
    }

    // ── Steuerung ───────────────────────────────────────────────────────────

    private val takt = object : Runnable {
        override fun run() {
            steuern()
            steuer.postDelayed(this, 500)
        }
    }

    /** Welcher Eingang soll offen sein? Läuft im Steuerfaden. */
    private fun steuern() {
        val jetzt = SystemClock.elapsedRealtime()
        if (jetzt - fpsZeit >= 1000) { fps = zaehler; zaehler = 0; fpsZeit = jetzt }
        val stromEingang = synchronized(sperre) { stroeme.maxByOrNull { it.beginn }?.eingang }
        if (stromEingang != null || (einzelWunsch >= 0 && jetzt - einzelWunschZeit < 6000)) suche = null

        // Signalsuche: wenn alles ruht, jeden Eingang kurz ansehen
        val ruhig = stromEingang == null && jetzt - letzteNachfrage > RUHE_MS && einzelWunsch < 0
        if (suche == null && ruhig && !pausiert && !belegt && (sucheAngefordert || jetzt - letzteSuche > SUCHE_ALLE)) {
            sucheAngefordert = false
            suche = (0 until anzahl).toMutableList()
            sucheSeit = jetzt
        }
        suche?.let { s ->
            val e = s.firstOrNull()
            if (e == null) {
                suche = null
                letzteSuche = jetzt
            } else if (offenerEingang == e && bilderSeitOeffnen >= 12 || jetzt - sucheSeit > 7000) {
                if (offenerEingang != e || bilderSeitOeffnen == 0) synchronized(sperre) { signal[e] = false; geprueft[e] = System.currentTimeMillis() }
                s.removeAt(0)
                sucheSeit = jetzt
                if (s.isEmpty()) { suche = null; letzteSuche = jetzt }
            }
        }
        if (einzelWunsch >= 0 && jetzt - einzelWunschZeit >= 6000) einzelWunsch = -1

        val ziel = when {
            pausiert || jetzt < pauseBis -> -1
            stromEingang != null -> stromEingang
            einzelWunsch >= 0 -> einzelWunsch
            suche != null -> suche!!.first()
            // kurz offen halten, falls gleich wieder jemand fragt
            offenerEingang >= 0 && jetzt - letzteNachfrage < OFFEN_HALTEN_MS -> offenerEingang
            else -> -1
        }
        if (ziel == wunsch && (ziel < 0 || geraet != null || jetzt - oeffnetSeit < 5000)) return
        if (ziel >= 0 && (belegt || jetzt < pauseBis)) {
            if (geraet != null) schliessen()
            wunsch = -1
            return
        }
        // umschalten: erst schließen, dann Eingang setzen, dann öffnen
        schliessen()
        wunsch = ziel
        if (ziel >= 0) {
            oeffnetSeit = jetzt
            steuer.postDelayed({ if (wunsch == ziel && geraet == null) oeffnen(ziel) }, 400)
        }
    }

    private fun oeffnen(e: Int) {
        if (ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            fehler = "CAMERA permission"
            return
        }
        if (eingangDatei.exists()) {
            try { eingangDatei.writeText(e.toString()) } catch (x: Exception) { fehler = "input: ${x.message}" }
        }
        bilderSeitOeffnen = 0
        try {
            manager.openCamera(kameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(d: CameraDevice) {
                    if (wunsch != e) { d.close(); return }
                    geraet = d
                    offenerEingang = e
                    fehler = null
                    sitzungStarten(d, e)
                }
                override fun onDisconnected(d: CameraDevice) {
                    // andere App (Rückwärtsgang, Vorschau) hat die Kamera genommen
                    d.close()
                    if (geraet == d) { geraet = null; offenerEingang = -1; wunsch = -1 }
                    belegt = true
                    fehler = "disconnected"
                }
                override fun onError(d: CameraDevice, code: Int) {
                    d.close()
                    if (geraet == d || geraet == null) { geraet = null; offenerEingang = -1; wunsch = -1 }
                    fehler = "error $code"
                    if (code == ERROR_CAMERA_IN_USE || code == ERROR_MAX_CAMERAS_IN_USE) belegt = true
                    else pauseBis = SystemClock.elapsedRealtime() + 3000
                }
            }, steuer)
        } catch (x: Exception) {
            fehler = x.message ?: x.javaClass.simpleName
            wunsch = -1
            pauseBis = SystemClock.elapsedRealtime() + 3000
        }
    }

    private fun sitzungStarten(d: CameraDevice, e: Int) {
        val yuv = ImageReader.newInstance(VORSCHAU.width, VORSCHAU.height, ImageFormat.YUV_420_888, 3)
        yuvLeser = yuv
        yuv.setOnImageAvailableListener({ r -> bildDa(r, e) }, bildHandler)
        // Wie die Hersteller-App: zusätzlich ein großer JPEG-Strom, der nie
        // abgeholt wird – erst damit liefert der Wandler ein ganzes Bild.
        val flaechen = mutableListOf(yuv.surface)
        jpegGroesse()?.let {
            val j = ImageReader.newInstance(it.width, it.height, ImageFormat.JPEG, 1)
            jpegLeser = j
            flaechen += j.surface
        }
        try {
            @Suppress("DEPRECATION")
            d.createCaptureSession(flaechen, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) {
                    if (geraet != d) { s.close(); return }
                    sitzung = s
                    try {
                        val a = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
                        a.addTarget(yuv.surface)
                        s.setRepeatingRequest(a.build(), null, steuer)
                    } catch (x: Exception) {
                        fehler = x.message
                    }
                }
                override fun onConfigureFailed(s: CameraCaptureSession) {
                    fehler = "session"
                    schliessen()
                    wunsch = -1
                    pauseBis = SystemClock.elapsedRealtime() + 3000
                }
            }, steuer)
        } catch (x: Exception) {
            fehler = x.message
        }
    }

    private fun jpegGroesse(): Size? = try {
        manager.getCameraCharacteristics(kameraId).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.JPEG)?.maxByOrNull { it.width * it.height }
    } catch (x: Exception) {
        null
    }

    private fun schliessen() {
        try { sitzung?.close() } catch (_: Exception) {}
        try { geraet?.close() } catch (_: Exception) {}
        sitzung = null
        geraet = null
        offenerEingang = -1
        val y = yuvLeser
        val j = jpegLeser
        yuvLeser = null
        jpegLeser = null
        // Leser erst schließen, wenn der Bildfaden fertig ist
        bildHandler.post {
            try { y?.close() } catch (_: Exception) {}
            try { j?.close() } catch (_: Exception) {}
        }
    }

    /** Neues Kamerabild (Bildfaden). */
    private fun bildDa(r: ImageReader, e: Int) {
        val img = try { r.acquireLatestImage() } catch (x: Exception) { null } ?: return
        try {
            zaehler++
            val n = ++bilderSeitOeffnen
            if (n <= 3 || offenerEingang != e) return
            val jetzt = SystemClock.elapsedRealtime()
            if (rohWunsch) {
                rohWunsch = false
                val j = Bildwandler().umwandeln(img, Darstellung.ROH, false)
                rohBild = Bild(j, jetzt, 0)
                synchronized(sperre) { sperre.notifyAll() }
            }
            if (jetzt - letzteKodierung < 1000 / MAX_FPS) return
            letzteKodierung = jetzt
            val messen = n % 5 == 4
            val jpeg = wandler.umwandeln(img, darstellung, messen)
            synchronized(sperre) {
                bilder[e] = Bild(jpeg, jetzt, ++bildNr)
                if (messen) {
                    helligkeit[e] = wandler.helligkeit
                    streuung[e] = wandler.streuung
                    signal[e] = wandler.streuung >= SIGNAL_STREUUNG || wandler.helligkeit >= SIGNAL_HELLIGKEIT
                    geprueft[e] = System.currentTimeMillis()
                }
                sperre.notifyAll()
            }
        } catch (x: Exception) {
            Log.w(WebServer.TAG, "Bild: $x")
        } finally {
            img.close()
        }
    }

    // ── HTTP ────────────────────────────────────────────────────────────────

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        val m = Regex("""(\d)\.(jpg|jpeg|mjpg|mjpeg)""").matchEntire(rest)
        if (m != null) {
            val e = m.groupValues[1].toInt() - 1
            if (e !in 0 until anzahl) return false
            if (m.groupValues[2].startsWith("mj")) strom(e, antwort) else einzelbild(e, antwort)
            return true
        }
        when (rest) {
            "roh.jpg" -> roh(antwort)
            "suchen" -> { sucheAngefordert = true; letzteNachfrage = 0; antwort.text(200, "ok\n") }
            "einstellen" -> einstellen(anfrage, antwort)
            else -> return false
        }
        return true
    }

    private fun nachfrage() {
        letzteNachfrage = SystemClock.elapsedRealtime()
    }

    /** Aktuelles Bild von e, wenn e gerade offen ist und Bilder liefert. */
    private fun frisch(e: Int, aelterAls: Long = 0): Bild? {
        val b = bilder[e] ?: return null
        val jetzt = SystemClock.elapsedRealtime()
        return if (offenerEingang == e && jetzt - b.zeit < 1500 && b.nr > aelterAls) b else null
    }

    private fun einzelbild(e: Int, antwort: Antwort) {
        nachfrage()
        val anderer = synchronized(sperre) { stroeme.maxByOrNull { it.beginn }?.eingang }
        var b = synchronized(sperre) { frisch(e) }
        if (b == null && (anderer == null || anderer == e)) {
            val alt = synchronized(sperre) { bilder[e] }
            if (alt != null && SystemClock.elapsedRealtime() - alt.zeit < ZWISCHENSPEICHER_MS) {
                b = alt
            } else {
                einzelWunsch = e
                einzelWunschZeit = SystemClock.elapsedRealtime()
                steuer.post { steuern() }
                b = warten(e, -1, 6000)
            }
        }
        antwort.senden(200, "image/jpeg", b?.jpeg ?: platzhalter(e))
    }

    private fun strom(e: Int, antwort: Antwort) {
        val s = Strom(e, SystemClock.elapsedRealtime())
        synchronized(sperre) { stroeme += s }
        nachfrage()
        steuer.post { steuern() }
        try {
            antwort.kopf(200, "multipart/x-mixed-replace; boundary=$GRENZE")
            var letzte = -1L
            var gesendet = 0L
            while (true) {
                val b = warten(e, letzte, 1000)
                nachfrage()
                val jetzt = SystemClock.elapsedRealtime()
                if (b != null) {
                    teil(antwort, b.jpeg)
                    letzte = b.nr
                    gesendet = jetzt
                } else if (jetzt - gesendet >= 1000) {
                    teil(antwort, platzhalter(e))
                    gesendet = jetzt
                }
            }
        } finally {
            synchronized(sperre) { stroeme -= s }
            steuer.post { steuern() }
        }
    }

    private fun teil(antwort: Antwort, jpeg: ByteArray) {
        val o = antwort.strom
        o.write("--$GRENZE\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.size}\r\n\r\n".toByteArray())
        o.write(jpeg)
        o.write("\r\n".toByteArray())
        o.flush()
    }

    /** Auf ein neues Bild von e warten (nur wenn e offen ist). */
    private fun warten(e: Int, nachNr: Long, ms: Long): Bild? {
        val ende = SystemClock.elapsedRealtime() + ms
        synchronized(sperre) {
            while (true) {
                frisch(e, nachNr)?.let { return it }
                val rest = ende - SystemClock.elapsedRealtime()
                if (rest <= 0) return null
                sperre.wait(rest)
            }
        }
    }

    private fun roh(antwort: Antwort) {
        nachfrage()
        rohBild = null
        rohWunsch = true
        val ende = SystemClock.elapsedRealtime() + 3000
        synchronized(sperre) {
            while (rohBild == null && SystemClock.elapsedRealtime() < ende) sperre.wait(200)
        }
        val b = rohBild
        if (b == null) antwort.text(503, "no frame – open a stream first\n") else antwort.senden(200, "image/jpeg", b.jpeg)
    }

    /** Darstellung ändern, z. B. `/kamera/einstellen?haelfte=1&drehung=0&spiegelny=1`. */
    private fun einstellen(a: Anfrage, antwort: Antwort) {
        val p = a.parameter
        fun zahl(k: String, alt: Int) = p[k]?.toIntOrNull() ?: alt
        fun ja(k: String, alt: Boolean) = p[k]?.let { it == "1" || it == "true" } ?: alt
        val d = darstellung
        val neu = if (p.containsKey("standard")) Darstellung() else Darstellung(
            haelfte = zahl("haelfte", d.haelfte), drehung = zahl("drehung", d.drehung),
            spiegelnX = ja("spiegelnx", d.spiegelnX), spiegelnY = ja("spiegelny", d.spiegelnY),
            breite = zahl("breite", d.breite).coerceIn(64, 1920), hoehe = zahl("hoehe", d.hoehe).coerceIn(64, 1920),
            qualitaet = zahl("qualitaet", d.qualitaet).coerceIn(20, 100),
        )
        darstellung = neu
        einstellungen.edit().putString("darstellung", neu.json().toString()).apply()
        synchronized(sperre) { platzhalterSpeicher.clear() }
        antwort.text(200, neu.json().toString(2) + "\n", "application/json")
    }

    private fun darstellungLaden(): Darstellung = try {
        val j = JSONObject(einstellungen.getString("darstellung", null) ?: "{}")
        val s = Darstellung()
        Darstellung(
            j.optInt("haelfte", s.haelfte), j.optInt("drehung", s.drehung),
            j.optBoolean("spiegelnx", s.spiegelnX), j.optBoolean("spiegelny", s.spiegelnY),
            j.optInt("breite", s.breite), j.optInt("hoehe", s.hoehe), j.optInt("qualitaet", s.qualitaet),
        )
    } catch (x: Exception) {
        Darstellung()
    }

    // ── Platzhalter ─────────────────────────────────────────────────────────

    private val platzhalterSpeicher = HashMap<String, ByteArray>()

    /** Letztes Bild abgedunkelt mit Hinweis, oder ein grauer Platzhalter. */
    private fun platzhalter(e: Int): ByteArray {
        val (b, grund) = synchronized(sperre) {
            val anderer = stroeme.maxByOrNull { it.beginn }?.eingang
            val g = when {
                pausiert -> ctx.getString(R.string.platzhalter_pause)
                belegt -> ctx.getString(R.string.platzhalter_belegt)
                anderer != null && anderer != e -> ctx.getString(R.string.platzhalter_anderer, anderer + 1)
                signal[e] == false -> ctx.getString(R.string.platzhalter_kein_signal)
                else -> ctx.getString(R.string.platzhalter_warte)
            }
            Pair(bilder[e], g)
        }
        val k = "$e/${b?.nr}/$grund"
        synchronized(sperre) { platzhalterSpeicher[k]?.let { return it } }
        val d = darstellung
        val w = d.breite
        val h = d.hoehe
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(24, 24, 24))
        val zeilen = mutableListOf(ctx.getString(R.string.platzhalter_eingang, e + 1), grund)
        if (b != null) {
            BitmapFactory.decodeByteArray(b.jpeg, 0, b.jpeg.size)?.let {
                c.drawBitmap(it, null, android.graphics.Rect(0, 0, w, h), null)
                it.recycle()
            }
            c.drawColor(Color.argb(150, 0, 0, 0))
            val alter = System.currentTimeMillis() - (SystemClock.elapsedRealtime() - b.zeit)
            zeilen += ctx.getString(R.string.platzhalter_standbild, SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(Date(alter)))
        }
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = h / 14f; textAlign = Paint.Align.CENTER }
        val zh = p.textSize * 1.4f
        var y = h / 2f - (zeilen.size - 1) * zh / 2 + p.textSize / 3
        for (z in zeilen) { c.drawText(z, w / 2f, y, p); y += zh }
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 75, out)
        bmp.recycle()
        val j = out.toByteArray()
        synchronized(sperre) {
            if (platzhalterSpeicher.size > 32) platzhalterSpeicher.clear()
            platzhalterSpeicher[k] = j
        }
        return j
    }

    // ── Status ──────────────────────────────────────────────────────────────

    override fun status(): JSONObject = synchronized(sperre) {
        val jetzt = SystemClock.elapsedRealtime()
        val eing = JSONArray()
        for (e in 0 until anzahl) {
            eing.put(JSONObject()
                .put("eingang", e + 1)
                .put("signal", signal[e] ?: JSONObject.NULL)
                .put("helligkeit", Math.round(helligkeit[e]))
                .put("streuung", Math.round(streuung[e] * 10) / 10.0)
                .put("geprueft", if (geprueft[e] > 0) iso(geprueft[e]) else JSONObject.NULL)
                .put("bild_alter_s", bilder[e]?.let { (jetzt - it.zeit) / 1000 } ?: JSONObject.NULL)
                .put("streams", stroeme.count { it.eingang == e }))
        }
        JSONObject()
            .put("aktiver_eingang", if (offenerEingang >= 0) offenerEingang + 1 else JSONObject.NULL)
            .put("fps", if (offenerEingang >= 0) fps else 0)
            .put("belegt", belegt)
            .put("pausiert", pausiert)
            .put("suche", suche != null)
            .put("letzte_suche_vor_s", if (letzteSuche > 0) (jetzt - letzteSuche) / 1000 else JSONObject.NULL)
            .put("fehler", fehler ?: JSONObject.NULL)
            .put("eingaenge", eing)
            .put("darstellung", darstellung.json())
    }

    private fun iso(ms: Long) = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT).format(Date(ms))

    companion object {
        val VORSCHAU = Size(720, 600)
        const val GRENZE = "yapaiarahmen"
        const val MAX_FPS = 15
        /** So lange bleibt die Kamera nach der letzten Anfrage offen. */
        const val OFFEN_HALTEN_MS = 20_000L
        /** Erst so lange nach der letzten Anfrage darf die Signalsuche laufen. */
        const val RUHE_MS = 60_000L
        const val SUCHE_ALLE = 10 * 60_000L
        /** Einzelbilder anderer Eingänge so lange aus dem Zwischenspeicher. */
        const val ZWISCHENSPEICHER_MS = 30_000L
        const val SIGNAL_STREUUNG = 6.0
        const val SIGNAL_HELLIGKEIT = 200.0
    }
}
