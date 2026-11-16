package de.yapaia.cam

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Size
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Yapaia Cam – zeigt die Kameras des Autoradios (Camera2) und hilft beim
 * Herausfinden, mit welcher Kamera und Auflösung ein Bild kommt.
 *
 * Bedienung: „Kamera“ schaltet zur nächsten Kamera, „Auflösung“ zur nächsten
 * Vorschaugröße, „Info“ listet alles, was Android über die Kameras meldet.
 * Tippen aufs Bild blendet die Leiste aus und ein. Die Wahl wird gemerkt.
 * Startbar auch mit Extra „kamera“ (Kamera-ID), z. B. per Intent aus HA.
 */
class MainActivity : Activity() {

    private lateinit var manager: CameraManager
    private lateinit var wurzel: FrameLayout
    private lateinit var bild: TextureView
    private lateinit var leiste: LinearLayout
    private lateinit var status: TextView
    private lateinit var infoRahmen: ScrollView
    private lateinit var info: TextView

    private val ui = Handler(Looper.getMainLooper())
    private var faden: HandlerThread? = null
    private var hinter: Handler? = null

    private var kameras: List<String> = emptyList()
    private var kameraNr = 0
    private var groessen: List<Size> = emptyList()
    private var groesseNr = 0

    private var geraet: CameraDevice? = null
    private var sitzung: CameraCaptureSession? = null
    private var bilderZaehler = 0
    private var fehlerText: String? = null
    /** Suchlauf: so viele Auflösungen noch probieren (0 = aus). */
    private var suchlauf = 0
    private var schlechteSekunden = 0

    /**
     * Eonon/Witstek-Radios: Kamera 1 ist ein Videowandler (TP9951) mit vier
     * Eingängen, gewählt über eine Datei im Kernel. Geschrieben wird 0–3
     * (der Kernel zählt intern +1). Im Wohnmobil: Eingang 2 = vorne,
     * Eingang 3 = Rückfahrkamera. Kamera 0 bringt den Kameradienst zum Absturz.
     */
    private val eingangDatei = java.io.File("/sys/kernel/mhl_camera_config/mhl_camera_input")
    private val hatEingaenge get() = eingangDatei.exists()
    private var eingang: Int
        get() = einstellungen.getInt("eingang", 2)
        set(wert) { einstellungen.edit().putInt("eingang", wert).apply() }
    private var eingangFehler: String? = null

    private val einstellungen by lazy { getSharedPreferences("wahl", MODE_PRIVATE) }
    private val aktualisierung by lazy { Aktualisierung(this) }
    // Empfänger auf dem Mini-PC: gleicher Rechner wie Home Assistant, Port 8765
    private val diagnose by lazy {
        Diagnose(this) { android.net.Uri.parse(aktualisierung.adresse).host.let { "http://$it:8765/" } }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        manager = getSystemService(CAMERA_SERVICE) as CameraManager
        oberflaecheBauen()

        val gelistet = try { manager.cameraIdList.toList() } catch (e: Exception) { emptyList() }
        // Manche Radios führen die Cinch-Kamera unter einer ID, die nicht in der Liste steht.
        val versteckt = (0..9).map { it.toString() }.filter { id ->
            id !in gelistet && try { manager.getCameraCharacteristics(id); true } catch (e: Exception) { false }
        }
        kameras = gelistet + versteckt
        darstellungUebernehmen(intent)
        if (intent.hasExtra("eingang")) eingang = intent.getIntExtra("eingang", 2).coerceIn(0, 3)
        val gewuenscht = intent.getStringExtra("kamera") ?: einstellungen.getString("kamera", null)
            ?: if (hatEingaenge) "1" else null
        kameraNr = kameras.indexOf(gewuenscht).coerceAtLeast(0)
        info.text = kameraInfo()
        if (intent.action == Aktualisierung.AKTION) aktualisierung.ergebnis(intent)
    }

