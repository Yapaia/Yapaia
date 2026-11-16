package de.yapaia.cam

import android.Manifest
import android.app.Activity
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

    private val einstellungen by lazy { getSharedPreferences("wahl", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        manager = getSystemService(CAMERA_SERVICE) as CameraManager
        oberflaecheBauen()

        kameras = try { manager.cameraIdList.toList() } catch (e: Exception) { emptyList() }
        val gewuenscht = intent.getStringExtra("kamera") ?: einstellungen.getString("kamera", null)
        kameraNr = kameras.indexOf(gewuenscht).coerceAtLeast(0)
        info.text = kameraInfo()
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
            addView(knopf(R.string.knopf_aufloesung) { naechsteGroesse() })
            addView(knopf(R.string.knopf_info) {
                infoRahmen.visibility = if (infoRahmen.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            })
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
        groesseNr = groessen.indexOfFirst { it.toString() == gemerkt }.let { if (it >= 0) it else 0 }
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
        val id = kameras[kameraNr]
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
        try {
            @Suppress("DEPRECATION")
            d.createCaptureSession(listOf(flaeche), object : CameraCaptureSession.StateCallback() {
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

    private fun schliessen() {
        try { sitzung?.close() } catch (_: Exception) {}
        try { geraet?.close() } catch (_: Exception) {}
        sitzung = null
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

    private fun naechsteGroesse() {
        if (groessen.isEmpty()) return
        schliessen()
        groesseNr = (groesseNr + 1) % groessen.size
        einstellungen.edit().putString("groesse_${kameras[kameraNr]}", groessen[groesseNr].toString()).apply()
        oeffnen()
    }

    /** Jede Sekunde: Bilder pro Sekunde zählen und prüfen, ob das Bild schwarz ist. */
    private val messen = object : Runnable {
        override fun run() {
            if (fehlerText == null && kameras.isNotEmpty()) {
                val id = kameras[kameraNr]
                val richtung = richtung(id)
                val groesse = groessen.getOrNull(groesseNr)?.let(::text) ?: "?"
                val fps = bilderZaehler
                bilderZaehler = 0
                status.text = when {
                    fps == 0 -> getString(R.string.status_kein_bild, id, richtung, groesse)
                    istSchwarz() -> getString(R.string.status_schwarz, id, richtung, groesse, fps)
                    else -> getString(R.string.status_bild, id, richtung, groesse, fps)
                }
            }
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
        val faktor = minOf(bw.toFloat() / g.width, bh.toFloat() / g.height)
        val w = (g.width * faktor).toInt()
        val h = (g.height * faktor).toInt()
        val lp = bild.layoutParams as FrameLayout.LayoutParams
        if (lp.width != w || lp.height != h) {
            lp.width = w
            lp.height = h
            bild.layoutParams = lp
        }
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
        return kameras.joinToString("\n\n") { id ->
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
