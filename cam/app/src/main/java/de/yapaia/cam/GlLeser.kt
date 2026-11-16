package de.yapaia.cam

import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Wie das Kamerabild ausgegeben wird – bezogen auf das Bild, wie Android es
 * in einer Vorschau zeigt (bei Witstek um 270° gedreht, die zwei Halbbilder
 * des Wandlers nebeneinander). Ausgeschnitten, gedreht, gespiegelt, auf
 * [breite]×[hoehe] gestreckt – dieselben Schritte wie in der Vorschau-Activity.
 */
data class Darstellung(
    /** 0 = ganz, 1 = obere Hälfte, 2 = untere, 3 = linke, 4 = rechte. */
    val haelfte: Int = 3,
    /** Drehung im Uhrzeigersinn: 0, 90, 180, 270. */
    val drehung: Int = 90,
    val spiegelnX: Boolean = false,
    val spiegelnY: Boolean = true,
    val breite: Int = 720,
    val hoehe: Int = 480,
    val qualitaet: Int = 80,
) {
    fun json(): JSONObject = JSONObject()
        .put("haelfte", haelfte).put("drehung", drehung)
        .put("spiegelnx", spiegelnX).put("spiegelny", spiegelnY)
        .put("breite", breite).put("hoehe", hoehe).put("qualitaet", qualitaet)

    /** Ausgabe (u, v ∈ [0,1], oben links) → Stelle im Vorschaubild (oben links). */
    fun quelle(u: Double, v: Double): Pair<Double, Double> {
        val u1 = if (spiegelnX) 1 - u else u
        val v1 = if (spiegelnY) 1 - v else v
        val (xc, yc) = when (((drehung % 360) + 360) % 360) {
            90 -> Pair(v1, 1 - u1)
            180 -> Pair(1 - u1, 1 - v1)
            270 -> Pair(1 - v1, u1)
            else -> Pair(u1, v1)
        }
        return when (haelfte) {
            1 -> Pair(xc, yc / 2)
            2 -> Pair(xc, 0.5 + yc / 2)
            3 -> Pair(xc / 2, yc)
            4 -> Pair(0.5 + xc / 2, yc)
            else -> Pair(xc, yc)
        }
    }

    companion object {
        /** Vorschaubild unverändert, für `/kamera/roh.jpg`. */
        val ROH = Darstellung(haelfte = 0, drehung = 0, spiegelnY = false, breite = 720, hoehe = 600, qualitaet = 85)
    }
}

/**
 * Holt die Kamerabilder über eine SurfaceTexture (der HAL des Radios
 * liefert nur Vorschau-Ströme zuverlässig, YUV-Leser bringen ihn zum Absturz)
 * und liest sie mit OpenGL ES aus: zeichnen in einen Pbuffer, glReadPixels,
 * JPEG.
 */