    /** Darstellung per Extras (zum Ausprobieren per ADB), wird gemerkt. */
    private fun darstellungUebernehmen(i: Intent) {
        val e = einstellungen.edit()
        for (k in listOf("voll", "spiegeln", "spiegelnx", "haelfte")) if (i.hasExtra(k)) e.putBoolean(k, i.getBooleanExtra(k, false))
        if (i.hasExtra("drehung")) e.putInt("drehung", i.getIntExtra("drehung", 0))
        e.apply()
        bildEinpassen()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        darstellungUebernehmen(intent)
        if (intent.action == Aktualisierung.AKTION) aktualisierung.ergebnis(intent)
    }

    private fun oberflaecheBauen() {
        wurzel = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        bild = TextureView(this)
        wurzel.addView(bild, FrameLayout.LayoutParams(1, 1, Gravity.CENTER))
        wurzel.setOnClickListener { leisteUmschalten() }
        bild.setOnClickListener { leisteUmschalten() }

        status = TextView(this).apply { textSize = 18f; setPadding(16, 8, 16, 8) }
        leiste = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            // halbdurchsichtig, damit man das Bild dahinter noch sieht
            setBackgroundColor(Color.argb(160, 0, 0, 0))
            addView(knopf(R.string.knopf_kamera) { naechsteKamera() })
            if (hatEingaenge) addView(knopf(R.string.knopf_eingang) { naechsterEingang() })
            addView(knopf(R.string.knopf_aufloesung) { naechsteGroesse() })
            addView(knopf(R.string.knopf_suchlauf) { suchlaufStarten() })
            addView(knopf(R.string.knopf_info) {
                infoRahmen.visibility = if (infoRahmen.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            })
            addView(knopf(R.string.knopf_update) { aktualisierung.pruefenUndInstallieren() }.apply {
                setOnLongClickListener { aktualisierung.adresseFragen(); true }
            })
            addView(knopf(R.string.knopf_senden) { diagnose.senden() })
            addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        wurzel.addView(leiste, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        info = TextView(this).apply { textSize = 15f; setPadding(24, 24, 24, 24); setTextIsSelectable(true) }
        infoRahmen = ScrollView(this).apply {
            setBackgroundColor(Color.argb(200, 0, 0, 0))
            visibility = View.GONE
            addView(info)
        }
        val lp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        lp.topMargin = 120
        wurzel.addView(infoRahmen, lp)

        setContentView(wurzel)
        wurzel.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> bildEinpassen() }
    }

    private fun knopf(text: Int, aktion: () -> Unit) = Button(this).apply {
        setText(text)
        textSize = 18f
        setOnClickListener { aktion() }
    }

    private fun leisteUmschalten() {
        leiste.visibility = if (leiste.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        if (leiste.visibility == View.GONE) infoRahmen.visibility = View.GONE
    }

    override fun onResume() {
        super.onResume()
        faden = HandlerThread("kamera").also { it.start(); hinter = Handler(it.looper) }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            status.setText(R.string.keine_berechtigung)
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 1)
            return
        }
        starten()
    }

