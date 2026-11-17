package de.yapaia.cam

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.audiofx.LoudnessEnhancer
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.util.UUID

/**
 * Das Radio als Medienplayer: ein kleiner DLNA/UPnP-Renderer (MediaRenderer:1).
 * Home Assistant findet ihn per SSDP (Integration „DLNA Digital Media Renderer“,
 * `dlna_dmr`) oder über die Adresse `http://<radio>:8080/dlna/geraet.xml`.
 *
 * Spielt jede HTTP-URL, die Android kann (MP3, AAC, HLS, Streams von Beat/Go).
 * Lautstärke = Android-Musiklautstärke (0–15 → 0–100). Ereignis-Abos (GENA)
 * werden abgelehnt; HA fragt den Zustand dann regelmäßig ab.
 *
 * Direkt ohne DLNA: `/player/spielen?url=…`, `/player/pause`, `/player/weiter`, `/player/stopp`.
 */
class PlayerModul(private val ctx: Context, private val audioModul: AudioModul) : Modul {

    override val name = "player"

    private val faden = HandlerThread("player").apply { start() }
    private val h = Handler(faden.looper)
    private val audio = ctx.getSystemService(AudioManager::class.java)
    private val einstellungen = ctx.getSharedPreferences("dienst_player", Context.MODE_PRIVATE)
    private val uuid = einstellungen.getString("uuid", null) ?: UUID.randomUUID().toString().also {
        einstellungen.edit().putString("uuid", it).apply()
    }

    private var spieler: MediaPlayer? = null
    private var verstaerker: LoudnessEnhancer? = null
    private var fokus: AudioFocusRequest? = null
    @Volatile private var url = ""
    @Volatile private var metadaten = ""
    @Volatile private var zustand = "NO_MEDIA_PRESENT"  // STOPPED, PLAYING, PAUSED_PLAYBACK, TRANSITIONING
    @Volatile private var fehler: String? = null
    @Volatile private var dauerMs = 0
    @Volatile private var positionMs = 0
    private var ssdpLaeuft = true
    private var multicast: WifiManager.MulticastLock? = null

    override fun starten() {
        audioModul.beiAnhebung = { mb -> h.post { anhebungSetzen(mb) } }
        Thread({ ssdp() }, "ssdp").start()
        h.post(object : Runnable {
            override fun run() {
                spieler?.let { s -> try { if (zustand == "PLAYING") { positionMs = s.currentPosition; dauerMs = maxOf(0, s.duration) } } catch (_: Exception) {} }
                h.postDelayed(this, 1000)
            }
        })
    }

    override fun stoppen() {
        ssdpLaeuft = false
        h.post { freigeben() }
        try { multicast?.release() } catch (_: Exception) {}
    }

    // ── Wiedergabe (im Player-Faden) ───────────────────────────────────────

    private fun laden(neu: String, meta: String) {
        freigeben()
        url = neu
        metadaten = meta
        zustand = if (neu.isEmpty()) "NO_MEDIA_PRESENT" else "STOPPED"
        positionMs = 0
        dauerMs = 0
    }

    private fun spielen() {
        if (url.isEmpty()) return
        val s = spieler
        if (s != null && zustand == "PAUSED_PLAYBACK") {
            if (!fokusHolen()) return
            s.start()
            zustand = "PLAYING"
            return
        }
        if (s != null && zustand == "PLAYING") return
        freigeben()
        if (!fokusHolen()) return
        zustand = "TRANSITIONING"
        fehler = null
        val m = MediaPlayer()
        spieler = m
        m.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
        m.setOnPreparedListener {
            if (spieler !== it) return@setOnPreparedListener
            dauerMs = maxOf(0, it.duration)
            anhebungSetzen(audioModul.anhebung)
            it.start()
            zustand = "PLAYING"
        }
        m.setOnCompletionListener { if (spieler === it) { zustand = "STOPPED"; fokusAbgeben() } }
        m.setOnErrorListener { mp, was, extra ->
            if (spieler === mp) { fehler = "MediaPlayer $was/$extra"; zustand = "STOPPED"; fokusAbgeben() }
            true
        }
        try {
            m.setDataSource(url)
            m.prepareAsync()
        } catch (e: Exception) {
            fehler = e.toString()
            zustand = "STOPPED"
        }
    }

