package de.yapaia.cam

import android.util.Log
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URLDecoder

/** Eine HTTP-Anfrage. [kopf] mit kleingeschriebenen Namen, [koerper] nur bei Content-Length. */
class Anfrage(
    val methode: String,
    val pfad: String,
    val parameter: Map<String, String>,
    val kopf: Map<String, String> = emptyMap(),
    val koerper: ByteArray = ByteArray(0),
) {
    val text: String get() = String(koerper, Charsets.UTF_8)
}

/** Antwort auf eine Anfrage; für Ströme (MJPEG) [kopf] + [strom]. */
class Antwort(private val aus: OutputStream) {
    var gesendet = false
        private set

    val strom: OutputStream get() = aus

    fun kopf(code: Int, typ: String, laenge: Int? = null, extra: Map<String, String> = emptyMap()) {
        val text = when (code) {
            200 -> "OK"; 400 -> "Bad Request"; 403 -> "Forbidden"; 404 -> "Not Found"; 412 -> "Precondition Failed"
            500 -> "Internal Server Error"; 501 -> "Not Implemented"; 503 -> "Service Unavailable"; else -> "Error"
        }
        val k = StringBuilder("HTTP/1.1 $code $text\r\n")
            .append("Content-Type: $typ\r\n")
            .append("Cache-Control: no-cache, no-store\r\n")
            .append("Access-Control-Allow-Origin: *\r\n")
            .append("Connection: close\r\n")
        for ((n, w) in extra) k.append("$n: $w\r\n")
        if (laenge != null) k.append("Content-Length: $laenge\r\n")
        k.append("\r\n")
        aus.write(k.toString().toByteArray())
        gesendet = true
    }

    fun senden(code: Int, typ: String, daten: ByteArray, extra: Map<String, String> = emptyMap()) {
        kopf(code, typ, daten.size, extra)
        aus.write(daten)
        aus.flush()
    }

    fun text(code: Int, text: String, typ: String = "text/plain; charset=utf-8") =
        senden(code, typ, text.toByteArray())
}

/**
 * Kleiner HTTP-Server: ein Faden je Verbindung (es sind nur wenige – Home
 * Assistant und ab und zu ein Browser). Ströme halten ihren Faden, bis der
 * Empfänger auflegt.
 */
class WebServer(private val port: Int, private val bearbeiter: (Anfrage, Antwort) -> Unit) {

    private var sockel: ServerSocket? = null

    fun starten() {
        Thread({
            while (true) {
                try {
                    ServerSocket(port).use { s ->
                        sockel = s
                        while (!s.isClosed) {
                            val v = s.accept()
                            Thread({ verbindung(v) }, "http").start()
                        }
                    }
                    return@Thread
                } catch (e: SocketException) {
                    if (sockel?.isClosed == true) return@Thread
                    Log.w(TAG, "Server: ${e.message}")
                } catch (e: IOException) {
                    Log.w(TAG, "Port $port: ${e.message}")
                }
                Thread.sleep(5000)
            }
        }, "http-server").start()
    }

    fun stoppen() {
        try { sockel?.close() } catch (_: IOException) {}
    }

    private fun verbindung(v: Socket) {
        v.use {
            try {
                v.soTimeout = 15000
                val ein = v.getInputStream().buffered()
                val zeile = zeileLesen(ein) ?: return
                val kopf = mutableMapOf<String, String>()
                while (true) {
                    val k = zeileLesen(ein) ?: break
                    if (k.isEmpty()) break
                    val i = k.indexOf(':')
                    if (i > 0) kopf[k.substring(0, i).trim().lowercase()] = k.substring(i + 1).trim()
                }
                val laenge = kopf["content-length"]?.toIntOrNull()?.coerceIn(0, MAX_KOERPER) ?: 0
                val koerper = ByteArray(laenge)
                var gelesen = 0
                while (gelesen < laenge) {
                    val n = ein.read(koerper, gelesen, laenge - gelesen)
                    if (n < 0) break
                    gelesen += n
                }
                v.soTimeout = 0
                val teile = zeile.split(" ")
                if (teile.size < 2) return
                val ziel = teile[1]
                val pfad = ziel.substringBefore('?')
                val parameter = ziel.substringAfter('?', "").split('&').filter { it.isNotEmpty() }.associate {
                    dekodieren(it.substringBefore('=')) to dekodieren(it.substringAfter('=', ""))
                }
                val antwort = Antwort(BufferedOutputStream(v.getOutputStream(), 64 * 1024))
                try {
                    bearbeiter(Anfrage(teile[0], pfad, parameter, kopf, koerper), antwort)
                } catch (e: IOException) {
                    // Gegenstelle hat aufgelegt
                } catch (e: Exception) {
                    Log.w(TAG, "$pfad: $e")
                    if (!antwort.gesendet) antwort.text(500, e.toString())
                }
                antwort.strom.flush()
            } catch (_: IOException) {
            }
        }
    }

    /** Eine Zeile bis CRLF/LF (ISO-8859-1), null am Ende des Stroms. */
    private fun zeileLesen(ein: java.io.InputStream): String? {
        val b = StringBuilder()
        while (true) {
            val c = ein.read()
            if (c < 0) return if (b.isEmpty()) null else b.toString()
            if (c == '\n'.code) return b.toString().trimEnd('\r')
            if (b.length < 8192) b.append(c.toChar())
        }
    }

    private fun dekodieren(s: String) = try { URLDecoder.decode(s, "UTF-8") } catch (e: Exception) { s }

    companion object {
        const val TAG = "Yapaia"
        const val MAX_KOERPER = 256 * 1024
    }
}
