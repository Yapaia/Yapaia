package de.yapaia.cam

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Meldet Ereignisse sofort an Home Assistant (Webhook), z. B. Zündung,
 * Rückwärtsgang und Tastendrücke. Adresse: `<ha>/api/webhook/yapaia_radio_<art>`.
 * Die HA-Adresse lässt sich mit `/einstellen?ha=http://…:8123` ändern.
 */
object Melder {
    const val HA_STANDARD = "http://192.168.8.235:8123"

    private val faden = Executors.newSingleThreadExecutor()
    @Volatile private var ha: String? = null
    @Volatile var letzterFehler: String? = null
        private set
    @Volatile var gesendet = 0
        private set

    fun ha(ctx: Context): String =
        ha ?: (ctx.getSharedPreferences("dienst", Context.MODE_PRIVATE).getString("ha", null) ?: HA_STANDARD).also { ha = it }

    fun haSetzen(ctx: Context, url: String) {
        ha = url.trimEnd('/')
        ctx.getSharedPreferences("dienst", Context.MODE_PRIVATE).edit().putString("ha", ha).apply()
    }

    /** Ereignis [art] (`zustand`, `taste`) mit [daten] senden – im Hintergrund, Fehler nur gemerkt. */
    fun senden(ctx: Context, art: String, daten: JSONObject) {
        val ziel = "${ha(ctx)}/api/webhook/yapaia_radio_$art"
        faden.execute {
            try {
                val c = URL(ziel).openConnection() as HttpURLConnection
                c.connectTimeout = 3000
                c.readTimeout = 3000
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(daten.toString().toByteArray()) }
                val code = c.responseCode
                c.disconnect()
                if (code in 200..299) { gesendet++; letzterFehler = null } else letzterFehler = "HTTP $code"
            } catch (e: Exception) {
                letzterFehler = e.toString()
                Log.w(WebServer.TAG, "Webhook $art: $e")
            }
        }
    }

    fun status(ctx: Context): JSONObject = JSONObject()
        .put("ha", ha(ctx))
        .put("gesendet", gesendet)
        .put("fehler", letzterFehler ?: JSONObject.NULL)
}

/** Kleine Lesehilfen für Sysfs und Systemeigenschaften des Radios. */
object Geraet {
    const val MISC = "/sys/class/wits/misc"

    fun lesen(pfad: String): String? = try {
        File(pfad).readText().trim()
    } catch (e: Exception) {
        null
    }

    fun misc(name: String): String? = lesen("$MISC/$name")

    fun schreiben(pfad: String, wert: String): String? = try {
        File(pfad).writeText(wert)
        null
    } catch (e: Exception) {
        e.toString()
    }

    /** Alle Systemeigenschaften (`getprop`), als Zuordnung. */
    fun eigenschaften(): Map<String, String> = try {
        val p = ProcessBuilder("getprop").redirectErrorStream(true).start()
        val text = p.inputStream.bufferedReader().readText()
        p.waitFor()
        Regex("""^\[([^\]]+)\]: \[(.*)\]$""", RegexOption.MULTILINE).findAll(text)
            .associate { it.groupValues[1] to it.groupValues[2] }
    } catch (e: Exception) {
        emptyMap()
    }
}