    override fun onPause() {
        schliessen()
        ui.removeCallbacks(messen)
        faden?.quitSafely()
        faden = null
        hinter = null
        super.onPause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            info.text = kameraInfo()
            starten()
        } else {
            status.setText(R.string.keine_berechtigung)
        }
    }

    // ── Kamera ──────────────────────────────────────────────────────────────

    private fun starten() {
        if (kameras.isEmpty()) {
            status.setText(R.string.keine_kamera)
            return
        }
        val id = kameras[kameraNr]
        groessen = vorschauGroessen(id)
        val gemerkt = einstellungen.getString("groesse_$id", null)
        groesseNr = groessen.indexOfFirst { it.toString() == gemerkt }.let { if (it >= 0) it else standardGroesse() }
        if (bild.isAvailable) oeffnen() else bild.surfaceTextureListener = texturHorcher
    }

    private val texturHorcher = object : TextureView.SurfaceTextureListener {
        override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) = oeffnen()
        override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {}
        override fun onSurfaceTextureDestroyed(st: SurfaceTexture) = true
        override fun onSurfaceTextureUpdated(st: SurfaceTexture) { bilderZaehler++ }
    }

    private fun oeffnen() {
        bild.surfaceTextureListener = texturHorcher
        if (kameras.isEmpty() || hinter == null) return
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            status.setText(R.string.keine_berechtigung)
            return
        }
        val id = kameras[kameraNr]
        if (hatEingaenge) eingangSetzen()
        fehlerText = null
        bilderZaehler = 0
        status.text = getString(R.string.status_oeffne, id)
        bildEinpassen()
        try {
            manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(d: CameraDevice) {
                    geraet = d
                    sitzungStarten(d)
                }
                override fun onDisconnected(d: CameraDevice) {
                    d.close()
                    if (geraet == d) geraet = null
                    fehler(getString(R.string.fehler_getrennt, id))
                }
                override fun onError(d: CameraDevice, code: Int) {
                    d.close()
                    if (geraet == d) geraet = null
                    fehler(getString(R.string.fehler_oeffnen, id, geraeteFehler(code)))
                }
            }, hinter)
        } catch (e: Exception) {
            fehler(getString(R.string.fehler_oeffnen, id, e.message ?: e.javaClass.simpleName))
        }
        ui.removeCallbacks(messen)
        ui.postDelayed(messen, 1000)
    }

    private fun sitzungStarten(d: CameraDevice) {
        val textur = bild.surfaceTexture ?: return
        val groesse = groessen.getOrNull(groesseNr)
        if (groesse != null) textur.setDefaultBufferSize(groesse.width, groesse.height)
        val flaeche = Surface(textur)
        // Wie die Hersteller-App: zusätzlich ein großer JPEG-Strom (wird nie
        // abgeholt). Erst damit liefert der Videowandler ein ganzes, richtig
        // liegendes Bild statt zweier gedrehter Hälften.
        val flaechen = mutableListOf(flaeche)
        if (hatEingaenge) {
            val jpeg = jpegGroesse(d.id)
            if (jpeg != null) {
                leser?.close()
                leser = android.media.ImageReader.newInstance(jpeg.width, jpeg.height, android.graphics.ImageFormat.JPEG, 2)
                flaechen += leser!!.surface
            }
        }
        try {
            @Suppress("DEPRECATION")
            d.createCaptureSession(flaechen, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) {
                    sitzung = s
                    try {
                        val anfrage = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
                        anfrage.addTarget(flaeche)
                        s.setRepeatingRequest(anfrage.build(), null, hinter)
                    } catch (e: Exception) {
                        fehler(getString(R.string.fehler_oeffnen, d.id, e.message ?: e.javaClass.simpleName))
                    }
                }
                override fun onConfigureFailed(s: CameraCaptureSession) {
                    fehler(getString(R.string.fehler_sitzung, d.id, groesse?.let(::text) ?: "?"))
                }
            }, hinter)
        } catch (e: Exception) {
            fehler(getString(R.string.fehler_oeffnen, d.id, e.message ?: e.javaClass.simpleName))
        }
    }

    private var leser: android.media.ImageReader? = null

    private fun jpegGroesse(id: String): Size? = try {
        manager.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(android.graphics.ImageFormat.JPEG)?.maxByOrNull { it.width * it.height }
    } catch (e: Exception) {
        null
    }

    private fun schliessen() {
        try { sitzung?.close() } catch (_: Exception) {}
        try { geraet?.close() } catch (_: Exception) {}
        sitzung = null
        try { leser?.close() } catch (_: Exception) {}
        leser = null
        geraet = null
    }

    private fun fehler(text: String) = ui.post { fehlerText = text; status.text = text }

    private fun naechsteKamera() {
        if (kameras.isEmpty()) return
        schliessen()
        kameraNr = (kameraNr + 1) % kameras.size
        einstellungen.edit().putString("kamera", kameras[kameraNr]).apply()
        starten()
    }

    private fun eingangSetzen() {
        eingangFehler = try {
            eingangDatei.writeText(eingang.toString())
            null
        } catch (e: Exception) {
            e.message ?: e.javaClass.simpleName
        }
    }

    private fun naechsterEingang() {
        eingang = (eingang + 1) % 4
        eingangSetzen()
    }

    private fun naechsteGroesse() {
        if (groessen.isEmpty()) return
        schliessen()
        groesseNr = (groesseNr + 1) % groessen.size
        einstellungen.edit().putString("groesse_${kameras[kameraNr]}", groessen[groesseNr].toString()).apply()
        oeffnen()
    }

    /**
     * Ohne gemerkte Wahl: Videonormen zuerst (Cinch-Kameras liefern meist
     * 720×480 NTSC oder 720×576 PAL), die größte Größe meldet das Radio
     * zwar, öffnet sie aber nicht (Fehler DEVICE).
     */
    private fun standardGroesse(): Int {
        val wuensche = if (hatEingaenge) listOf("720x600", "720x480") else listOf("720x480", "720x576", "640x480")
        for (wunsch in wuensche) {
            val i = groessen.indexOfFirst { it.toString() == wunsch }
            if (i >= 0) return i
        }
        return 0
    }

    private fun suchlaufStarten() {
        if (groessen.isEmpty()) return
        suchlauf = groessen.size
        schlechteSekunden = 0
        naechsteGroesse()
    }

    /** Jede Sekunde: Bilder pro Sekunde zählen und prüfen, ob das Bild schwarz ist. */
    private val messen = object : Runnable {
        override fun run() {
            var gut = false
            if (kameras.isNotEmpty()) {
                val id = kameras[kameraNr]
                val richtung = richtung(id)
                val groesse = groessen.getOrNull(groesseNr)?.let(::text) ?: "?"
                val fps = bilderZaehler
                bilderZaehler = 0
                val text = when {
                    fehlerText != null -> fehlerText + " · " + groesse
                    fps == 0 -> getString(R.string.status_kein_bild, id, richtung, groesse)
                    istSchwarz() -> getString(R.string.status_schwarz, id, richtung, groesse, fps)
                    else -> { gut = true; getString(R.string.status_bild, id, richtung, groesse, fps) }
                }
                val mitEingang = when {
                    !hatEingaenge -> text
                    eingangFehler != null -> text + " · " + getString(R.string.eingang_fehler, eingang + 1, eingangFehler)
                    else -> text + " · " + getString(R.string.eingang_n, eingang + 1)
                }
                status.text = if (suchlauf > 0) getString(R.string.status_suchlauf, suchlauf, mitEingang) else mitEingang
            }
            if (suchlauf > 0) {
                if (gut) {
                    suchlauf = 0
                } else if (++schlechteSekunden >= 3) {
                    schlechteSekunden = 0
                    suchlauf--
                    if (suchlauf > 0) naechsteGroesse()
                }
            }
            // naechsteGroesse() hat messen schon neu eingeplant – nur einmal laufen
            ui.removeCallbacks(this)
            ui.postDelayed(this, 1000)
        }
    }

    private fun istSchwarz(): Boolean {
        val probe = bild.getBitmap(32, 24) ?: return false
        var summe = 0L
        for (y in 0 until probe.height) for (x in 0 until probe.width) {
            val p = probe.getPixel(x, y)
            summe += (Color.red(p) + Color.green(p) + Color.blue(p)) / 3
        }
        probe.recycle()
        return summe / (32 * 24) < 8
    }

    /** Bild mit dem Seitenverhältnis der gewählten Größe mittig einpassen. */
    private fun bildEinpassen() {
        val g = groessen.getOrNull(groesseNr) ?: return
        val bw = wurzel.width
        val bh = wurzel.height
        if (bw == 0 || bh == 0) return
        val voll = einstellungen.getBoolean("voll", false)
        val faktor = minOf(bw.toFloat() / g.width, bh.toFloat() / g.height)
        val w = if (voll) bw else (g.width * faktor).toInt()
        val h = if (voll) bh else (g.height * faktor).toInt()
        val lp = bild.layoutParams as FrameLayout.LayoutParams
        if (lp.width != w || lp.height != h) {
            lp.width = w
            lp.height = h
            bild.layoutParams = lp
        }
        // Drehen (um die Mitte, bei 90/270 auf die Fläche gestreckt) und spiegeln
        val drehung = einstellungen.getInt("drehung", 0)
        val cx = w / 2f
        val cy = h / 2f
        val m = android.graphics.Matrix()
        // Der Videowandler liefert zwei Halbbilder in einem Puffer; nach der
        // Drehung durch Android liegen sie nebeneinander – nur die linke zeigen.
        if (einstellungen.getBoolean("haelfte", false)) m.postScale(2f, 1f, 0f, 0f)
        if (drehung != 0) {
            m.postRotate(drehung.toFloat(), cx, cy)
            if (drehung % 180 != 0) m.postScale(w.toFloat() / h, h.toFloat() / w, cx, cy)
        }
        val sx = if (einstellungen.getBoolean("spiegelnx", false)) -1f else 1f
        val sy = if (einstellungen.getBoolean("spiegeln", false)) -1f else 1f
        m.postScale(sx, sy, cx, cy)
        bild.setTransform(m)
    }

    // ── Auskunft ────────────────────────────────────────────────────────────

    private fun vorschauGroessen(id: String): List<Size> = try {
        val karte = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        karte?.getOutputSizes(SurfaceTexture::class.java)?.sortedByDescending { it.width * it.height } ?: emptyList()
    } catch (e: Exception) {
        emptyList()
    }

    private fun richtung(id: String): String = try {
        when (manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)) {
            CameraMetadata.LENS_FACING_FRONT -> getString(R.string.richtung_vorne)
            CameraMetadata.LENS_FACING_BACK -> getString(R.string.richtung_hinten)
            CameraMetadata.LENS_FACING_EXTERNAL -> getString(R.string.richtung_extern)
            else -> getString(R.string.richtung_unbekannt)
        }
    } catch (e: Exception) {
        getString(R.string.richtung_unbekannt)
    }

    private fun kameraInfo(): String {
        if (kameras.isEmpty()) return getString(R.string.keine_kamera)
        @Suppress("DEPRECATION")
        val alt = try { android.hardware.Camera.getNumberOfCameras() } catch (e: Exception) { -1 }
        val version = try { packageManager.getPackageInfo(packageName, 0).versionName } catch (e: Exception) { "?" }
        return getString(R.string.info_kopf, version, alt) + "\n\n" + kameras.joinToString("\n\n") { id ->
            try {
                val k = manager.getCameraCharacteristics(id)
                val stufe = when (k.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)) {
                    CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "LEGACY"
                    CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "LIMITED"
                    CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "FULL"
                    CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "3"
                    CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_EXTERNAL -> "EXTERNAL"
                    else -> "?"
                }
                val ausrichtung = k.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
                val karte = k.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                val formate = karte?.outputFormats?.joinToString(", ") { "0x" + Integer.toHexString(it) } ?: "?"
                getString(R.string.info_kamera, id, richtung(id), stufe, ausrichtung) + "\n" +
                    getString(R.string.info_groessen, vorschauGroessen(id).joinToString(", ") { text(it) }) + "\n" +
                    getString(R.string.info_formate, formate)
            } catch (e: Exception) {
                getString(R.string.fehler_oeffnen, id, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    private fun text(g: Size) = "${g.width}×${g.height}"

    private fun geraeteFehler(code: Int) = when (code) {
        CameraDevice.StateCallback.ERROR_CAMERA_IN_USE -> "IN_USE"
        CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE -> "MAX_CAMERAS_IN_USE"
        CameraDevice.StateCallback.ERROR_CAMERA_DISABLED -> "DISABLED"
        CameraDevice.StateCallback.ERROR_CAMERA_DEVICE -> "DEVICE"
        CameraDevice.StateCallback.ERROR_CAMERA_SERVICE -> "SERVICE"
        else -> code.toString()
    }
}
