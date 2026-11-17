package de.yapaia.cam

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.provider.Settings
import org.json.JSONObject
import java.io.File

/**
 * Zustände des Radios für Home Assistant (`/status` → `sensoren`).
 *
 * - MCU über Sysfs (`/sys/class/wits/misc`, jede Sekunde): Zündung,
 *   Rückwärtsgang, Handbremse, Licht, Blinker. Zündung und Rückwärtsgang
 *   meldet das Modul bei jeder Änderung sofort per Webhook ([Melder]).
 * - Systemeigenschaften (`getprop`, alle 10 s): Bordspannung, Quelle, CAN.
 * - Android: GPS, WLAN, Lautstärke, Helligkeit; Temperaturen und Lüfter aus Sysfs.
 */
class SensorModul(private val ctx: Context) : Modul {

    companion object {
        val ROH_ORDNER = listOf("/sys/class/wits/misc", "/sys/class/wits/mcu", "/sys/class/wits/swc",
            "/sys/class/wits/tkey", "/sys/class/wits/version")
        /** Nicht übernehmen: Geräte-IDs, Dienststarts, Bootzeiten. */
        val AUSLASSEN = listOf("init.svc", "ro.boottime", "persist.wits.imei", "persist.wits.ota.sn")
        /** Ändern sich ständig – nicht ins Protokoll. */
        val RAUSCHEN = listOf("wits.acc.on.time")
    }

    override val name = "sensoren"

    private val faden = HandlerThread("sensoren").apply { start() }
    private val handler = Handler(faden.looper)
    private val audio = ctx.getSystemService(AudioManager::class.java)

    @Volatile private var mcu = JSONObject()
    @Volatile private var langsam = JSONObject()
    @Volatile private var ort: Location? = null
    @Volatile private var satelliten: Int? = null
    private var gemeldet: String? = null
    private var letzteMeldung = 0L
    private var runde = 0

    // Rohwerte: alle lesbaren MCU-Dateien und wits-/CAN-Eigenschaften, mit Änderungsprotokoll
    @Volatile private var roh = sortedMapOf<String, String>()
    private val aenderungen = ArrayDeque<JSONObject>()
    private var props = mapOf<String, String>()

    private val ortHoerer = object : LocationListener {
        override fun onLocationChanged(l: Location) { ort = l }
        override fun onLocationChanged(l: MutableList<Location>) { l.lastOrNull()?.let { ort = it } }
        @Deprecated("") override fun onStatusChanged(p: String?, s: Int, e: Bundle?) {}
        override fun onProviderEnabled(p: String) {}
        override fun onProviderDisabled(p: String) {}
    }

    private val takt = object : Runnable {
        override fun run() {
            try { messen() } catch (e: Exception) { mcu = JSONObject().put("fehler", e.toString()) }
            handler.postDelayed(this, 1000)
        }
    }

    override fun starten() {
        ortStarten()
        handler.post(takt)
    }

    override fun stoppen() {
        handler.removeCallbacksAndMessages(null)
        try { ctx.getSystemService(LocationManager::class.java).removeUpdates(ortHoerer) } catch (_: Exception) {}
    }

