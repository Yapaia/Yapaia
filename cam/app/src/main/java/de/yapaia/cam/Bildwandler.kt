package de.yapaia.cam

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Wie das Kamerabild ausgegeben wird. Der Videowandler TP9951 legt zwei
 * Halbbilder übereinander in einen Puffer (720×600); gezeigt wird eines,
 * auf die Ausgabegröße gestreckt, wahlweise gedreht und gespiegelt.
 */
data class Darstellung(
    /** 0 = ganzer Puffer, 1 = obere Hälfte, 2 = untere Hälfte, 3 = linke, 4 = rechte. */
    val haelfte: Int = 1,
    /** Drehung im Uhrzeigersinn: 0, 90, 180, 270. */
    val drehung: Int = 0,
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

    companion object {
        /** Unverändert, für `/kamera/roh.jpg`. */
        val ROH = Darstellung(haelfte = 0, spiegelnY = false, breite = 0, hoehe = 0, qualitaet = 85)
    }
}

/**
 * YUV_420_888 → ausgeschnitten, gedreht, gespiegelt, skaliert → NV21 → JPEG.
 * Für jede Ausgabestelle wird einmal ausgerechnet, aus welchem Byte der
 * Ebenen sie kommt (Tabelle); je Bild bleibt nur das Umkopieren.
 */
class Bildwandler {

    private var schluessel: String? = null
    private var tabelleY = IntArray(0)
    private var tabelleU = IntArray(0)
    private var tabelleV = IntArray(0)
    private var y = ByteArray(0)
    private var u = ByteArray(0)
    private var v = ByteArray(0)
    private var nv21 = ByteArray(0)
    private val puffer = ByteArrayOutputStream(128 * 1024)

    /** Kenngrößen des letzten Bildes (aus dem gezeigten Ausschnitt). */
    var helligkeit = 0.0
        private set
    var streuung = 0.0
        private set

    fun umwandeln(bild: Image, d: Darstellung, messen: Boolean): ByteArray {
        val ebenen = bild.planes
        val bw = bild.width
        val bh = bild.height
        val w = (if (d.breite > 0) d.breite else bw) and 1.inv()
        val h = (if (d.hoehe > 0) d.hoehe else bh) and 1.inv()
        val k = "$bw/$bh/${ebenen[0].rowStride}/${ebenen[1].rowStride}/${ebenen[1].pixelStride}/$d"
        if (k != schluessel) {
            tabellenBauen(bw, bh, ebenen[0].rowStride, ebenen[0].pixelStride, ebenen[1].rowStride, ebenen[1].pixelStride,
                ebenen[2].rowStride, ebenen[2].pixelStride, d, w, h)
            schluessel = k
            nv21 = ByteArray(w * h * 3 / 2)
        }
        y = holen(ebenen[0].buffer, y)
        u = holen(ebenen[1].buffer, u)
        v = holen(ebenen[2].buffer, v)
        val ty = tabelleY
        for (i in ty.indices) nv21[i] = y[ty[i]]
        var o = w * h
        val tu = tabelleU
        val tv = tabelleV
        for (i in tu.indices) {
            nv21[o++] = v[tv[i]]
            nv21[o++] = u[tu[i]]
        }
        if (messen) messen(w * h)
        puffer.reset()
        YuvImage(nv21, ImageFormat.NV21, w, h, null).compressToJpeg(Rect(0, 0, w, h), d.qualitaet, puffer)
        return puffer.toByteArray()
    }

    private fun holen(b: java.nio.ByteBuffer, alt: ByteArray): ByteArray {
        b.rewind()
        val neu = if (alt.size == b.remaining()) alt else ByteArray(b.remaining())
        b.get(neu)
        return neu
    }

    /** Mittelwert und Streuung der Helligkeit (jedes 7. Pixel). */
    private fun messen(n: Int) {
        var s = 0L
        var q = 0L
        var z = 0
        var i = 0
        while (i < n) {
            val p = nv21[i].toInt() and 0xff
            s += p; q += p * p; z++
            i += 7
        }
        val m = s.toDouble() / z
        helligkeit = m
        streuung = Math.sqrt((q.toDouble() / z - m * m).coerceAtLeast(0.0))
    }

    private fun tabellenBauen(
        bw: Int, bh: Int, yZeile: Int, yPixel: Int, uZeile: Int, uPixel: Int, vZeile: Int, vPixel: Int,
        d: Darstellung, w: Int, h: Int,
    ) {
        // Ausschnitt im Puffer
        val (ax, ay, aw, ah) = when (d.haelfte) {
            1 -> listOf(0, 0, bw, bh / 2)
            2 -> listOf(0, bh / 2, bw, bh / 2)
            3 -> listOf(0, 0, bw / 2, bh)
            4 -> listOf(bw / 2, 0, bw / 2, bh)
            else -> listOf(0, 0, bw, bh)
        }
        // Ausgabe (u, v ∈ [0,1)) → Stelle im Ausschnitt (xc, yc ∈ [0,1))
        fun quelle(uu: Double, vv: Double): Pair<Double, Double> {
            val u1 = if (d.spiegelnX) 1 - uu else uu
            val v1 = if (d.spiegelnY) 1 - vv else vv
            return when (((d.drehung % 360) + 360) % 360) {
                90 -> Pair(v1, 1 - u1)
                180 -> Pair(1 - u1, 1 - v1)
                270 -> Pair(1 - v1, u1)
                else -> Pair(u1, v1)
            }
        }
        tabelleY = IntArray(w * h)
        for (oy in 0 until h) for (ox in 0 until w) {
            val (xc, yc) = quelle((ox + 0.5) / w, (oy + 0.5) / h)
            val px = (ax + (xc * aw).toInt()).coerceIn(0, bw - 1)
            val py = (ay + (yc * ah).toInt()).coerceIn(0, bh - 1)
            tabelleY[oy * w + ox] = py * yZeile + px * yPixel
        }
        val w2 = w / 2
        val h2 = h / 2
        tabelleU = IntArray(w2 * h2)
        tabelleV = IntArray(w2 * h2)
        for (oy in 0 until h2) for (ox in 0 until w2) {
            val (xc, yc) = quelle((ox + 0.5) / w2, (oy + 0.5) / h2)
            val px = ((ax + (xc * aw).toInt()) / 2).coerceIn(0, bw / 2 - 1)
            val py = ((ay + (yc * ah).toInt()) / 2).coerceIn(0, bh / 2 - 1)
            tabelleU[oy * w2 + ox] = py * uZeile + px * uPixel
            tabelleV[oy * w2 + ox] = py * vZeile + px * vPixel
        }
    }
}
