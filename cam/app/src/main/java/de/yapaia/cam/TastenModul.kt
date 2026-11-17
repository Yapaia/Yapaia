package de.yapaia.cam

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import org.json.JSONArray
import org.json.JSONObject

/**
 * Tasten des Radios (Bedienfeld, Drehrad, Lenkrad) für Home Assistant.
 *
 * Der [TastenDienst] (Bedienungshilfe) sieht jeden Tastendruck, auch wenn die
 * App nicht im Vordergrund ist. Jeder Druck geht als Webhook `taste` an HA
 * (dort Ereignis `yapaia_radio_taste` mit Code, Name, kurz/lang).
 *
 * - `/tasten/lernen?an=1` – Lernmodus: die letzten Codes mit Quelle in `/status`
 * - `/tasten/benennen?code=24&name=Lauter[&abfangen=1]` – Name; `abfangen` =
 *   das Radio selbst bekommt die Taste nicht mehr (nur HA)
 * - `/tasten/vergessen?code=24`
 */
class TastenModul(private val ctx: Context) : Modul {

    override val name = "tasten"

    private val einstellungen = ctx.getSharedPreferences("dienst_tasten", Context.MODE_PRIVATE)
    private val letzte = ArrayDeque<JSONObject>()
    @Volatile private var lernen = einstellungen.getBoolean("lernen", false)
    private val unten = mutableMapOf<Int, Long>()
    private val langGemeldet = mutableSetOf<Int>()

    override fun starten() { aktuell = this }
    override fun stoppen() { if (aktuell === this) aktuell = null }

    private fun namen(): JSONObject = JSONObject(einstellungen.getString("namen", "{}") ?: "{}")

    /** Vom [TastenDienst]: true = Taste verschlucken. */
    fun taste(e: KeyEvent): Boolean {
        val code = e.keyCode
        val eintrag = namen().optJSONObject(code.toString())
        val abfangen = eintrag?.optBoolean("abfangen") == true
        when (e.action) {
            KeyEvent.ACTION_DOWN -> synchronized(this) {
                if (e.repeatCount == 0) { unten[code] = SystemClock.uptimeMillis(); langGemeldet -= code }
                // lange gedrückt: schon beim Halten melden (einmal)
                else if (code !in langGemeldet && SystemClock.uptimeMillis() - (unten[code] ?: e.downTime) >= LANG_MS) {
                    langGemeldet += code
                    melden(e, eintrag, "lang")
                }
            }
            KeyEvent.ACTION_UP -> synchronized(this) {
                val dauer = SystemClock.uptimeMillis() - (unten.remove(code) ?: e.downTime)
                if (code in langGemeldet) langGemeldet -= code
                else melden(e, eintrag, if (dauer >= LANG_MS) "lang" else "kurz")
            }
        }
        return abfangen
    }

    private fun melden(e: KeyEvent, eintrag: JSONObject?, art: String) {
        val geraet = InputDevice.getDevice(e.deviceId)?.name ?: "?"
        val j = JSONObject()
            .put("code", e.keyCode)
            .put("taste", KeyEvent.keyCodeToString(e.keyCode).removePrefix("KEYCODE_"))
            .put("scancode", e.scanCode)
            .put("geraet", geraet)
            .put("name", eintrag?.optString("name") ?: JSONObject.NULL)
            .put("art", art)
        Melder.senden(ctx, "taste", j)
        synchronized(letzte) {
            letzte.addFirst(JSONObject(j.toString()).put("zeit", System.currentTimeMillis() / 1000))
            while (letzte.size > (if (lernen) 20 else 5)) letzte.removeLast()
        }
    }

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        val p = anfrage.parameter
        when (rest) {
            "lernen" -> {
                lernen = p["an"] == "1" || p["an"] == "true"
                einstellungen.edit().putBoolean("lernen", lernen).apply()
            }
            "benennen" -> {
                val code = p["code"]?.toIntOrNull() ?: run { antwort.text(400, "code fehlt\n"); return true }
                val n = namen()
                n.put(code.toString(), JSONObject().put("name", p["name"] ?: "").put("abfangen", p["abfangen"] == "1" || p["abfangen"] == "true"))
                einstellungen.edit().putString("namen", n.toString()).apply()
            }
            "vergessen" -> {
                val n = namen()
                n.remove(p["code"] ?: "")
                einstellungen.edit().putString("namen", n.toString()).apply()
            }
            else -> return false
        }
        antwort.text(200, status().toString(2) + "\n", "application/json")
        return true
    }

    override fun status(): JSONObject = JSONObject()
        .put("dienst_aktiv", TastenDienst.aktiv)
        .put("lernen", lernen)
        .put("namen", namen())
        .put("letzte", synchronized(letzte) { JSONArray(letzte.toList()) })

    companion object {
        const val LANG_MS = 600L
        @Volatile var aktuell: TastenModul? = null
    }
}

/**
 * Bedienungshilfe, die nur Tastendrücke filtert. Einschalten:
 * `adb shell settings put secure enabled_accessibility_services de.yapaia.cam/.TastenDienst`
 * und `adb shell settings put secure accessibility_enabled 1`.
 */
class TastenDienst : AccessibilityService() {
    override fun onServiceConnected() {
        aktiv = true
        serviceInfo = serviceInfo.apply { flags = flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS }
        YapaiaDienst.starten(this)
    }

    override fun onKeyEvent(event: KeyEvent): Boolean = try {
        TastenModul.aktuell?.taste(event) ?: false
    } catch (_: Exception) {
        false
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { aktiv = false; super.onDestroy() }

    companion object {
        @Volatile var aktiv = false
    }
}