    private fun pause() {
        val s = spieler ?: return
        if (zustand == "PLAYING") { try { s.pause() } catch (_: Exception) {}; zustand = "PAUSED_PLAYBACK" }
    }

    private fun stopp() {
        freigeben()
        zustand = if (url.isEmpty()) "NO_MEDIA_PRESENT" else "STOPPED"
        positionMs = 0
        fokusAbgeben()
    }

    private fun freigeben() {
        verstaerker?.release(); verstaerker = null
        spieler?.let { try { it.reset(); it.release() } catch (_: Exception) {} }
        spieler = null
    }

    private fun anhebungSetzen(mb: Int) {
        val s = spieler ?: return
        try {
            if (mb <= 0) { verstaerker?.enabled = false; return }
            val v = verstaerker ?: LoudnessEnhancer(s.audioSessionId).also { verstaerker = it }
            v.setTargetGain(mb)
            v.enabled = true
        } catch (e: Exception) {
            fehler = "Anhebung: $e"
        }
    }

    private fun fokusHolen(): Boolean {
        if (Build.VERSION.SDK_INT < 26) return true
        val f = fokus ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
            .setOnAudioFocusChangeListener({ c ->
                when (c) {
                    AudioManager.AUDIOFOCUS_LOSS -> stopp()
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pause()
                }
            }, h).build().also { fokus = it }
        val ok = audio.requestAudioFocus(f) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (!ok) fehler = "kein Audiofokus"
        return ok
    }

    private fun fokusAbgeben() {
        if (Build.VERSION.SDK_INT >= 26) fokus?.let { audio.abandonAudioFocusRequest(it) }
    }

    private fun lautstaerke(): Int {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / maxOf(1, max)
    }

