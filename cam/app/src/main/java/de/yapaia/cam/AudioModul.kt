package de.yapaia.cam

import android.content.Context
import android.media.audiofx.LoudnessEnhancer
import android.provider.Settings
import org.json.JSONObject

/**
 * Lautstärke anheben – zum Ausprobieren, in kleinen Schritten, mit Werkswerten.
 *
 * - `loudness` – Settings.System `LOUDNESS_MODE` (braucht „Systemeinstellungen ändern“)
 * - `anhebung` – App-interne Anhebung (LoudnessEnhancer) in mB, 0–[ANHEBUNG_MAX];
 *   wirkt auf den eigenen Player, mit `global=1` versuchsweise auf die ganze Ausgabe
 * - `audio_vol`, `audio_output_gain` – MCU-Werte (Sysfs), je Aufruf höchstens
 *   [SCHRITT_VOL] bzw. 1 Schritt, nach oben begrenzt
 * - `audio_ch_gain` – nur lesbar (0444)
 * - `/audio/werkswerte` – alles zurück auf die beim ersten Start gemerkten Werte
 *
 * Achtung: MCU-Werte gehen direkt auf die Endstufe (Verzerrung, Lautsprecher).
 * Nur bei kleiner Lautstärke probieren.
 */
class AudioModul(private val ctx: Context) : Modul {

    override val name = "audio"

    private val einstellungen = ctx.getSharedPreferences("dienst_audio", Context.MODE_PRIVATE)
    @Volatile var anhebung = einstellungen.getInt("anhebung", 0)
        private set
    @Volatile private var global = einstellungen.getBoolean("global", false)
    private var globalVerstaerker: LoudnessEnhancer? = null
    @Volatile private var fehler: String? = null

    /** Wird vom Player gerufen, wenn sich die Anhebung ändert. */
    var beiAnhebung: ((Int) -> Unit)? = null

    override fun starten() {
        if (!einstellungen.contains("werk_audio_vol")) {
            einstellungen.edit()
                .putString("werk_audio_vol", Geraet.misc("audio_vol"))
                .putString("werk_audio_output_gain", Geraet.misc("audio_output_gain"))
                .putInt("werk_loudness", loudness() ?: 0)
                .apply()
        }
        if (global) globalSetzen()
    }

    override fun stoppen() {
        globalVerstaerker?.release()
        globalVerstaerker = null
    }

    private fun werk(k: String) = einstellungen.getString("werk_$k", null)?.toIntOrNull()

    private fun loudness(): Int? = try {
        Settings.System.getInt(ctx.contentResolver, "LOUDNESS_MODE")
    } catch (e: Exception) {
        null
    }

    private fun globalSetzen() {
        try {
            if (global && anhebung > 0) {
                val v = globalVerstaerker ?: LoudnessEnhancer(0).also { globalVerstaerker = it }
                v.setTargetGain(anhebung)
                v.enabled = true
            } else {
                globalVerstaerker?.release()
                globalVerstaerker = null
            }
        } catch (e: Exception) {
            fehler = "global: $e"
            globalVerstaerker = null
        }
    }

    /** MCU-Wert [datei] auf [neu] setzen, höchstens [schritt] vom aktuellen Wert entfernt, in [bereich]. */
    private fun mcuSetzen(datei: String, neu: Int, schritt: Int, bereich: IntRange): String? {
        val alt = Geraet.misc(datei)?.toIntOrNull() ?: return "$datei nicht lesbar"
        val ziel = neu.coerceIn(alt - schritt, alt + schritt).coerceIn(bereich)
        if (ziel == alt) return null
        return Geraet.schreiben("${Geraet.MISC}/$datei", ziel.toString())
    }

    private fun volBereich() = 0..((werk("audio_vol") ?: 5) + VOL_UEBER_WERK).coerceAtMost(40)

