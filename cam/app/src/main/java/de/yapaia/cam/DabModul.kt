package de.yapaia.cam

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.browse.MediaBrowser
import android.media.session.MediaController
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Steuerung der DAB-App „DABdream“ (com.thf.dabplayer) über ihren
 * MediaBrowserService – dieselbe Schnittstelle, die Android Auto nutzt.
 *
 * - `/dab/befehl?aktion=play|pause|weiter|zurueck|starten`
 * - `/dab/sender?id=<mediaId>` oder `?name=<Sendername>`
 * - `/status` → `dab`: verbunden, spielt, Sender, Titel, Senderliste
 *
 * Kein Mitschnitt des Tons (das ist ein eigener Schritt für Beat).
 */
class DabModul(private val ctx: Context) : Modul {

    override val name = "dab"

    private val haupt = Handler(Looper.getMainLooper())
    @Volatile private var browser: MediaBrowser? = null
    @Volatile private var steuerung: MediaController? = null
    @Volatile private var sender = listOf<Pair<String, String>>()   // (mediaId, Name)
    @Volatile private var fehler: String? = null
    @Volatile private var laeuft = false

    override fun starten() {
        laeuft = true
        haupt.post { verbinden() }
    }

    override fun stoppen() {
        laeuft = false
        haupt.post { try { browser?.disconnect() } catch (_: Exception) {}; browser = null; steuerung = null }
    }

    private fun verbinden() {
        if (!laeuft || browser?.isConnected == true) return
        try { browser?.disconnect() } catch (_: Exception) {}
        val b = MediaBrowser(ctx, ComponentName(PAKET, DIENST), object : MediaBrowser.ConnectionCallback() {
            override fun onConnected() {
                val b = browser ?: return
                steuerung = MediaController(ctx, b.sessionToken)
                fehler = null
                senderLaden(b, b.root, 0)
            }
            override fun onConnectionSuspended() { steuerung = null; spaeter() }
            override fun onConnectionFailed() { steuerung = null; fehler = "DABdream nicht erreichbar"; spaeter() }
        }, null)
        browser = b
        try { b.connect() } catch (e: Exception) { fehler = "verbinden: $e"; spaeter() }
    }

    /** Erneut versuchen (DABdream gestartet/neu installiert). */
    private fun spaeter() {
        haupt.removeCallbacksAndMessages(null)
        if (laeuft) haupt.postDelayed({ verbinden() }, 30_000)
    }

    /** Senderliste: alle abspielbaren Einträge, Ordner bis Tiefe 2. */
    private fun senderLaden(b: MediaBrowser, id: String, tiefe: Int) {
        b.subscribe(id, object : MediaBrowser.SubscriptionCallback() {
            override fun onChildrenLoaded(parentId: String, kinder: MutableList<MediaBrowser.MediaItem>) {
                val neu = sender.toMutableList()
                for (k in kinder) {
                    val mid = k.mediaId ?: continue
                    val titel = k.description.title?.toString() ?: mid
                    if (k.isPlayable && neu.none { it.first == mid || it.second == titel }) neu.add(mid to titel)
                    if (k.isBrowsable && tiefe < 2) senderLaden(b, mid, tiefe + 1)
                }
                sender = neu
            }
            override fun onError(parentId: String) { fehler = "Senderliste: $parentId" }
        })
    }

    private fun appStarten(): Boolean = try {
        val i = ctx.packageManager.getLaunchIntentForPackage(PAKET)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (i != null) ctx.startActivity(i)
        haupt.postDelayed({ verbinden() }, 3000)
        i != null
    } catch (e: Exception) { fehler = "starten: $e"; false }

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        val p = anfrage.parameter
        val c = steuerung
        when (rest) {
            "befehl" -> {
                when (p["aktion"]) {
                    "starten" -> appStarten()
                    "play" -> c?.transportControls?.play() ?: appStarten()
                    "pause" -> c?.transportControls?.pause()
                    "weiter" -> c?.transportControls?.skipToNext()
                    "zurueck" -> c?.transportControls?.skipToPrevious()
                    else -> { antwort.text(400, "aktion=play|pause|weiter|zurueck|starten\n"); return true }
                }
            }
            "sender" -> {
                val id = p["id"] ?: p["name"]?.let { n -> sender.firstOrNull { it.second.equals(n, true) }?.first }
                if (id == null) { antwort.text(400, "unbekannter Sender\n"); return true }
                if (c == null) { appStarten(); antwort.text(503, "DABdream wird gestartet, gleich noch einmal\n"); return true }
                c.transportControls.playFromMediaId(id, null)
            }
            "neu" -> haupt.post { sender = listOf(); browser?.let { senderLaden(it, it.root, 0) } ?: verbinden() }
            else -> return false
        }
        // kurz warten, damit der neue Zustand schon in der Antwort steht
        Thread.sleep(400)
        antwort.text(200, status().toString(2) + "\n", "application/json")
        return true
    }

    override fun status(): JSONObject {
        val c = steuerung
        val st = c?.playbackState
        val md = c?.metadata
        fun m(k: String) = md?.getString(k)
        val beschreibung = md?.description
        return JSONObject()
            .put("verbunden", c != null)
            .put("spielt", st?.state == PlaybackState.STATE_PLAYING)
            .put("zustand", when (st?.state) {
                PlaybackState.STATE_PLAYING -> "playing"; PlaybackState.STATE_PAUSED -> "paused"
                PlaybackState.STATE_BUFFERING, PlaybackState.STATE_CONNECTING -> "buffering"
                PlaybackState.STATE_STOPPED, PlaybackState.STATE_NONE, null -> "idle"; else -> "on" })
            .put("sender", m(MediaMetadata.METADATA_KEY_ALBUM) ?: beschreibung?.description?.toString() ?: JSONObject.NULL)
            .put("titel", m(MediaMetadata.METADATA_KEY_TITLE) ?: beschreibung?.title?.toString() ?: JSONObject.NULL)
            .put("interpret", m(MediaMetadata.METADATA_KEY_ARTIST) ?: beschreibung?.subtitle?.toString() ?: JSONObject.NULL)
            .put("anzeige", listOfNotNull(beschreibung?.title, beschreibung?.subtitle, beschreibung?.description)
                .joinToString(" · "))
            .put("sender_liste", JSONArray(sender.map { it.second }))
            .put("sender_ids", JSONArray(sender.map { it.first }))
            .put("fehler", fehler ?: JSONObject.NULL)
    }

    companion object {
        const val PAKET = "com.thf.dabplayer"
        const val DIENST = "com.thf.dabplayer.service.DabService"
    }
}