class GlLeser(
    private val breiteVorschau: Int,
    private val hoeheVorschau: Int,
    private val abholer: Abholer,
) {
    interface Abholer {
        /** Neues Kamerabild: Darstellung, wenn es ausgelesen werden soll, sonst null. */
        fun bild(): Darstellung?
        fun fertig(jpeg: ByteArray, gemessen: Boolean)
    }

    private val faden = HandlerThread("gl").apply { start() }
    val handler = Handler(faden.looper)

    private var anzeige: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var kontext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var flaeche: EGLSurface = EGL14.EGL_NO_SURFACE
    private var flaecheW = 0
    private var flaecheH = 0
    private var programm = 0
    private var textur = 0
    private lateinit var st: SurfaceTexture
    lateinit var surface: Surface
        private set
    private val matrix = FloatArray(16)
    @Volatile var bereit = false
        private set

    /** Kenngrößen des zuletzt ausgelesenen Bildes. */
    var helligkeit = 0.0
        private set
    var streuung = 0.0
        private set

    init {
        handler.post { aufbauen() }
    }

    private fun aufbauen() {
        try {
            anzeige = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val v = IntArray(2)
            EGL14.eglInitialize(anzeige, v, 0, v, 1)
            val attr = intArrayOf(
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_NONE,
            )
            val configs = arrayOfNulls<EGLConfig>(1)
            val n = IntArray(1)
            EGL14.eglChooseConfig(anzeige, attr, 0, configs, 0, 1, n, 0)
            konfig = configs[0]
            kontext = EGL14.eglCreateContext(anzeige, konfig, EGL14.EGL_NO_CONTEXT,
                intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
            flaecheSetzen(16, 16)
            programm = programmBauen()
            val t = IntArray(1)
            GLES20.glGenTextures(1, t, 0)
            textur = t[0]
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textur)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            st = SurfaceTexture(textur)
            st.setDefaultBufferSize(breiteVorschau, hoeheVorschau)
            st.setOnFrameAvailableListener({ bildDa() }, handler)
            surface = Surface(st)
            bereit = true
        } catch (e: Exception) {
            Log.w(WebServer.TAG, "GL: $e")
        }
    }

    private var konfig: EGLConfig? = null

    private fun flaecheSetzen(w: Int, h: Int) {
        if (w == flaecheW && h == flaecheH) return
        EGL14.eglMakeCurrent(anzeige, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        if (flaeche != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(anzeige, flaeche)
        flaeche = EGL14.eglCreatePbufferSurface(anzeige, konfig, intArrayOf(EGL14.EGL_WIDTH, w, EGL14.EGL_HEIGHT, h, EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(anzeige, flaeche, flaeche, kontext)
        flaecheW = w
        flaecheH = h
    }

    @Volatile private var rohAuftrag: ((ByteArray) -> Unit)? = null

    /** Nächstes Bild unverändert (Darstellung.ROH) an [ziel]. */
    fun rohAnfordern(ziel: (ByteArray) -> Unit) { rohAuftrag = ziel }

    private var zaehler = 0

    private fun bildDa() {
        try {
            st.updateTexImage()
        } catch (e: Exception) {
            return
        }
        try {
            rohAuftrag?.let { z ->
                rohAuftrag = null
                z(auslesen(Darstellung.ROH, false))
            }
            val d = abholer.bild() ?: return
            val messen = ++zaehler % 5 == 0
            abholer.fertig(auslesen(d, messen), messen)
        } catch (e: Exception) {
            Log.w(WebServer.TAG, "GL lesen: $e")
        }
    }

    private val puffer = ByteArrayOutputStream(128 * 1024)
    private var pixel: ByteBuffer = ByteBuffer.allocateDirect(4)

    private fun auslesen(d: Darstellung, messen: Boolean): ByteArray {
        val w = d.breite
        val h = d.hoehe
        flaecheSetzen(w, h)
        GLES20.glViewport(0, 0, w, h)
        st.getTransformMatrix(matrix)
        // Ecken der Ausgabe: (u, v) oben links → Texturkoordinaten
        val ecken = arrayOf(0.0 to 0.0, 1.0 to 0.0, 0.0 to 1.0, 1.0 to 1.0)
        val daten = FloatArray(16)
        for ((i, e) in ecken.withIndex()) {
            val (xd, yd) = d.quelle(e.first, e.second)
            val s = xd.toFloat()
            val t = (1 - yd).toFloat()
            // Texturmatrix der SurfaceTexture anwenden (Spaltenform)
            val ts = matrix[0] * s + matrix[4] * t + matrix[12]
            val tt = matrix[1] * s + matrix[5] * t + matrix[13]
            // glReadPixels liest von unten: Zeile v=0 nach unten legen
            daten[i * 4] = (e.first * 2 - 1).toFloat()
            daten[i * 4 + 1] = (e.second * 2 - 1).toFloat()
            daten[i * 4 + 2] = ts
            daten[i * 4 + 3] = tt
        }
        val fb: FloatBuffer = ByteBuffer.allocateDirect(daten.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        fb.put(daten).position(0)
        GLES20.glUseProgram(programm)
        val aPos = GLES20.glGetAttribLocation(programm, "aPos")
        val aTex = GLES20.glGetAttribLocation(programm, "aTex")
        fb.position(0)
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 16, fb)
        GLES20.glEnableVertexAttribArray(aPos)
        fb.position(2)
        GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 16, fb)
        GLES20.glEnableVertexAttribArray(aTex)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textur)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        if (pixel.capacity() != w * h * 4) pixel = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        pixel.position(0)
        GLES20.glReadPixels(0, 0, w, h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, pixel)
        if (messen) messen(w * h)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        pixel.position(0)
        bmp.copyPixelsFromBuffer(pixel)
        puffer.reset()
        bmp.compress(Bitmap.CompressFormat.JPEG, d.qualitaet, puffer)
        bmp.recycle()
        return puffer.toByteArray()
    }

    /** Mittelwert und Streuung der Helligkeit (Grünkanal, jedes 7. Pixel). */
    private fun messen(n: Int) {
        var s = 0L
        var q = 0L
        var z = 0
        var i = 0
        while (i < n) {
            val p = pixel.get(i * 4 + 1).toInt() and 0xff
            s += p; q += p * p; z++
            i += 7
        }
        val m = s.toDouble() / z
        helligkeit = m
        streuung = Math.sqrt((q.toDouble() / z - m * m).coerceAtLeast(0.0))
    }

    private fun programmBauen(): Int {
        fun shader(typ: Int, text: String): Int {
            val s = GLES20.glCreateShader(typ)
            GLES20.glShaderSource(s, text)
            GLES20.glCompileShader(s)
            return s
        }
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, shader(GLES20.GL_VERTEX_SHADER,
            "attribute vec4 aPos; attribute vec2 aTex; varying vec2 vTex;" +
                "void main(){ gl_Position = aPos; vTex = aTex; }"))
        GLES20.glAttachShader(p, shader(GLES20.GL_FRAGMENT_SHADER,
            "#extension GL_OES_EGL_image_external : require\n" +
                "precision mediump float; varying vec2 vTex; uniform samplerExternalOES tex;" +
                "void main(){ gl_FragColor = texture2D(tex, vTex); }"))
        GLES20.glLinkProgram(p)
        return p
    }

}
