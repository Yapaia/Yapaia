package de.yapaia.cam

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.EditText
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Update direkt aus Home Assistant: `<adresse>yapaia-cam.json` sagt, welche
 * Version bereitliegt (schreibt cam/signieren.sh), `<adresse>yapaia-cam.apk`
 * ist die App. Installiert wird über den PackageInstaller – Android fragt
 * einmal nach „Unbekannte Apps installieren“ und dann je Update kurz nach.
 */
class Aktualisierung(private val activity: Activity) {

    private val ui = Handler(Looper.getMainLooper())
    private val einstellungen = activity.getSharedPreferences("update", Activity.MODE_PRIVATE)

    var adresse: String
        get() = einstellungen.getString("adresse", STANDARD) ?: STANDARD
        set(wert) {
            val sauber = wert.trim().let { if (it.endsWith("/")) it else "$it/" }
            einstellungen.edit().putString("adresse", sauber).apply()
        }

    /** Langes Drücken auf „Update“: Adresse von Home Assistant ändern. */
    fun adresseFragen() {
        val feld = EditText(activity).apply { setText(adresse) }
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_adresse)
            .setView(feld)
            .setPositiveButton(android.R.string.ok) { _, _ -> adresse = feld.text.toString() }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    fun pruefenUndInstallieren() {
        melden(activity.getString(R.string.update_suche))
        Thread {
            try {
                val stand = JSONObject(lesen(adresse + "yapaia-cam.json"))
                val neu = stand.getInt("versionCode")
                val neuName = stand.optString("versionName", neu.toString())
                if (neu <= eigeneVersion()) {
                    melden(activity.getString(R.string.update_aktuell, eigenerName()))
                    return@Thread
                }
                melden(activity.getString(R.string.update_laedt, neuName))
                installieren(adresse + "yapaia-cam.apk")
            } catch (e: Exception) {
                melden(activity.getString(R.string.update_fehler, e.message ?: e.javaClass.simpleName))
            }
        }.start()
    }

    /** Rückmeldung des PackageInstallers (kommt als neuer Intent an die Activity). */
    fun ergebnis(intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val bestaetigen = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (bestaetigen != null) activity.startActivity(bestaetigen)
            }
            PackageInstaller.STATUS_SUCCESS -> {}
            else -> melden(activity.getString(R.string.update_fehler,
                intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: status.toString()))
        }
    }

    private fun installieren(apk: String) {
        val installer = activity.packageManager.packageInstaller
        val sitzungId = installer.createSession(PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL))
        installer.openSession(sitzungId).use { sitzung ->
            val verbindung = URL(apk).openConnection() as HttpURLConnection
            verbindung.connectTimeout = 10_000
            verbindung.readTimeout = 30_000
            verbindung.inputStream.use { ein ->
                sitzung.openWrite("yapaia-cam.apk", 0, -1).use { aus ->
                    ein.copyTo(aus)
                    sitzung.fsync(aus)
                }
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val zurueck = Intent(activity, MainActivity::class.java).setAction(AKTION)
            sitzung.commit(PendingIntent.getActivity(activity, 0, zurueck, flags).intentSender)
        }
    }

    private fun lesen(url: String): String {
        val verbindung = URL(url).openConnection() as HttpURLConnection
        verbindung.connectTimeout = 10_000
        verbindung.readTimeout = 10_000
        verbindung.useCaches = false
        return verbindung.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
    }

    private fun eigeneVersion(): Long {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        @Suppress("DEPRECATION")
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    }

    private fun eigenerName(): String =
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "?"

    private fun melden(text: String) = ui.post { Toast.makeText(activity, text, Toast.LENGTH_LONG).show() }

    companion object {
        const val AKTION = "de.yapaia.cam.UPDATE"
        /** Home Assistant im Wohnmobil (Port 80); änderbar per langem Druck auf „Update“. */
        const val STANDARD = "http://192.168.8.235/local/"
    }
}