    @SuppressLint("MissingPermission")
    private fun ortStarten() {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val lm = ctx.getSystemService(LocationManager::class.java)
        try {
            ort = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, ortHoerer, faden.looper)
            if (android.os.Build.VERSION.SDK_INT >= 24) {
                lm.registerGnssStatusCallback(object : android.location.GnssStatus.Callback() {
                    override fun onSatelliteStatusChanged(s: android.location.GnssStatus) {
                        satelliten = (0 until s.satelliteCount).count { s.usedInFix(it) }
                    }
                }, handler)
            }
        } catch (e: Exception) {
            langsam = JSONObject().put("gps_fehler", e.toString())
        }
    }

    private fun bit(name: String): Any = Geraet.misc(name)?.let { it == "1" } ?: JSONObject.NULL

    private fun messen() {
        mcu = JSONObject()
            .put("zuendung", bit("acc"))
            .put("rueckwaerts", bit("backcar"))
            .put("handbremse", bit("brake"))
            .put("licht", bit("ill"))
            .put("blinker_links", bit("turnl"))
            .put("blinker_rechts", bit("turnr"))
            .put("mcu_zustand", Geraet.misc("mcu_state") ?: JSONObject.NULL)
            .put("stumm", bit("mute"))

        // Zündung/Rückwärtsgang: sofort melden, sonst jede Minute als Lebenszeichen
        val schluessel = "${mcu.opt("zuendung")}/${mcu.opt("rueckwaerts")}"
        val jetzt = System.currentTimeMillis()
        if (schluessel != gemeldet || jetzt - letzteMeldung > 60_000) {
            gemeldet = schluessel
            letzteMeldung = jetzt
            Melder.senden(ctx, "zustand", JSONObject()
                .put("zuendung", mcu.opt("zuendung"))
                .put("rueckwaerts", mcu.opt("rueckwaerts"))
                .put("handbremse", mcu.opt("handbremse")))
        }
        if (runde % 2 == 0) props = Geraet.eigenschaften().filterKeys { k ->
            (k.contains("wits") || k.startsWith("can.") || k.startsWith("vendor.can")) &&
                AUSLASSEN.none { k.startsWith(it) || k.endsWith(it) }
        }
        if (runde++ % 10 == 0) langsam = langsamMessen()
        rohMessen()
    }

    private fun rohMessen() {
        val neu = sortedMapOf<String, String>()
        for (ordner in ROH_ORDNER) {
            File(ordner).listFiles()?.filter { it.isFile && it.canRead() && it.name != "uevent" }?.forEach { f ->
                val w = Geraet.lesen(f.path) ?: return@forEach
                if (w.length <= 120) neu["sys:${f.parentFile?.name}/${f.name}"] = w
            }
        }
        for ((k, v) in props) neu["prop:$k"] = v
        val alt = roh
        if (alt.isNotEmpty()) {
            val zeit = System.currentTimeMillis() / 1000
            for (k in (alt.keys + neu.keys)) {
                if (alt[k] == neu[k] || RAUSCHEN.any { k.endsWith(it) }) continue
                synchronized(aenderungen) {
                    aenderungen.addFirst(JSONObject().put("zeit", zeit).put("wert", k)
                        .put("alt", alt[k] ?: JSONObject.NULL).put("neu", neu[k] ?: JSONObject.NULL))
                    while (aenderungen.size > 40) aenderungen.removeLast()
                }
            }
        }
        roh = neu
    }

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        when (rest) {
            "roh" -> antwort.text(200, JSONObject()
                .put("roh", JSONObject(roh as Map<*, *>))
                .put("aenderungen", synchronized(aenderungen) { org.json.JSONArray(aenderungen.toList()) })
                .toString(2) + "\n", "application/json")
            "vergessen" -> { synchronized(aenderungen) { aenderungen.clear() }; antwort.text(200, "ok\n") }
            else -> return false
        }
        return true
    }

    private fun langsamMessen(): JSONObject {
        val p = Geraet.eigenschaften()
        val j = JSONObject()
        p["wits.battery.vol"]?.toIntOrNull()?.let { j.put("spannung_v", it / 10.0) }
        j.put("quelle", p["wits.source"] ?: JSONObject.NULL)
            .put("vordergrund_app", p["wits.top.package"] ?: JSONObject.NULL)
            .put("audiofokus", p["wits.cur.audio.focus"] ?: JSONObject.NULL)
            .put("frueh_rueckwaerts", p["wits.early.reverse"]?.let { it == "1" } ?: JSONObject.NULL)
            .put("zuendung_seit", p["wits.acc.on.time"] ?: JSONObject.NULL)
            .put("can", JSONObject()
                .put("tuer", p["can.door"] ?: JSONObject.NULL)
                .put("radar", p["can.radar"] ?: JSONObject.NULL)
                .put("lenkwinkel", p["vendor.can.angle"]?.toIntOrNull() ?: JSONObject.NULL))
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        j.put("lautstaerke", audio.getStreamVolume(AudioManager.STREAM_MUSIC)).put("lautstaerke_max", max)
        try {
            j.put("helligkeit", Settings.System.getInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS))
        } catch (_: Exception) {}
        j.put("temperaturen", temperaturen())
        j.put("luefter", JSONObject()
            .put("upm", Geraet.lesen("/sys/class/hwmon/hwmon0/fan1_input")?.toIntOrNull() ?: JSONObject.NULL)
            .put("pwm", Geraet.lesen("/sys/class/hwmon/hwmon0/pwm1")?.toIntOrNull() ?: JSONObject.NULL))
        j.put("wlan", wlan())
        return j
    }

    /** °C: SoC (heißester CPU-Kern), GPU, Endstufe (pa-therm0), Platine (quiet-therm), Quarz (xo-therm). */
    private fun temperaturen(): JSONObject {
        val werte = mutableMapOf<String, Double>()
        File("/sys/class/thermal").listFiles()?.filter { it.name.startsWith("thermal_zone") }?.forEach { z ->
            val typ = Geraet.lesen("${z.path}/type") ?: return@forEach
            val t = Geraet.lesen("${z.path}/temp")?.toDoubleOrNull() ?: return@forEach
            werte[typ] = t / 1000.0
        }
        fun r(v: Double?) = v?.let { Math.round(it * 10) / 10.0 } ?: JSONObject.NULL
        return JSONObject()
            .put("soc", r(werte.filterKeys { it.startsWith("cpu") && it.endsWith("-usr") }.values.maxOrNull()))
            .put("gpu", r(werte["gpu-usr"]))
            .put("endstufe", r(werte["pa-therm0-usr"]))
            .put("platine", r(werte["quiet-therm-usr"]))
            .put("quarz", r(werte["xo-therm-usr"]))
    }

    @Suppress("DEPRECATION")
    private fun wlan(): JSONObject = try {
        val w = ctx.applicationContext.getSystemService(WifiManager::class.java)
        val i = w.connectionInfo
        JSONObject()
            .put("ssid", i.ssid?.trim('"')?.takeIf { it != "<unknown ssid>" } ?: JSONObject.NULL)
            .put("rssi", i.rssi)
            .put("mbit", i.linkSpeed)
            .put("mhz", i.frequency)
    } catch (e: Exception) {
        JSONObject().put("fehler", e.toString())
    }

    override fun status(): JSONObject {
        val j = JSONObject(mcu.toString())
        val l = langsam
        l.keys().forEach { j.put(it, l.get(it)) }
        val o = ort
        j.put("gps", if (o == null) JSONObject.NULL else JSONObject()
            .put("breite", o.latitude)
            .put("laenge", o.longitude)
            .put("hoehe_m", if (o.hasAltitude()) Math.round(o.altitude) else JSONObject.NULL)
            .put("tempo_kmh", if (o.hasSpeed()) Math.round(o.speed * 36) / 10.0 else JSONObject.NULL)
            .put("richtung", if (o.hasBearing()) Math.round(o.bearing) else JSONObject.NULL)
            .put("genauigkeit_m", if (o.hasAccuracy()) Math.round(o.accuracy * 10) / 10.0 else JSONObject.NULL)
            .put("alter_s", (System.currentTimeMillis() - o.time) / 1000)
            .put("satelliten", satelliten ?: JSONObject.NULL))
        j.put("webhook", Melder.status(ctx))
        j.put("aenderungen", synchronized(aenderungen) { org.json.JSONArray(aenderungen.take(15)) })
        return j
    }
}
