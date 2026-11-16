package de.yapaia.cam

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Diagnose für die Rückfahrkamera: schickt an den Mini-PC (Empfänger auf
 * Port 8765), was dort zum Nachbauen gebraucht wird – Paketliste,
 * Systemeigenschaften, Videogeräte und die APKs der Kamera-Apps (z. B. F-Cam).
 * Gedacht nur für die Entwicklung; ohne Empfänger passiert nichts.
 */
class Diagnose(private val activity: Activity, private val ziel: () -> String) {

    private val ui = Handler(Looper.getMainLooper())
    private val kameraApp = Regex("(?i)cam|avin|avm|reverse|rear|back|video|witstek|eonon|car")

    fun senden() {
        melden(activity.getString(R.string.diagnose_start))
        Thread {
            try {
                val pm = activity.packageManager
                val apps = pm.getInstalledApplications(0)
                val liste = apps.sortedBy { it.packageName }.joinToString("\n") { a ->
                    val system = if (a.flags and ApplicationInfo.FLAG_SYSTEM != 0) "system" else "nutzer"
                    "${a.packageName}\t${pm.getApplicationLabel(a)}\t$system\t${a.sourceDir}"
                }
                text("pakete.txt", liste)
                text("getprop.txt", ausfuehren("getprop"))
                text("geraete.txt", ausfuehren("ls -l /dev/video* /dev/v4l-subdev* /dev/media* /sys/class/video4linux 2>&1; cat /sys/class/video4linux/*/name 2>&1"))
                var anzahl = 0
                for (a in apps) {
                    val label = pm.getApplicationLabel(a).toString()
                    if (!kameraApp.containsMatchIn(a.packageName) && !kameraApp.containsMatchIn(label)) continue
                    datei("${a.packageName}.apk", File(a.sourceDir))
                    a.splitSourceDirs?.forEachIndexed { i, s -> datei("${a.packageName}.split$i.apk", File(s)) }
                    anzahl++
                }
                melden(activity.getString(R.string.diagnose_fertig, anzahl))
            } catch (e: Exception) {
                melden(activity.getString(R.string.diagnose_fehler, e.message ?: e.javaClass.simpleName))
            }
        }.start()
    }

    private fun ausfuehren(befehl: String): String = try {
        val p = ProcessBuilder("sh", "-c", befehl).redirectErrorStream(true).start()
        p.inputStream.bufferedReader().readText()
    } catch (e: Exception) {
        e.toString()
    }

    private fun text(name: String, inhalt: String) = hochladen(name, inhalt.toByteArray().size.toLong()) {
        it.write(inhalt.toByteArray())
    }

    private fun datei(name: String, f: File) {
        if (!f.canRead()) return
        hochladen(name, f.length()) { aus -> f.inputStream().use { it.copyTo(aus) } }
    }

    private fun hochladen(name: String, laenge: Long, schreiben: (java.io.OutputStream) -> Unit) {
        val v = URL(ziel()).openConnection() as HttpURLConnection
        v.requestMethod = "POST"
        v.doOutput = true
        v.connectTimeout = 10_000
        v.setRequestProperty("X-Name", name)
        v.setFixedLengthStreamingMode(laenge)
        v.outputStream.use(schreiben)
        if (v.responseCode != 200) throw IllegalStateException("$name: HTTP ${v.responseCode}")
        v.disconnect()
    }

    private fun melden(text: String) = ui.post { Toast.makeText(activity, text, Toast.LENGTH_LONG).show() }
}
