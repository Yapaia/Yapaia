package de.yapaia.cam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.NetworkInterface

/**
 * Vordergrunddienst „Yapaia“: läuft ohne sichtbare Activity, startet beim
 * Booten und bietet die Module (zurzeit nur [KameraModul]) per HTTP an:
 *
 * - `/status` – JSON: App, Version, Adressen und je Modul ein Abschnitt
 * - `/<modul>/…` – Anfragen an das Modul, z. B. `/kamera/3.mjpg`
 */
class YapaiaDienst : Service() {

    private lateinit var module: List<Modul>
    private var server: WebServer? = null

    override fun onCreate() {
        super.onCreate()
        vordergrund()
        module = listOf(KameraModul(this))
        module.forEach { it.starten() }
        server = WebServer(PORT, ::bearbeiten).also { it.starten() }
        Log.i(WebServer.TAG, "Dienst läuft auf Port $PORT")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // erneut in den Vordergrund (falls der Dienst jetzt aus einer Activity
        // gestartet wird, bekommt er damit auch Zugriff auf die Kamera)
        vordergrund()
        intent?.action?.let { a -> module.forEach { it.befehl(a) } }
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stoppen()
        module.forEach { it.stoppen() }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun vordergrund() {
        val n = benachrichtigung()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
            } else {
                startForeground(1, n)
            }
        } catch (e: Exception) {
            Log.w(WebServer.TAG, "Vordergrund: $e")
        }
    }

    private fun benachrichtigung(): Notification {
        val oeffnen = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val text = getString(R.string.dienst_text, adressen().firstOrNull() ?: "localhost", PORT)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(KANAL, getString(R.string.dienst_kanal), NotificationManager.IMPORTANCE_MIN))
            Notification.Builder(this, KANAL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_kamera)
            .setContentIntent(oeffnen)
            .setOngoing(true)
            .build()
    }

    private fun bearbeiten(a: Anfrage, antwort: Antwort) {
        val teile = a.pfad.trim('/').split('/', limit = 2)
        when {
            teile[0] == "status" -> antwort.text(200, status().toString(2) + "\n", "application/json")
            teile[0] == "" -> antwort.text(200, startseite(), "text/html; charset=utf-8")
            else -> {
                val m = module.firstOrNull { it.name == teile[0] }
                if (m == null || !m.bearbeiten(teile.getOrElse(1) { "" }, a, antwort)) antwort.text(404, "not found\n")
            }
        }
    }

    private fun status(): JSONObject {
        val info = packageManager.getPackageInfo(packageName, 0)
        val j = JSONObject()
            .put("app", "Yapaia")
            .put("version", info.versionName)
            .put("adressen", JSONArray(adressen()))
            .put("port", PORT)
            .put("module", JSONArray(module.map { it.name }))
        for (m in module) j.put(m.name, try { m.status() } catch (e: Exception) { JSONObject().put("fehler", e.toString()) })
        return j
    }

    private fun startseite(): String {
        val links = (1..4).joinToString("") { "<li>$it: <a href=\"/kamera/$it.mjpg\">mjpg</a> · <a href=\"/kamera/$it.jpg\">jpg</a></li>" }
        return "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\">" +
            "<title>Yapaia</title><h1>Yapaia</h1><p><a href=\"/status\">/status</a></p><ul>$links</ul>"
    }

    private fun adressen(): List<String> = try {
        NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }.filterIsInstance<java.net.Inet4Address>().map { it.hostAddress ?: "" }
    } catch (e: Exception) {
        emptyList()
    }

    companion object {
        const val PORT = 8080
        const val KANAL = "dienst"
        const val PAUSE = "de.yapaia.cam.PAUSE"
        const val WEITER = "de.yapaia.cam.WEITER"

        fun starten(ctx: Context, aktion: String? = null) {
            val i = Intent(ctx, YapaiaDienst::class.java).setAction(aktion)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) {
                Log.w(WebServer.TAG, "Dienst starten: $e")
            }
        }
    }
}