    private fun lautstaerkeSetzen(prozent: Int) {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(prozent.coerceIn(0, 100) * max / 100f), 0)
    }

    private fun stumm() = audio.isStreamMute(AudioManager.STREAM_MUSIC)

    private fun <T> imFaden(f: () -> T): T {
        val ergebnis = java.util.concurrent.FutureTask(f)
        h.post(ergebnis)
        return ergebnis.get(5, java.util.concurrent.TimeUnit.SECONDS)
    }

    // ── HTTP ────────────────────────────────────────────────────────────────

    override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
        val p = anfrage.parameter
        when (rest) {
            "spielen" -> imFaden { p["url"]?.let { laden(it, "") }; spielen() }
            "pause" -> imFaden { pause() }
            "weiter" -> imFaden { spielen() }
            "stopp" -> imFaden { stopp() }
            "lautstaerke" -> p["wert"]?.toIntOrNull()?.let { lautstaerkeSetzen(it) }
            else -> return false
        }
        antwort.text(200, status().toString(2) + "\n", "application/json")
        return true
    }

    override fun status(): JSONObject = JSONObject()
        .put("zustand", zustand)
        .put("url", url)
        .put("titel", Regex("<dc:title>([^<]*)</dc:title>").find(xmlEntschluesseln(metadaten))?.groupValues?.get(1) ?: JSONObject.NULL)
        .put("position_s", positionMs / 1000)
        .put("dauer_s", dauerMs / 1000)
        .put("lautstaerke", lautstaerke())
        .put("stumm", stumm())
        .put("dlna", "/dlna/geraet.xml")
        .put("fehler", fehler ?: JSONObject.NULL)

    /** DLNA: `/dlna/geraet.xml`, `/dlna/<dienst>.xml`, `/dlna/<dienst>/control`, `/dlna/<dienst>/event`. */
    val dlna = object : Modul {
        override val name = "dlna"
        override fun status() = JSONObject().put("uuid", uuid)
        override fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean {
            val xml = "text/xml; charset=\"utf-8\""
            when {
                rest == "geraet.xml" -> antwort.text(200, beschreibung(), xml)
                rest.endsWith(".xml") && Dlna.dienste.containsKey(rest.removeSuffix(".xml")) ->
                    antwort.text(200, Dlna.scpd(rest.removeSuffix(".xml")), xml)
                rest.endsWith("/control") -> steuern(rest.removeSuffix("/control"), anfrage, antwort)
                rest.endsWith("/event") -> antwort.text(501, "")
                else -> return false
            }
            return true
        }
    }

    private fun beschreibung(): String {
        val dienste = Dlna.dienste.keys.joinToString("") { d ->
            val typ = if (d == "avt") "AVTransport" else if (d == "rc") "RenderingControl" else "ConnectionManager"
            "<service><serviceType>urn:schemas-upnp-org:service:$typ:1</serviceType>" +
                "<serviceId>urn:upnp-org:serviceId:$typ</serviceId><SCPDURL>/dlna/$d.xml</SCPDURL>" +
                "<controlURL>/dlna/$d/control</controlURL><eventSubURL>/dlna/$d/event</eventSubURL></service>"
        }
        return """<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
<friendlyName>${einstellungen.getString("name", "Yapaia Radio")}</friendlyName>
<manufacturer>Yapaia</manufacturer><modelName>Yapaia Radio</modelName><modelNumber>${version()}</modelNumber>
<UDN>uuid:$uuid</UDN><dlna:X_DLNADOC>DMR-1.50</dlna:X_DLNADOC>
<serviceList>$dienste</serviceList></device></root>"""
    }

    private fun version() = try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName } catch (_: Exception) { "" }

    private fun steuern(dienst: String, a: Anfrage, antwort: Antwort) {
        val aktion = a.kopf["soapaction"]?.trim('"')?.substringAfter('#') ?: ""
        val text = a.text
        fun arg(n: String) = xmlEntschluesseln(Regex("<$n>(.*?)</$n>", RegexOption.DOT_MATCHES_ALL).find(text)?.groupValues?.get(1) ?: "")
        val aus: Map<String, String> = try {
            imFaden {
                when (aktion) {
                    "SetAVTransportURI" -> { laden(arg("CurrentURI"), arg("CurrentURIMetaData")); emptyMap() }
                    "Play" -> { spielen(); emptyMap() }
                    "Pause" -> { pause(); emptyMap() }
                    "Stop" -> { stopp(); emptyMap() }
                    "GetTransportInfo" -> mapOf("CurrentTransportState" to zustand, "CurrentTransportStatus" to (if (fehler == null) "OK" else "ERROR_OCCURRED"), "CurrentSpeed" to "1")
                    "GetMediaInfo" -> mapOf("NrTracks" to (if (url.isEmpty()) "0" else "1"), "MediaDuration" to zeit(dauerMs), "CurrentURI" to url,
                        "CurrentURIMetaData" to metadaten, "NextURI" to "", "NextURIMetaData" to "", "PlayMedium" to "NETWORK", "RecordMedium" to "NOT_IMPLEMENTED", "WriteStatus" to "NOT_IMPLEMENTED")
                    "GetPositionInfo" -> mapOf("Track" to (if (url.isEmpty()) "0" else "1"), "TrackDuration" to zeit(dauerMs), "TrackMetaData" to metadaten, "TrackURI" to url,
                        "RelTime" to zeit(positionMs), "AbsTime" to zeit(positionMs), "RelCount" to "2147483647", "AbsCount" to "2147483647")
                    "GetCurrentTransportActions" -> mapOf("Actions" to when (zustand) { "PLAYING" -> "Pause,Stop"; "PAUSED_PLAYBACK" -> "Play,Stop"; "NO_MEDIA_PRESENT" -> ""; else -> "Play" })
                    "GetTransportSettings" -> mapOf("PlayMode" to "NORMAL", "RecQualityMode" to "NOT_IMPLEMENTED")
                    "GetDeviceCapabilities" -> mapOf("PlayMedia" to "NETWORK", "RecMedia" to "NOT_IMPLEMENTED", "RecQualityModes" to "NOT_IMPLEMENTED")
                    "GetVolume" -> mapOf("CurrentVolume" to lautstaerke().toString())
                    "SetVolume" -> { lautstaerkeSetzen(arg("DesiredVolume").toIntOrNull() ?: lautstaerke()); emptyMap() }
                    "GetMute" -> mapOf("CurrentMute" to (if (stumm()) "1" else "0"))
                    "SetMute" -> { audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (arg("DesiredMute") in listOf("1", "true")) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE, 0); emptyMap() }
                    "ListPresets" -> mapOf("CurrentPresetNameList" to "FactoryDefaults")
                    "SelectPreset" -> emptyMap()
                    "GetProtocolInfo" -> mapOf("Source" to "", "Sink" to Dlna.SINK)
                    "GetCurrentConnectionIDs" -> mapOf("ConnectionIDs" to "0")
                    "GetCurrentConnectionInfo" -> mapOf("RcsID" to "0", "AVTransportID" to "0", "ProtocolInfo" to "", "PeerConnectionManager" to "", "PeerConnectionID" to "-1", "Direction" to "Input", "Status" to "OK")
                    else -> throw UnsupportedOperationException(aktion)
                }
            }
        } catch (e: Exception) {
            Log.w(WebServer.TAG, "DLNA $aktion: $e")
            antwort.text(500, Dlna.fehler(401, "Invalid Action"), "text/xml; charset=\"utf-8\"")
            return
        }
        antwort.text(200, Dlna.antwort(dienst, aktion, aus), "text/xml; charset=\"utf-8\"")
    }

    private fun zeit(ms: Int): String {
        val s = ms / 1000
        return "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60)
    }

    // ── SSDP ────────────────────────────────────────────────────────────────

    private fun ssdp() {
        try {
            multicast = ctx.applicationContext.getSystemService(WifiManager::class.java).createMulticastLock("yapaia-ssdp").apply { setReferenceCounted(false); acquire() }
        } catch (e: Exception) {
            Log.w(WebServer.TAG, "Multicast: $e")
        }
        val gruppe = InetAddress.getByName("239.255.255.250")
        while (ssdpLaeuft) {
            try {
                MulticastSocket(1900).use { s ->
                    s.reuseAddress = true
                    s.soTimeout = 30_000
                    s.joinGroup(InetSocketAddress(gruppe, 1900), null as NetworkInterface?)
                    ankuendigen(s, gruppe)
                    var letzte = System.currentTimeMillis()
                    val puffer = ByteArray(2048)
                    while (ssdpLaeuft) {
                        if (System.currentTimeMillis() - letzte > 120_000) { ankuendigen(s, gruppe); letzte = System.currentTimeMillis() }
                        val p = DatagramPacket(puffer, puffer.size)
                        try { s.receive(p) } catch (_: java.net.SocketTimeoutException) { continue }
                        val t = String(p.data, 0, p.length, Charsets.ISO_8859_1)
                        if (!t.startsWith("M-SEARCH")) continue
                        val st = Regex("(?im)^ST:\\s*(.+?)\\s*$").find(t)?.groupValues?.get(1) ?: continue
                        for (ziel in typen().filter { st == "ssdp:all" || st == it }) {
                            val a = "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nEXT:\r\nLOCATION: ${ort(p.address)}\r\n" +
                                "SERVER: Android/13 UPnP/1.0 Yapaia/${version()}\r\nST: $ziel\r\nUSN: ${usn(ziel)}\r\n\r\n"
                            s.send(DatagramPacket(a.toByteArray(), a.length, p.address, p.port))
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(WebServer.TAG, "SSDP: $e")
                Thread.sleep(10_000)
            }
        }
    }

    private fun typen() = listOf("upnp:rootdevice", "uuid:$uuid", "urn:schemas-upnp-org:device:MediaRenderer:1",
        "urn:schemas-upnp-org:service:AVTransport:1", "urn:schemas-upnp-org:service:RenderingControl:1",
        "urn:schemas-upnp-org:service:ConnectionManager:1")

    private fun usn(typ: String) = if (typ == "uuid:$uuid") typ else "uuid:$uuid::$typ"

    /** Eigene Adresse im Netz des Fragenden (sonst die erste). */
    private fun ort(an: InetAddress?): String {
        val eigene = NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
            .flatMap { it.interfaceAddresses }.filter { it.address is java.net.Inet4Address }
        val passend = eigene.firstOrNull { ia ->
            an != null && an is java.net.Inet4Address && netz(ia.address, ia.networkPrefixLength) == netz(an, ia.networkPrefixLength)
        } ?: eigene.firstOrNull()
        return "http://${passend?.address?.hostAddress ?: "127.0.0.1"}:${YapaiaDienst.PORT}/dlna/geraet.xml"
    }

    private fun netz(a: InetAddress, laenge: Short): Int {
        val b = a.address
        val z = (b[0].toInt() and 255 shl 24) or (b[1].toInt() and 255 shl 16) or (b[2].toInt() and 255 shl 8) or (b[3].toInt() and 255)
        return if (laenge.toInt() == 0) 0 else z and (-1 shl (32 - laenge))
    }

    private fun ankuendigen(s: MulticastSocket, gruppe: InetAddress) {
        for (typ in typen()) {
            val n = "NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: ${ort(null)}\r\n" +
                "NT: $typ\r\nNTS: ssdp:alive\r\nSERVER: Android/13 UPnP/1.0 Yapaia/${version()}\r\nUSN: ${usn(typ)}\r\n\r\n"
            try { s.send(DatagramPacket(n.toByteArray(), n.length, gruppe, 1900)) } catch (_: Exception) {}
        }
    }
}

fun xmlVerschluesseln(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
fun xmlEntschluesseln(s: String) = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")

/** Dienstbeschreibungen (SCPD) und SOAP-Hüllen. */
object Dlna {
    const val SINK = "http-get:*:audio/mpeg:*,http-get:*:audio/mp3:*,http-get:*:audio/aac:*,http-get:*:audio/mp4:*," +
        "http-get:*:audio/x-m4a:*,http-get:*:audio/ogg:*,http-get:*:audio/flac:*,http-get:*:audio/x-flac:*,http-get:*:audio/wav:*," +
        "http-get:*:audio/x-wav:*,http-get:*:audio/L16:*,http-get:*:application/vnd.apple.mpegurl:*,http-get:*:application/x-mpegurl:*," +
        "http-get:*:audio/x-mpegurl:*,http-get:*:audio/*:*"

    private val typen = mapOf("avt" to "AVTransport", "rc" to "RenderingControl", "cm" to "ConnectionManager")

    /** Aktion → Liste (Argument, Richtung, Zustandsvariable). */
    private fun a(vararg x: String) = x.map { val t = it.split(':'); Triple(t[0], t[1], t[2]) }
    private val iid = "InstanceID:in:A_ARG_TYPE_InstanceID"

    val dienste: Map<String, Pair<Map<String, List<Triple<String, String, String>>>, Map<String, String>>> = mapOf(
        "avt" to Pair(mapOf(
            "SetAVTransportURI" to a(iid, "CurrentURI:in:AVTransportURI", "CurrentURIMetaData:in:AVTransportURIMetaData"),
            "Play" to a(iid, "Speed:in:TransportPlaySpeed"),
            "Pause" to a(iid), "Stop" to a(iid),
            "GetTransportInfo" to a(iid, "CurrentTransportState:out:TransportState", "CurrentTransportStatus:out:TransportStatus", "CurrentSpeed:out:TransportPlaySpeed"),
            "GetMediaInfo" to a(iid, "NrTracks:out:NumberOfTracks", "MediaDuration:out:CurrentMediaDuration", "CurrentURI:out:AVTransportURI",
                "CurrentURIMetaData:out:AVTransportURIMetaData", "NextURI:out:NextAVTransportURI", "NextURIMetaData:out:NextAVTransportURIMetaData",
                "PlayMedium:out:PlaybackStorageMedium", "RecordMedium:out:RecordStorageMedium", "WriteStatus:out:RecordMediumWriteStatus"),
            "GetPositionInfo" to a(iid, "Track:out:CurrentTrack", "TrackDuration:out:CurrentTrackDuration", "TrackMetaData:out:CurrentTrackMetaData",
                "TrackURI:out:CurrentTrackURI", "RelTime:out:RelativeTimePosition", "AbsTime:out:AbsoluteTimePosition",
                "RelCount:out:RelativeCounterPosition", "AbsCount:out:AbsoluteCounterPosition"),
            "GetCurrentTransportActions" to a(iid, "Actions:out:CurrentTransportActions"),
            "GetTransportSettings" to a(iid, "PlayMode:out:CurrentPlayMode", "RecQualityMode:out:CurrentRecordQualityMode"),
            "GetDeviceCapabilities" to a(iid, "PlayMedia:out:PossiblePlaybackStorageMedia", "RecMedia:out:PossibleRecordStorageMedia", "RecQualityModes:out:PossibleRecordQualityModes"),
        ), mapOf(
            "A_ARG_TYPE_InstanceID" to "ui4", "AVTransportURI" to "string", "AVTransportURIMetaData" to "string", "TransportPlaySpeed" to "string",
            "TransportState" to "string", "TransportStatus" to "string", "NumberOfTracks" to "ui4", "CurrentMediaDuration" to "string",
            "NextAVTransportURI" to "string", "NextAVTransportURIMetaData" to "string", "PlaybackStorageMedium" to "string",
            "RecordStorageMedium" to "string", "RecordMediumWriteStatus" to "string", "CurrentTrack" to "ui4", "CurrentTrackDuration" to "string",
            "CurrentTrackMetaData" to "string", "CurrentTrackURI" to "string", "RelativeTimePosition" to "string", "AbsoluteTimePosition" to "string",
            "RelativeCounterPosition" to "i4", "AbsoluteCounterPosition" to "i4", "CurrentTransportActions" to "string", "CurrentPlayMode" to "string",
            "CurrentRecordQualityMode" to "string", "PossiblePlaybackStorageMedia" to "string", "PossibleRecordStorageMedia" to "string",
            "PossibleRecordQualityModes" to "string", "LastChange" to "string",
        )),
        "rc" to Pair(mapOf(
            "GetVolume" to a(iid, "Channel:in:A_ARG_TYPE_Channel", "CurrentVolume:out:Volume"),
            "SetVolume" to a(iid, "Channel:in:A_ARG_TYPE_Channel", "DesiredVolume:in:Volume"),
            "GetMute" to a(iid, "Channel:in:A_ARG_TYPE_Channel", "CurrentMute:out:Mute"),
            "SetMute" to a(iid, "Channel:in:A_ARG_TYPE_Channel", "DesiredMute:in:Mute"),
            "ListPresets" to a(iid, "CurrentPresetNameList:out:PresetNameList"),
            "SelectPreset" to a(iid, "PresetName:in:A_ARG_TYPE_PresetName"),
        ), mapOf(
            "A_ARG_TYPE_InstanceID" to "ui4", "A_ARG_TYPE_Channel" to "string", "Volume" to "ui2", "Mute" to "boolean",
            "PresetNameList" to "string", "A_ARG_TYPE_PresetName" to "string", "LastChange" to "string",
        )),
        "cm" to Pair(mapOf(
            "GetProtocolInfo" to a("Source:out:SourceProtocolInfo", "Sink:out:SinkProtocolInfo"),
            "GetCurrentConnectionIDs" to a("ConnectionIDs:out:CurrentConnectionIDs"),
            "GetCurrentConnectionInfo" to a("ConnectionID:in:A_ARG_TYPE_ConnectionID", "RcsID:out:A_ARG_TYPE_RcsID",
                "AVTransportID:out:A_ARG_TYPE_AVTransportID", "ProtocolInfo:out:A_ARG_TYPE_ProtocolInfo",
                "PeerConnectionManager:out:A_ARG_TYPE_ConnectionManager", "PeerConnectionID:out:A_ARG_TYPE_ConnectionID",
                "Direction:out:A_ARG_TYPE_Direction", "Status:out:A_ARG_TYPE_ConnectionStatus"),
        ), mapOf(
            "SourceProtocolInfo" to "string", "SinkProtocolInfo" to "string", "CurrentConnectionIDs" to "string",
            "A_ARG_TYPE_ConnectionID" to "i4", "A_ARG_TYPE_RcsID" to "i4", "A_ARG_TYPE_AVTransportID" to "i4",
            "A_ARG_TYPE_ProtocolInfo" to "string", "A_ARG_TYPE_ConnectionManager" to "string",
            "A_ARG_TYPE_Direction" to "string", "A_ARG_TYPE_ConnectionStatus" to "string",
        )),
    )

    private val ereignisse = setOf("LastChange", "SourceProtocolInfo", "SinkProtocolInfo", "CurrentConnectionIDs")

    fun scpd(d: String): String {
        val (aktionen, variablen) = dienste.getValue(d)
        val al = aktionen.entries.joinToString("") { (n, args) ->
            "<action><name>$n</name><argumentList>" + args.joinToString("") { (a, r, v) ->
                "<argument><name>$a</name><direction>$r</direction><relatedStateVariable>$v</relatedStateVariable></argument>"
            } + "</argumentList></action>"
        }
        val vl = variablen.entries.joinToString("") { (n, t) ->
            val extra = when (n) {
                "Volume" -> "<allowedValueRange><minimum>0</minimum><maximum>100</maximum><step>1</step></allowedValueRange>"
                "TransportState" -> "<allowedValueList>" + listOf("STOPPED", "PLAYING", "PAUSED_PLAYBACK", "TRANSITIONING", "NO_MEDIA_PRESENT").joinToString("") { "<allowedValue>$it</allowedValue>" } + "</allowedValueList>"
                "A_ARG_TYPE_Channel" -> "<allowedValueList><allowedValue>Master</allowedValue></allowedValueList>"
                else -> ""
            }
            "<stateVariable sendEvents=\"${if (n in ereignisse) "yes" else "no"}\"><name>$n</name><dataType>$t</dataType>$extra</stateVariable>"
        }
        return """<?xml version="1.0" encoding="utf-8"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0"><specVersion><major>1</major><minor>0</minor></specVersion>
<actionList>$al</actionList><serviceStateTable>$vl</serviceStateTable></scpd>"""
    }

    fun antwort(d: String, aktion: String, aus: Map<String, String>): String {
        val werte = aus.entries.joinToString("") { (k, v) -> "<$k>${xmlVerschluesseln(v)}</$k>" }
        return """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>
<u:${aktion}Response xmlns:u="urn:schemas-upnp-org:service:${typen[d]}:1">$werte</u:${aktion}Response></s:Body></s:Envelope>"""
    }

    fun fehler(code: Int, text: String) = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>
<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
<errorCode>$code</errorCode><errorDescription>$text</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>"""
}