    private fun einstellen(p: Map<String, String>) {
        val f = mutableListOf<String>()
        p["loudness"]?.let { v ->
            try {
                if (!Settings.System.canWrite(ctx)) f += "Systemeinstellungen ändern nicht erlaubt"
                else Settings.System.putInt(ctx.contentResolver, "LOUDNESS_MODE", if (v == "1" || v == "true") 1 else 0)
            } catch (e: Exception) {
                f += "loudness: $e"
            }
        }
        p["anhebung"]?.toIntOrNull()?.let {
            anhebung = it.coerceIn(0, ANHEBUNG_MAX)
            einstellungen.edit().putInt("anhebung", anhebung).apply()
            beiAnhebung?.invoke(anhebung)
        }
        p["global"]?.let {
            global = it == "1" || it == "true"
            einstellungen.edit().putBoolean("global", global).apply()
        }
        if (p.containsKey("anhebung") || p.containsKey("global")) globalSetzen()
        p["audio_vol"]?.toIntOrNull()?.let { v -> mcuSetzen("audio_vol", v, SCHRITT_VOL, volBereich())?.let { f += it } }
        p["audio_output_gain"]?.toIntOrNull()?.let { v -> mcuSetzen("audio_output_gain", v, 1, 0..GAIN_MAX)?.let { f += it } }
        fehler = f.joinToString("; ").ifEmpty { null }
    }

    private fun werkswerte() {
        val f = mutableListOf<String>()
        werk("audio_vol")?.let { Geraet.schreiben("${Geraet.MISC}/audio_vol", it.toString())?.let { e -> f += e } }
        werk("audio_output_gain")?.let { Geraet.schreiben("${Geraet.MISC}/audio_output_gain", it.toString())?.let { e -> f += e } }
        if (loudness() != einstellungen.getInt("werk_loudness", 0)) {
            try { Settings.System.putInt(ctx.contentResolver, "LOUDNESS_MODE", einstellungen.getInt("werk_loudness", 0)) } catch (e: Exception) { f += "loudness: $e" }
        }
        anhebung = 0
        global = false
        einstellungen.edit().putInt("anhebung", 0).putBoolean("global", false).apply()
        beiAnhebung?.invoke(0)
        globalSetzen()
        fehler = f.joinToString("; ").ifEmpty { null }
    }

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        when (rest) {
            "einstellen" -> einstellen(anfrage.parameter)
            "werkswerte" -> werkswerte()
            else -> return false
        }
        antwort.text(200, status().toString(2) + "\n", "application/json")
        return true
    }

    override fun status(): JSONObject = JSONObject()
        .put("loudness", loudness() ?: JSONObject.NULL)
        .put("einstellungen_erlaubt", Settings.System.canWrite(ctx))
        .put("anhebung_mb", anhebung)
        .put("anhebung_max_mb", ANHEBUNG_MAX)
        .put("global", global)
        .put("global_aktiv", globalVerstaerker != null)
        .put("audio_vol", Geraet.misc("audio_vol")?.toIntOrNull() ?: JSONObject.NULL)
        .put("audio_vol_max", volBereich().last)
        .put("audio_output_gain", Geraet.misc("audio_output_gain")?.toIntOrNull() ?: JSONObject.NULL)
        .put("audio_output_gain_max", GAIN_MAX)
        .put("audio_ch_gain", Geraet.misc("audio_ch_gain") ?: JSONObject.NULL)
        .put("werkswerte", JSONObject()
            .put("audio_vol", werk("audio_vol") ?: JSONObject.NULL)
            .put("audio_output_gain", werk("audio_output_gain") ?: JSONObject.NULL)
            .put("loudness", einstellungen.getInt("werk_loudness", 0)))
        .put("fehler", fehler ?: JSONObject.NULL)

    companion object {
        const val ANHEBUNG_MAX = 1200
        const val GAIN_MAX = 3
        const val SCHRITT_VOL = 2
        const val VOL_UEBER_WERK = 10
    }
}
