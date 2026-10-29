/* Yapaia Beat web UI – works behind Home Assistant ingress (relative URLs only). */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let S = null; // last status
let stations = [];
let band = "";
let editId = null;

// Texte je Sprache (docs/sprachen.md): HA-Sprache über die Integration (api/sprache),
// sonst Browsersprache; Deutsch oder sonst Englisch
const TEXTE = {
  de: {
    verbinde: "verbinde …", verbunden: "verbunden", getrennt: "getrennt",
    fehler: "Fehler {n}", ukw: "UKW", kanal: "Kanal",
    zustand_idle: "Bereit", zustand_tuning: "Stimme ab …", zustand_playing: "Läuft", zustand_scanning: "Suchlauf",
    zustand_following: "Senderverfolgung", zustand_standby: "Standby", zustand_error: "Fehler",
    kein_sender: "Kein Sender", hilfe: "Wähle einen Sender aus deinen Favoriten oder starte einen Suchlauf.",
    suchlauf_punkte: "Suchlauf …",
    vergroessern: "Vergrößern", empfang: "Empfangsqualität", vorheriger: "Vorheriger Favorit", naechster: "Nächster Favorit",
    favorit: "Favorit", ausgabe: "Ausgabe", ausgabe_titel: "Wo soll das Radio zu hören sein?", ton_starten: "▶ Ton hier starten",
    stick_titel: "Auf welchem RTL-SDR-Stick gespielt wird", ma_titel: "Diesen Browser als Player bei Music Assistant anmelden",
    ma_browser: "Music Assistant in diesem Browser", stumm_titel: "Stumm", stumm: "stumm",
    verfolgung_titel: "Automatische Senderverfolgung bei schlechtem Empfang", verfolgung: "Senderverfolgung",
    tab_favoriten: "Favoriten", tab_sender: "Sender", tab_suchlauf: "Suchlauf",
    keine_favoriten: "Noch keine Favoriten. Unter <b>Sender</b> mit dem ☆ markieren.",
    suche_ph: "Suche nach Name oder Frequenz (z. B. SWR3 oder 98,3)", alle: "Alle",
    keine_sender: "Keine Sender gefunden. Starte einen Suchlauf.",
    scan_info: "Der Suchlauf durchsucht das UKW-Band (87,5–108 MHz, inkl. RDS) und/oder DAB-Band III. Während des Suchlaufs ist die Wiedergabe unterbrochen. Tipp für unterwegs: nach einem Ortswechsel einfach erneut suchen – Favoriten bleiben erhalten und werden per PI-Code bzw. Service-ID zugeordnet.",
    scan_fm: "FM-Suchlauf", scan_dab: "DAB+-Suchlauf", scan_alle: "Beides", dab_opt: "DAB-Empfang optimieren",
    dab_opt_titel: "Misst je DAB-Kanal mehrere feste Verstärkungen und merkt sich die beste", abbrechen: "Abbrechen",
    dab_opt_info: "„DAB-Empfang optimieren“ probiert je Kanal deiner Sender mehrere feste Verstärkungen (etwa eine Minute pro Kanal) und nutzt danach die beste statt der Automatik. Unterwegs gilt sie nur, solange der Empfang gut ist – wird er schlecht, regelt wieder die Automatik. Am besten am Standplatz ausführen und nach einem Ortswechsel wiederholen.",
    vergleichen_titel: "Misst den laufenden Sender kurz auch auf dem freien Stick", vergleichen: "Antennen vergleichen",
    sender_bearbeiten: "Sender bearbeiten", name: "Name", logo_hoch: "Logo hochladen", logo_suchen: "Logo online suchen",
    logo_entfernen: "Eigenes Logo entfernen", sender_loeschen: "Sender löschen", speichern: "Speichern",
    nach_vorne: "nach vorne", nach_hinten: "nach hinten", aus_favoriten: "Aus den Favoriten entfernen", seite: "Seite {n}",
    zuletzt_nicht: "zuletzt nicht empfangen", bearbeiten: "Bearbeiten", direkt: "▶ {f} direkt einstellen",
    original: "Original: {n}", logo_gespeichert: "Logo gespeichert", logo_gefunden: "Logo gefunden", kein_logo: "Kein Logo gefunden",
    wirklich_loeschen: "Sender wirklich löschen?",
    stick_auto: "Auto", stick_auto_titel: "Spielt auf dem Stick mit dem besseren Empfang", stick_n: "Stick {n}",
    spielt_auf: "spielt auf {n}", dab_fest: " · DAB mit fester Verstärkung: {liste}",
    busy_scan: "sucht Sender", busy_follow: "sucht für die Senderverfolgung", busy_switch: "stimmt den neuen Sender ab", busy_bereit: "bereit",
    modus_gleich: "Suche und Umschalten ohne Pause", modus_hinten: "Suche im Hintergrund", zweiter: "Zweiter Stick: {modus} – {busy}.",
    stream_info: "Lokale Wiedergabe über Home Assistant Audio: <b>{aktiv}</b> · MP3-Stream: <code>/stream.mp3</code> ({n} Hörer)",
    aktiv: "aktiv", aus: "aus",
    vergleiche: "Vergleiche …", misst: "misst den laufenden Sender auf dem freien Stick (bis 20 s) …",
    zum_vergleichen: "Zum Vergleichen einen Sender abspielen", spielt_klammer: " (spielt)", etwa_gleich: "etwa gleich gut", besser: "besser: <b>{n}</b>",
    ma_aus: "Meldet diesen Browser als Player {n} bei Music Assistant an. Er spielt auch weiter, wenn du das Dashboard wechselst, und Ansagen von Yapaia Go kommen dort ohne Verzögerung.",
    ma_sucht: "Suche Music Assistant …", ma_verbindet: "Verbinde mit Music Assistant …",
    ma_wartet: "Angemeldet als {n}. Music Assistant muss den Player einmal zulassen: in Music Assistant → Einstellungen → Wiedergabegeräte → {n} öffnen und ohne Kopplung verbinden.",
    ma_bereit_aktiv: "Das Radio läuft über Music Assistant auf {n}.", ma_bereit_oben: "{n} ist bereit – oben bei „Ausgabe“ wählen.",
    ma_bereit_ohne: "{n} ist mit Music Assistant verbunden. Er erscheint bei „Ausgabe“, sobald Music Assistant ihn an Home Assistant freigibt (Wiedergabegeräte → {n} → „für Home Assistant freigeben“).",
    ma_spielt: "Music Assistant spielt in diesem Browser ({n}).", ma_fehler: "⚠ {fehler} – neuer Versuch in 30 s.",
    ma_tippen: " Einmal irgendwo tippen, damit der Ton starten darf.",
    mini_pc: "Mini-PC", dieses_geraet: "Dieses Gerät", mini_und_geraet: "Mini-PC + dieses Gerät", keine_ausgabe: "Keine Ausgabe",
    und_geraet: " + dieses Gerät",
    hint_ma: "Über Music Assistant · Ansagen von Yapaia Go spielt Music Assistant ohne Verzögerung ein und hat dabei Vorrang",
    hint_tippen: "Der Browser startet den Ton erst nach einem Tippen – einfach irgendwo tippen",
    hint_kein_audio: "Mini-PC-Ausgabe nicht verfügbar (Audio im Add-on prüfen)",
    hint_nur_seite: "Ton läuft nur auf dieser Seite – beim Wechsel zu einem anderen Dashboard hört er auf. Home Assistant einmal neu laden.",
    hint_ios: "Lautstärke am iPad/iPhone mit den Tasten regeln", hint_weiter: "Ton läuft auch auf anderen Dashboards weiter · ",
    hint_host: "Ton läuft im Home-Assistant-Fenster weiter, auch auf anderen Dashboards (ca. 2–4 s verzögert)",
    hint_verzoegert: "Wiedergabe ca. 2–4 s verzögert",
    grp_hier: "Hier & am Mini-PC", grp_lautsprecher: "Home Assistant Lautsprecher",
    klein_browser: "Browser, iPad, Autoradio …", klein_kein_audio: "Audio im Add-on nicht verfügbar", klein_lautsprecher: "Lautsprecher am Home-Assistant-Rechner",
    dieser_browser: "dieser Browser", keine_player: "Keine weiteren Media Player gefunden. Sie erscheinen hier, sobald die Yapaia-Beat-Integration in Home Assistant eingerichtet ist.",
    ma_hinweis_ein: "Music Assistant ist eingerichtet, gibt aber keinen Player an Home Assistant weiter. In Music Assistant: Einstellungen → Wiedergabegeräte → Player wählen → „Dieses Wiedergabegerät für Home Assistant freigeben“ einschalten und speichern.",
    ma_hinweis_aus: "Music-Assistant-Player erscheinen hier, sobald Music Assistant als Integration in Home Assistant eingerichtet ist (Einstellungen → Geräte & Dienste) und seine Player für Home Assistant freigibt.",
  },
  en: {
    verbinde: "connecting …", verbunden: "connected", getrennt: "disconnected",
    fehler: "Error {n}", ukw: "FM", kanal: "channel",
    zustand_idle: "Ready", zustand_tuning: "Tuning …", zustand_playing: "Playing", zustand_scanning: "Scanning",
    zustand_following: "Station following", zustand_standby: "Standby", zustand_error: "Error",
    kein_sender: "No station", hilfe: "Pick a station from your favourites or start a scan.",
    suchlauf_punkte: "Scanning …",
    vergroessern: "Enlarge", empfang: "Reception quality", vorheriger: "Previous favourite", naechster: "Next favourite",
    favorit: "Favourite", ausgabe: "Output", ausgabe_titel: "Where should the radio play?", ton_starten: "▶ Start sound here",
    stick_titel: "Which RTL-SDR stick is playing", ma_titel: "Register this browser as a player in Music Assistant",
    ma_browser: "Music Assistant in this browser", stumm_titel: "Mute", stumm: "muted",
    verfolgung_titel: "Automatically follow the station when reception is poor", verfolgung: "Station following",
    tab_favoriten: "Favourites", tab_sender: "Stations", tab_suchlauf: "Scan",
    keine_favoriten: "No favourites yet. Mark stations with ☆ under <b>Stations</b>.",
    suche_ph: "Search by name or frequency (e.g. SWR3 or 98.3)", alle: "All",
    keine_sender: "No stations found. Start a scan.",
    scan_info: "The scan searches the FM band (87.5–108 MHz, incl. RDS) and/or DAB band III. Playback is interrupted while scanning. Tip for travelling: after moving to a new place just scan again – favourites are kept and matched by PI code or service ID.",
    scan_fm: "FM scan", scan_dab: "DAB+ scan", scan_alle: "Both", dab_opt: "Optimise DAB reception",
    dab_opt_titel: "Measures several fixed gains per DAB channel and remembers the best one", abbrechen: "Cancel",
    dab_opt_info: "“Optimise DAB reception” tries several fixed gains on each channel of your stations (about a minute per channel) and then uses the best one instead of automatic gain. On the road it only applies while reception is good – when it gets poor, automatic gain takes over again. Best done at your pitch, and repeated after moving.",
    vergleichen_titel: "Briefly measures the current station on the free stick, too", vergleichen: "Compare antennas",
    sender_bearbeiten: "Edit station", name: "Name", logo_hoch: "Upload logo", logo_suchen: "Search logo online",
    logo_entfernen: "Remove custom logo", sender_loeschen: "Delete station", speichern: "Save",
    nach_vorne: "move forward", nach_hinten: "move back", aus_favoriten: "Remove from favourites", seite: "Page {n}",
    zuletzt_nicht: "not received lately", bearbeiten: "Edit", direkt: "▶ Tune to {f} directly",
    original: "Original: {n}", logo_gespeichert: "Logo saved", logo_gefunden: "Logo found", kein_logo: "No logo found",
    wirklich_loeschen: "Really delete this station?",
    stick_auto: "Auto", stick_auto_titel: "Plays on the stick with better reception", stick_n: "Stick {n}",
    spielt_auf: "playing on {n}", dab_fest: " · DAB with fixed gain: {liste}",
    busy_scan: "scanning", busy_follow: "searching for station following", busy_switch: "tuning the new station", busy_bereit: "ready",
    modus_gleich: "scanning and switching without a break", modus_hinten: "scanning in the background", zweiter: "Second stick: {modus} – {busy}.",
    stream_info: "Local playback via Home Assistant Audio: <b>{aktiv}</b> · MP3 stream: <code>/stream.mp3</code> ({n} listeners)",
    aktiv: "on", aus: "off",
    vergleiche: "Comparing …", misst: "measuring the current station on the free stick (up to 20 s) …",
    zum_vergleichen: "Play a station to compare", spielt_klammer: " (playing)", etwa_gleich: "about equal", besser: "better: <b>{n}</b>",
    ma_aus: "Registers this browser as player {n} in Music Assistant. It keeps playing when you switch dashboards, and Yapaia Go announcements arrive there without delay.",
    ma_sucht: "Looking for Music Assistant …", ma_verbindet: "Connecting to Music Assistant …",
    ma_wartet: "Registered as {n}. Music Assistant has to allow the player once: in Music Assistant open Settings → Players → {n} and connect without pairing.",
    ma_bereit_aktiv: "The radio is playing via Music Assistant on {n}.", ma_bereit_oben: "{n} is ready – pick it under “Output” above.",
    ma_bereit_ohne: "{n} is connected to Music Assistant. It shows up under “Output” as soon as Music Assistant shares it with Home Assistant (Players → {n} → “share with Home Assistant”).",
    ma_spielt: "Music Assistant is playing in this browser ({n}).", ma_fehler: "⚠ {fehler} – retrying in 30 s.",
    ma_tippen: " Tap anywhere once so the sound is allowed to start.",
    mini_pc: "Mini PC", dieses_geraet: "This device", mini_und_geraet: "Mini PC + this device", keine_ausgabe: "No output",
    und_geraet: " + this device",
    hint_ma: "Via Music Assistant · Music Assistant plays Yapaia Go announcements without delay and gives them priority",
    hint_tippen: "The browser only starts the sound after a tap – just tap anywhere",
    hint_kein_audio: "Mini PC output unavailable (check audio in the add-on)",
    hint_nur_seite: "Sound only plays on this page – it stops when you switch to another dashboard. Reload Home Assistant once.",
    hint_ios: "Adjust the volume on the iPad/iPhone with the buttons", hint_weiter: "Sound keeps playing on other dashboards · ",
    hint_host: "Sound keeps playing in the Home Assistant window, even on other dashboards (about 2–4 s delayed)",
    hint_verzoegert: "Playback is about 2–4 s delayed",
    grp_hier: "Here & on the mini PC", grp_lautsprecher: "Home Assistant speakers",
    klein_browser: "Browser, iPad, car radio …", klein_kein_audio: "Audio not available in the add-on", klein_lautsprecher: "Speakers on the Home Assistant computer",
    dieser_browser: "this browser", keine_player: "No other media players found. They appear here once the Yapaia Beat integration is set up in Home Assistant.",
    ma_hinweis_ein: "Music Assistant is set up but does not share any player with Home Assistant. In Music Assistant: Settings → Players → pick the player → turn on “Share this player with Home Assistant” and save.",
    ma_hinweis_aus: "Music Assistant players appear here once Music Assistant is set up as an integration in Home Assistant (Settings → Devices & services) and shares its players with Home Assistant.",
  },
};
let SPRACHE = String(navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
const t = (schluessel, werte = {}) =>
  String(TEXTE[SPRACHE]?.[schluessel] ?? TEXTE.en[schluessel] ?? schluessel).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
// Feste Texte im HTML: data-t="schluessel" (Inhalt), data-t-html (Inhalt mit Markup), data-t-title, data-t-aria, data-t-ph (placeholder)
function texteSetzen(wurzel = document) {
  document.documentElement.lang = SPRACHE;
  for (const el of wurzel.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of wurzel.querySelectorAll("[data-t-html]")) el.innerHTML = t(el.dataset.tHtml);
  for (const el of wurzel.querySelectorAll("[data-t-title]")) el.title = t(el.dataset.tTitle);
  for (const el of wurzel.querySelectorAll("[data-t-aria]")) el.setAttribute("aria-label", t(el.dataset.tAria));
  for (const el of wurzel.querySelectorAll("[data-t-ph]")) el.placeholder = t(el.dataset.tPh);
}
async function spracheLaden() {
  try {
    const d = await (await fetch("api/sprache", { cache: "no-store" })).json();
    if (d?.sprache === "de" || d?.sprache === "en") SPRACHE = d.sprache;
  } catch {}
  texteSetzen();
}
const lokal = () => (SPRACHE === "de" ? "de-DE" : "en-GB");

const fmtFreq = (f) => {
  if (f == null) return "";
  const z = Number(f).toFixed(f * 100 % 10 ? 2 : 1);
  return `${SPRACHE === "de" ? z.replace(".", ",") : z} MHz`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, body, method) {
  const opts = { method: method || (body === undefined ? "GET" : "POST"), headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) { toast(data.error || t("fehler", { n: r.status })); throw new Error(data.error); }
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}

function sub(st) {
  if (!st) return "";
  if (st.band === "fm") {
    const extra = st.frequencies && st.frequencies.length > 1 ? ` (+${st.frequencies.length - 1})` : "";
    return `${t("ukw")} ${fmtFreq(st.frequency)}${extra}`;
  }
  return `DAB+ ${st.channel || ""}${st.ensemble ? " · " + st.ensemble : ""}`;
}

/* ------------------------------------------------------------------ websocket */
function connect() {
  const url = new URL("api/ws", location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url);
  ws.onopen = () => { $("#conn").textContent = t("verbunden"); $("#conn").className = "chip ok"; };
  ws.onmessage = (e) => render(JSON.parse(e.data));
  ws.onclose = () => {
    $("#conn").textContent = t("getrennt"); $("#conn").className = "chip warn";
    setTimeout(connect, 2000);
  };
}

/* ------------------------------------------------------------------ now playing */
let lastText = "", lastLogo = "", lastSlide = null, lastFavKey = "";
function render(s) {
  const prevCount = S ? S.station_count : null;
  S = s;
  // stand-alone page (no player in the Home Assistant window): follow stop /
  // start / station changes at once instead of playing out the buffer
  if (!HOST) localPlayer.sync(["playing", "tuning", "following"].includes(s.state), s.station && s.station.id);
  const st = s.station;
  $("#now-state").textContent = TEXTE.de["zustand_" + s.state] ? t("zustand_" + s.state) : s.state;
  $("#now-name").textContent = st ? st.name : t("kein_sender");
  const meta = [];
  if (s.band === "fm" && s.frequency) meta.push(t("ukw") + " " + fmtFreq(s.frequency));
  if (s.band === "dab" && s.channel) meta.push("DAB+ " + t("kanal") + " " + s.channel);
  if (s.ensemble) meta.push(s.ensemble);
  if (s.rds && s.rds.pi) meta.push("PI " + s.rds.pi.replace("0x", "").toUpperCase());
  if (s.pty && s.pty !== "No PTY" && s.pty !== "None") meta.push(s.pty);
  if (!s.playing && st) meta.push(sub(st));
  $("#now-meta").textContent = meta.join(" · ");

  let text = s.error ? "⚠ " + s.error : s.radiotext || (s.rds && s.rds.ps) || (s.playing ? "" : t("hilfe"));
  if (s.state === "scanning") text = s.scan.message || t("suchlauf_punkte");
  if (text !== lastText) {
    lastText = text;
    const span = $("#now-text");
    span.textContent = text || " ";
    span.classList.remove("scroll");
    requestAnimationFrame(() => {
      if (span.scrollWidth > span.parentElement.clientWidth) {
        span.style.setProperty("--dur", `${Math.max(8, text.length / 4)}s`);
        span.classList.add("scroll");
      }
    });
  }
  $("#now-song").textContent = s.title ? (s.artist ? `${s.artist} – ${s.title}` : s.title) : "";

  const logo = st ? st.logo_url : "api/logo/current";
  if (logo !== lastLogo) { $("#now-logo").src = logo; lastLogo = logo; }
  if (s.band === "dab" && s.slide_version) {
    if (s.slide_version !== lastSlide) { lastSlide = s.slide_version; $("#now-slide").src = `api/slide?v=${s.slide_version}`; }
    $("#now-slide").hidden = false;
  } else { $("#now-slide").hidden = true; lastSlide = null; }
  $("#now-slide").onerror = () => ($("#now-slide").hidden = true);
  if (!$("#zoom").hidden && lastSlide) $("#zoom img").src = $("#now-slide").src;

  const sig = s.playing && s.signal != null ? s.signal : null;
  $$("#bars i").forEach((b, i) => b.classList.toggle("on", sig != null && sig > i * 20 + 5));
  $("#bars").classList.toggle("weak", sig != null && sig < 35);
  $("#signal-text").textContent = sig == null ? "–" : `${Math.round(sig)} %${s.snr != null ? ` · ${Number(s.snr).toFixed(0)} dB` : ""}`;
  $("#stereo").hidden = !(s.playing && s.stereo);
  $("#tp").hidden = !(s.rds && s.rds.tp);
  $("#follow-msg").textContent = s.follow && s.follow.message ? s.follow.message : "";

  $("#play-icon").innerHTML = s.playing ? '<path d="M6 6h12v12H6z"/>' : '<path d="M8 5v14l11-7z"/>';
  $("#btn-fav").classList.toggle("active", !!(st && st.favorite));
  $$(".fm-only").forEach((b) => (b.hidden = s.band === "dab"));
  renderOutput();
  updateMediaSession();
  $("#mute-path").setAttribute("d", s.muted
    ? "M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5V12zM19 12a7 7 0 0 1-.6 2.8l1.5 1.5A8.9 8.9 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3a7 7 0 0 1-2.3 1.2v2.1a9 9 0 0 0 3.7-1.8l2 2L21 19.7l-9-9zM12 4 9.9 6.1 12 8.2V4z"
    : "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z");
  $("#follow").checked = s.auto_follow;

  // scan tab
  $("#scan-bar").style.width = `${s.scan.running || s.scan.message ? s.scan.progress : 0}%`;
  $("#scan-msg").textContent = s.scan.message || "";
  $("#scan-cancel").hidden = !s.scan.running;
  // an automatic background scan gives way to one started by hand
  $$("[data-scan]").forEach((b) => (b.disabled = s.scan.running && !s.scan.auto));
  const stick = $("#stick-info");
  stick.hidden = !(s.sticks > 1);
  if (s.sticks > 1) {
    const busy = ["scan", "follow", "switch"].includes(s.second_stick_busy) ? t("busy_" + s.second_stick_busy) : t("busy_bereit");
    const modus = s.second_stick === "gleichwertig" ? t("modus_gleich") : t("modus_hinten");
    stick.textContent = t("zweiter", { modus, busy }) + (s.second_stick_hint ? ` ⚠ ${s.second_stick_hint}` : "");
  }
  renderCompare(s);
  renderStickChoice(s);
  $("#stream-info").innerHTML = t("stream_info", { aktiv: s.local_audio ? t("aktiv") : t("aus"), n: s.stream_clients });

  const favKey = JSON.stringify(s.favorites.map((f) => [f.id, f.name, f.logo_url])) + (s.active_favorite || "");
  if (favKey !== lastFavKey) { lastFavKey = favKey; renderFavorites(); }
  if (prevCount !== null && prevCount !== s.station_count) loadStations();
  else markPlaying();
}

/* Favourites are split into pages that fit the free space below the player
 * (no page scrolling); swipe horizontally or tap the dots to switch pages. */
let favPage = 0;
let favEdit = null; // id of the tile open for editing
let favDruck = null; // running long press
let favLang = false; // the long press fired (finger still down)
let favLangBis = 0; // swallow the click of that release – only right after it
function favLayout() {
  const box = $("#fav-grid");
  const width = box.clientWidth || 600;
  const top = box.getBoundingClientRect().top + window.scrollY;
  const avail = Math.max(170, window.innerHeight - top - 56); // leave room for dots
  const gap = 12;
  const minTile = width < 500 ? 104 : 132;
  const cols = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
  const colW = (width - gap * (cols - 1)) / cols;
  const text = 58; // name + band + padding
  const rows = Math.max(1, Math.floor((avail + gap) / (Math.min(colW, 150) + text + gap)));
  const rowH = (avail - gap * (rows - 1)) / rows;
  const img = Math.max(56, Math.min(colW - 24, rowH - text, 150));
  return { cols, rows, img, per: cols * rows };
}

function renderFavorites() {
  const box = $("#fav-grid");
  const favs = S.favorites;
  $("#fav-empty").hidden = favs.length > 0;
  if (!favs.length) { box.innerHTML = ""; $("#fav-dots").innerHTML = ""; return; }
  const L = favLayout();
  const pages = [];
  for (let i = 0; i < favs.length; i += L.per) pages.push(favs.slice(i, i + L.per));
  favPage = Math.min(favPage, pages.length - 1);
  box.innerHTML = pages.map((page, p) => `
    <div class="page" style="grid-template-columns: repeat(${L.cols}, 1fr); --img: ${L.img}px">
      ${page.map((f, j) => {
        const i = p * L.per + j;
        return `
        <div class="tile ${S.active_favorite === f.id ? "playing" : ""} ${favEdit === f.id ? "edit" : ""}" data-id="${esc(f.id)}">
          ${favEdit === f.id ? `
          ${i > 0 ? `<button class="move l" data-move="-1" title="${t("nach_vorne")}" aria-label="${t("nach_vorne")}">‹</button>` : ""}
          ${i < favs.length - 1 ? `<button class="move r" data-move="1" title="${t("nach_hinten")}" aria-label="${t("nach_hinten")}">›</button>` : ""}
          <button class="del" data-del="1" title="${t("aus_favoriten")}" aria-label="${t("aus_favoriten")}">🗑</button>` : ""}
          <img src="${esc(f.logo_url)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='api/logo/${esc(f.id)}?placeholder=1'">
          <div class="name">${esc(f.name)}</div>
          <div class="band">${esc(sub(f))}</div>
        </div>`;
      }).join("")}
    </div>`).join("");
  $("#fav-dots").innerHTML = pages.length > 1
    ? pages.map((_, p) => `<button data-page="${p}" class="${p === favPage ? "active" : ""}" aria-label="${t("seite", { n: p + 1 })}"></button>`).join("")
    : "";
  box.scrollLeft = favPage * box.clientWidth;
}

$("#fav-grid").addEventListener("scroll", () => {
  const box = $("#fav-grid");
  const p = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
  if (p !== favPage) {
    favPage = p;
    $$("#fav-dots button").forEach((d, i) => d.classList.toggle("active", i === p));
  }
}, { passive: true });
$("#fav-dots").addEventListener("click", (e) => {
  const d = e.target.closest("[data-page]");
  if (!d) return;
  favPage = Number(d.dataset.page);
  $("#fav-grid").scrollTo({ left: favPage * $("#fav-grid").clientWidth, behavior: "smooth" });
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => S && renderFavorites(), 150); });

/* Favourites: one tap tunes in.  Holding a tile (half a second) opens it
 * for editing – large arrows to move it (it stays open, so it can travel
 * several places) and a bin to remove it (like the star in the station
 * list).  A tap anywhere else closes it. */
const LANG_MS = 500;
function favEditEnde() { if (favEdit) { favEdit = null; renderFavorites(); } }
$("#fav-grid").addEventListener("pointerdown", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile || e.target.closest("button")) return;
  clearTimeout(favDruck && favDruck.uhr);
  favDruck = {
    x: e.clientX, y: e.clientY,
    uhr: setTimeout(() => {
      favLang = true;
      favEdit = tile.dataset.id;
      renderFavorites();
      if (navigator.vibrate) navigator.vibrate(30);
    }, LANG_MS),
  };
});
$("#fav-grid").addEventListener("pointermove", (e) => {
  if (favDruck && Math.hypot(e.clientX - favDruck.x, e.clientY - favDruck.y) > 10) { clearTimeout(favDruck.uhr); favDruck = null; }
});
["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
  $("#fav-grid").addEventListener(ev, () => {
    if (favDruck) { clearTimeout(favDruck.uhr); favDruck = null; }
    // the tile was redrawn while held, so a click may or may not follow
    if (favLang) { favLang = false; favLangBis = Date.now() + 400; }
  }));
$("#fav-grid").addEventListener("contextmenu", (e) => { if (e.target.closest(".tile")) e.preventDefault(); });
document.addEventListener("click", (e) => { if (favEdit && !e.target.closest("#fav-grid .tile.edit")) favEditEnde(); });

$("#fav-grid").addEventListener("click", async (e) => {
  // the release of the long press is no tap (the buttons only appear with it)
  if ((favLang || Date.now() < favLangBis) && !e.target.closest("button")) { favLangBis = 0; e.stopPropagation(); return; }
  const tile = e.target.closest(".tile");
  if (!tile) return;
  const move = e.target.closest("[data-move]");
  if (move) {
    e.stopPropagation();
    const ids = S.favorites.map((f) => f.id);
    const i = ids.indexOf(tile.dataset.id), j = i + Number(move.dataset.move);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // show it at once (stays open for the next step), then save
    const byId = Object.fromEntries(S.favorites.map((f) => [f.id, f]));
    S.favorites = ids.map((id) => byId[id]);
    const L = favLayout();
    favPage = Math.floor(j / L.per);
    renderFavorites();
    await api("api/favorites", { order: ids });
    return;
  }
  if (e.target.closest("[data-del]")) {
    e.stopPropagation();
    const id = tile.dataset.id;
    favEdit = null;
    S.favorites = S.favorites.filter((f) => f.id !== id);
    renderFavorites();
    await api("api/favorites", { id, favorite: false });
    loadStations();
    return;
  }
  if (favEdit) { e.stopPropagation(); favEditEnde(); return; } // a tap closes the editing first
  // immediate feedback while the receiver retunes
  $$("#fav-grid .tile").forEach((t) => t.classList.toggle("pending", t === tile));
  try { await api("api/play", { id: tile.dataset.id }); } finally { tile.classList.remove("pending"); }
});

/* ------------------------------------------------------------------ stations list */
async function loadStations() {
  const q = $("#search").value.trim();
  const params = new URLSearchParams({ q, band });
  stations = await fetch(`api/stations?${params}`).then((r) => r.json());
  const list = $("#station-list");
  list.innerHTML = stations.map((st) => `
    <li data-id="${esc(st.id)}" class="${st.available ? "" : "unavailable"}">
      <img src="${esc(st.logo_url)}" alt="" loading="lazy">
      <div class="txt" data-play><b>${esc(st.name)}</b><small>${esc(sub(st))}${st.pty ? " · " + esc(st.pty) : ""}${st.available ? "" : " · " + t("zuletzt_nicht")}</small></div>
      <button class="star ${st.favorite ? "on" : ""}" data-fav title="${t("favorit")}">${st.favorite ? "★" : "☆"}</button>
      <button class="edit" data-edit title="${t("bearbeiten")}">✎</button>
    </li>`).join("");
  $("#stations-empty").hidden = stations.length > 0;
  const f = parseFloat(q.replace(",", "."));
  const direct = $("#direct-tune");
  if (band !== "dab" && f >= 87.5 && f <= 108) {
    direct.hidden = false;
    direct.innerHTML = `<button class="primary" id="tune-direct">${esc(t("direkt", { f: fmtFreq(f) }))}</button>`;
    $("#tune-direct").onclick = () => api("api/play", { frequency: f });
  } else direct.hidden = true;
  markPlaying();
}

function markPlaying() {
  const cur = S && S.station ? S.station.id : null;
  $$("#station-list li").forEach((li) => li.classList.toggle("playing", li.dataset.id === cur));
}

$("#station-list").addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const st = stations.find((s) => s.id === li.dataset.id);
  if (e.target.closest("[data-fav]")) {
    await api("api/favorites", { id: st.id, favorite: !st.favorite });
    loadStations();
  } else if (e.target.closest("[data-edit]")) openEdit(st);
  else if (e.target.closest("[data-play]")) await api("api/play", { id: st.id });
});

let searchTimer;
$("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadStations, 200); });
$$("#band-filter button").forEach((b) => b.addEventListener("click", () => {
  $$("#band-filter button").forEach((x) => x.classList.toggle("active", x === b));
  band = b.dataset.band; loadStations();
}));

/* ------------------------------------------------------------------ edit dialog */
function openEdit(st) {
  editId = st.id;
  $("#edit-name").value = st.name;
  $("#edit-logo").src = st.logo_url;
  $("#edit-info").textContent = [sub(st), st.pi && "PI " + st.pi, st.sid && "SId " + st.sid, st.original_name && t("original", { n: st.original_name })].filter(Boolean).join(" · ");
  $("#edit").showModal();
}
async function refreshEdit() {
  await loadStations();
  const st = stations.find((s) => s.id === editId);
  if (st) $("#edit-logo").src = st.logo_url + "&t=" + Date.now();
}
$("#edit-save").addEventListener("click", async () => { await api(`api/stations/${editId}`, { name: $("#edit-name").value }); loadStations(); });
$("#edit-file").addEventListener("change", async (e) => {
  const fd = new FormData(); fd.append("file", e.target.files[0]);
  await api(`api/stations/${editId}/logo`, fd); e.target.value = ""; refreshEdit(); toast(t("logo_gespeichert"));
});
$("#edit-refresh").addEventListener("click", async () => {
  const r = await api(`api/stations/${editId}/logo/refresh`, {}); toast(r.found ? t("logo_gefunden") : t("kein_logo")); refreshEdit();
});
$("#edit-reset").addEventListener("click", async () => { await api(`api/stations/${editId}/logo`, undefined, "DELETE"); refreshEdit(); });
$("#edit-delete").addEventListener("click", async () => {
  if (!confirm(t("wirklich_loeschen"))) return;
  await api(`api/stations/${editId}`, undefined, "DELETE"); $("#edit").close(); loadStations();
});

/* ------------------------------------------------------------------ controls */
$("#btn-play").onclick = () => {
  if (!(S && S.playing) && player.wanted) player.start(); // keep it inside the user gesture (iOS)
  api(S && S.playing ? "api/stop" : "api/play", {});
};
$("#btn-next").onclick = () => api("api/next", {});
$("#btn-prev").onclick = () => api("api/previous", {});
$("#btn-seek-up").onclick = () => api("api/seek", { direction: "up" });
$("#btn-seek-down").onclick = () => api("api/seek", { direction: "down" });
$("#btn-fav").onclick = () => S && S.station && api("api/favorites", { id: S.station.id, favorite: !S.station.favorite }).then(loadStations);
$("#btn-mute").onclick = () => api("api/volume", { muted: !(S && S.muted) });
/* the slider's fill follows its value (see style.css) */
function fill(el) { el.style.setProperty("--f", String((Number(el.value) - Number(el.min || 0)) / ((Number(el.max || 100) - Number(el.min || 0)) || 1))); }
$("#volume").addEventListener("input", (e) => { $("#volume-text").textContent = e.target.value; fill(e.target); });
$("#volume").addEventListener("change", (e) => {
  if (browserOnly()) { player.setVolume(Number(e.target.value)); renderOutput(); }
  else api("api/volume", { volume: Number(e.target.value) });
});
$("#follow").addEventListener("change", (e) => api("api/settings", { auto_follow: e.target.checked }));
$$("[data-scan]").forEach((b) => (b.onclick = () => api("api/scan", { band: b.dataset.scan })));
$("#compare-btn").onclick = () => api("api/sticks/compare", {});

// Stick choice while playing: Auto (the one receiving better) or a fixed one
function renderStickChoice(s) {
  const row = $("#stick-row");
  row.hidden = !(s.sticks > 1);
  if (row.hidden) return;
  const names = s.stick_names || {};
  const ids = Object.keys(names).length ? Object.keys(names).map(Number) : [0, 1];
  const opts = [["auto", t("stick_auto"), t("stick_auto_titel")]].concat(
    ids.map((i) => [String(i), t("stick_n", { n: i + 1 }), names[i] || t("stick_n", { n: i + 1 })]));
  const key = opts.map((o) => o.join("|")).join(";") + "#" + s.stick_choice + "#" + s.stick_playing;
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  $("#stick-seg").innerHTML = opts.map(([v, label, title]) => {
    const on = String(s.stick_choice) === v;
    const live = v !== "auto" && s.stick_playing === Number(v);
    return `<button data-stick="${v}" class="${on ? "active" : ""}" title="${esc(title)}">${esc(label)}${live ? " ●" : ""}</button>`;
  }).join("");
  $$("#stick-seg [data-stick]").forEach((b) => (b.onclick = () => api("api/sticks/choice", { choice: b.dataset.stick })));
  const now = s.stick_playing != null ? (names[s.stick_playing] || t("stick_n", { n: s.stick_playing + 1 })) : null;
  const fest = (s.dab_agc_failed || []).length ? t("dab_fest", { liste: s.dab_agc_failed.join(", ") }) : "";
  $("#stick-hint").textContent = (now ? t("spielt_auf", { n: now }) : "") + fest;
}

// Which stick (antenna) receives the current station better
function renderCompare(s) {
  $("#stick-compare").hidden = !(s.sticks > 1);
  if (!(s.sticks > 1)) return;
  const running = s.second_stick_busy === "compare";
  const btn = $("#compare-btn");
  btn.disabled = running || !s.playing || !!s.second_stick_busy;
  btn.textContent = running ? t("vergleiche") : t("vergleichen");
  const c = s.stick_compare, res = $("#compare-res");
  res.classList.remove("err");
  if (running) { res.textContent = t("misst"); return; }
  if (!c) { res.textContent = s.playing ? "" : t("zum_vergleichen"); return; }
  if (c.error) { res.textContent = "⚠ " + c.error; res.classList.add("err"); return; }
  const name = (st) => (s.stick_names || {})[st.index] || t("stick_n", { n: st.index + 1 });
  const [a, b] = [...c.sticks].sort((x, y) => y.quality - x.quality);
  const parts = c.sticks.map((st) => `${esc(name(st))}${st.playing ? t("spielt_klammer") : ""}: <b>${st.quality} %</b>`);
  const verdict = a.quality - b.quality < 5 ? t("etwa_gleich") : t("besser", { n: esc(name(a)) });
  const at = new Date(c.time * 1000).toLocaleTimeString(lokal(), { hour: "2-digit", minute: "2-digit" });
  res.innerHTML = `${esc(c.station)} (${esc(c.where)}, ${at}) · ${parts.join(" · ")} → ${verdict}`;
}
$("#scan-cancel").onclick = () => api("api/scan/cancel", {});
$$(".tabs button").forEach((b) => b.addEventListener("click", () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".tab").forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
  if (b.dataset.tab === "stations") loadStations();
  if (b.dataset.tab === "favorites" && S) renderFavorites();
}));

/* ------------------------------------------------------------------ browser playback
 * The browser plays the add-on's MP3 stream (through HA ingress, so no extra
 * port is needed).  The choice is stored per device. */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const localPlayer = {
  audio: null,
  wanted: store.get("yapaia.browserAudio", false),
  blocked: false,
  volume: store.get("yapaia.browserVolume", 80),
  _retry: null,
  _eigen: 0, // when we started/stopped the <audio> ourselves
  _ruhigBis: 0, // no catching up before this (after a stall)
  _ruhe: false, // the radio is stopped – no sound wanted right now
  _lage: null, // last seen { aktiv, station } of the radio
  _ansage: 0,
  el() {
    if (!this.audio) {
      const a = (this.audio = new Audio());
      a.preload = "none";
      const again = () => {
        if (!this.wanted) return;
        clearTimeout(this._retry);
        this._retry = setTimeout(() => this.start(), 2000);
      };
      a.addEventListener("error", again);
      // a stall: stop catching up – if it happened while speeding, for a minute
      const stockt = () => {
        this._ruhigBis = Date.now() + (a.playbackRate !== 1 ? 60000 : 10000);
        a.playbackRate = 1;
      };
      a.addEventListener("waiting", stockt);
      a.addEventListener("stalled", stockt);
      a.addEventListener("ended", again);
      // iPad/iPhone pause our <audio> when another app or tab speaks (e.g.
      // Yapaia Go's voice) and do not resume it.  Bring the sound back –
      // unless we paused it ourselves.
      a.addEventListener("pause", () => {
        if (!this.wanted || this._ruhe || !a.src || Date.now() - this._eigen < 1500 || this._spricht()) return;
        clearTimeout(this._retry);
        this._retry = setTimeout(() => { if (this.wanted && !this._ruhe && a.paused && !this._spricht()) this.start(); }, 1000);
      });
      a.addEventListener("playing", () => { this.blocked = false; renderOutput(); });
      setInterval(() => this._aufholen(), 1000);
    }
    return this.audio;
  },
  start() {
    const a = this.el();
    this._eigen = Date.now();
    this._ruhe = false;
    a.src = `stream.mp3?t=${Date.now()}`;
    a.volume = this.volume / 100;
    const p = a.play();
    if (p && p.catch) p.catch(() => { this.blocked = true; renderOutput(); });
  },
  stop() {
    clearTimeout(this._retry);
    this._eigen = Date.now();
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); }
  },
  /* The radio itself was stopped / started / switched (seen in its state).
   * The browser keeps several seconds of the stream in its buffer – without
   * this, "stop" played on for ~5 s and a new station began only after the
   * old buffer had run out.  So: stop at once, and (re)connect at the live
   * edge when the radio starts or the station changes. */
  /* Live radio: the browser keeps several seconds of the stream in stock,
   * and every announcement mixed in by Beat came that much later (~6 s).
   * Catch up gently: never seek (1.6.3 did – the stock ran dry and the sound
   * broke up), only play 5 % faster (pitch kept) while more than 2 s are in
   * stock, back to normal below 1 s.  Hands off while starting, after any
   * stall, and for a minute if a stall happened while speeding. */
  _aufholen() {
    const a = this.audio;
    if (!a || !a.buffered || !a.buffered.length) return;
    const jetzt = Date.now();
    const normal = () => { if (a.playbackRate !== 1) a.playbackRate = 1; };
    if (a.paused || a.readyState < 3 || jetzt - this._eigen < 8000 || jetzt < this._ruhigBis) { normal(); return; }
    const lag = a.buffered.end(a.buffered.length - 1) - a.currentTime;
    if (lag > 2 && a.playbackRate === 1) { a.preservesPitch = true; a.playbackRate = 1.05; }
    else if (lag < 1) normal();
  },
  _spricht() { return this._ansage > 0 && Date.now() - this._ansage < 30000; },
  sync(aktiv, station) {
    if (!this.wanted) { this._lage = null; return; }
    const vorher = this._lage;
    this._lage = { aktiv, station };
    if (!vorher) return;
    if (vorher.aktiv && !aktiv) { this.stop(); this._ruhe = true; return; }
    if (aktiv && (!vorher.aktiv || (station && station !== vorher.station))) this.start();
  },
  setWanted(on) {
    this.wanted = on; store.set("yapaia.browserAudio", on);
    if (on) this.start(); else { this.blocked = false; this.stop(); }
  },
  setVolume(v) {
    this.volume = v; store.set("yapaia.browserVolume", v);
    if (this.audio) this.audio.volume = v / 100;
  },
  get playing() { return !!(this.audio && !this.audio.paused && this.audio.src); },
};

/* Inside Home Assistant this page is an iframe that is thrown away when you
 * open another dashboard – and the sound with it.  The Yapaia Beat
 * integration loads a player into the main Home Assistant window (the same
 * one the radio card uses); if it is there, we let it play, so the radio keeps
 * running on every dashboard. */
function findHost() {
  try {
    if (window.parent !== window && window.parent.YapaiaBeatPlayer) return window.parent.YapaiaBeatPlayer;
  } catch (e) { /* not Home Assistant (other origin) */ }
  return null;
}
let HOST = findHost();
function connectHost() {
  HOST.ensure(); // sign the stream URL now so a tap can start it right away
  const onHost = () => renderOutput();
  HOST._listeners.add(onHost);
  window.addEventListener("pagehide", () => HOST._listeners.delete(onHost));
}
if (HOST) connectHost();
else {
  // The integration loads the player into every dashboard.  If it is missing
  // in this Home Assistant window (e.g. the page was loaded before the
  // integration), load it ourselves – otherwise the sound would stop as soon
  // as you leave this page.
  try {
    const doc = window.parent !== window ? window.parent.document : null;
    if (doc && !doc.querySelector("script[data-yapaia-beat-player]")) {
      const sc = doc.createElement("script");
      sc.type = "module";
      sc.src = "/yapaia_beat/yapaia-beat-card.js";
      sc.dataset.yapaiaBeatPlayer = "1";
      sc.onload = () => {
        const h = findHost();
        if (!h) return;
        const lief = localPlayer.wanted && localPlayer.playing;
        if (localPlayer.wanted) { localPlayer.stop(); localPlayer.wanted = false; }
        HOST = h;
        connectHost();
        if (lief) HOST.setWanted(true); // may need a tap (browser rules) – the hint says so
        renderOutput();
      };
      doc.head.appendChild(sc);
    }
  } catch (e) { /* other origin: stand-alone page */ }
}
const player = {
  get wanted() { return HOST ? HOST.wanted : localPlayer.wanted; },
  get blocked() { return HOST ? HOST.blocked : localPlayer.blocked; },
  get volume() { return HOST ? HOST.volume : localPlayer.volume; },
  get playing() { return HOST ? HOST.playing : localPlayer.playing; },
  get audio() { return HOST ? HOST.audio : localPlayer.audio; },
  start() { if (HOST) HOST.start(); else localPlayer.start(); },
  stop() { if (HOST) HOST.stop(); else localPlayer.stop(); },
  setWanted(on) {
    if (!HOST) { localPlayer.setWanted(on); return; }
    if (on && HOST.wanted && HOST.playing) return; // already playing, no gap
    HOST.setWanted(on);
  },
  setVolume(v) { if (HOST) HOST.setVolume(v); else localPlayer.setVolume(v); },
};

function browserOnly() { return player.wanted && !(S && (S.speaker || (S.local_output && S.local_audio))); }

/* Output picker (like "Connect to a device" in Spotify): Mini-PC speakers,
 * this browser, both – or any media player Home Assistant knows (Sonos,
 * Chromecast, Music Assistant …); the integration sends the stream there. */
function outputMode() {
  if (!S) return "local";
  if (S.speaker) return "speaker:" + S.speaker;
  const local = S.local_audio && S.local_output;
  return local && player.wanted ? "both" : player.wanted ? "browser" : local ? "local" : "none";
}

/* The Music Assistant player of this browser (Sendspin), see the card. */
function findMa() {
  try {
    if (window.parent !== window && window.parent.YapaiaBeatMa) return window.parent.YapaiaBeatMa;
  } catch (e) { /* other origin */ }
  return null;
}
let MA = null;
function connectMa() {
  if (MA || !(MA = findMa())) return;
  const onMa = () => renderMa();
  MA._listeners.add(onMa);
  window.addEventListener("pagehide", () => MA._listeners.delete(onMa));
}
// a tap in this page counts for the sound in the main window, too
document.addEventListener("click", () => { if (MA && MA.wanted && MA.needsTap) MA.unlock(true); }, { capture: true });

function renderMa() {
  connectMa();
  const row = $("#ma-row");
  if (!MA || !S || (!S.music_assistant && !MA.wanted)) { row.hidden = true; return; }
  row.hidden = false;
  $("#ma-on").checked = MA.wanted;
  const n = "„" + MA.name + "“";
  const eigen = (S.players || []).find((p) => p.ma && p.name === MA.name);
  const texte = {
    aus: t("ma_aus", { n }),
    sucht: t("ma_sucht"),
    verbindet: t("ma_verbindet"),
    wartet: t("ma_wartet", { n }),
    bereit: eigen
      ? (S.speaker === eigen.entity_id ? t("ma_bereit_aktiv", { n }) : t("ma_bereit_oben", { n }))
      : t("ma_bereit_ohne", { n }),
    spielt: t("ma_spielt", { n }),
    fehler: t("ma_fehler", { fehler: MA.error }),
  };
  let text = texte[MA.status] || "";
  if (MA.wanted && MA.needsTap && MA.status !== "fehler") text += t("ma_tippen");
  $("#ma-hint").textContent = text;
  $("#ma-hint").classList.toggle("err", MA.status === "fehler");
}
$("#ma-on").addEventListener("change", (e) => {
  connectMa();
  if (MA) MA.setWanted(e.target.checked);
  renderMa();
});

function speakerName(id) {
  const p = (S.players || []).find((x) => x.entity_id === id);
  return p ? p.name : id;
}

function renderOutput() {
  if (!S) return;
  const mode = outputMode();
  const labels = {
    local: ["🖥", t("mini_pc")], browser: ["📱", t("dieses_geraet")], both: ["🖥", t("mini_und_geraet")], none: ["🔇", t("keine_ausgabe")],
  };
  const [icon, label] = mode.startsWith("speaker:") ? ["🔊", speakerName(S.speaker) + (player.wanted ? t("und_geraet") : "")] : labels[mode];
  $("#out-icon").textContent = icon;
  $("#out-label").textContent = label;
  $("#out-btn").classList.toggle("casting", !!S.speaker && !S.speaker_error);
  if (!$("#out-menu").hidden) renderOutMenu();
  $("#browser-unlock").hidden = !(player.wanted && player.blocked);
  let hint = "", err = false;
  const maSpeaker = S.speaker && (S.players || []).some((x) => x.entity_id === S.speaker && x.ma);
  if (S.speaker_error) { hint = "⚠ " + S.speaker_error; err = true; }
  else if (maSpeaker) hint = t("hint_ma");
  else if (player.wanted && player.blocked) hint = t("hint_tippen");
  else if (!S.local_audio && mode === "none") hint = t("hint_kein_audio");
  else if (player.wanted && !HOST && window.parent !== window) hint = t("hint_nur_seite");
  else if (player.wanted && IS_IOS) hint = (HOST ? t("hint_weiter") : "") + t("hint_ios");
  else if (player.wanted) hint = HOST ? t("hint_host") : t("hint_verzoegert");
  $("#out-hint").textContent = hint;
  renderMa();
  $("#out-hint").classList.toggle("err", err);
  const vol = browserOnly() ? player.volume : S.volume;
  if (document.activeElement !== $("#volume")) $("#volume").value = vol;
  fill($("#volume"));
  $("#volume-text").textContent = !browserOnly() && S.muted ? t("stumm") : vol;
}

function renderOutMenu() {
  const mode = outputMode();
  const item = (value, icon, label, opts = {}) => `
    <button role="option" data-out="${esc(value)}" class="${mode === value ? "active" : ""}" ${opts.disabled ? "disabled" : ""}>
      <span class="ico">${icon}</span><span class="lbl">${esc(label)}${opts.small ? `<br><small>${esc(opts.small)}</small>` : ""}</span>
    </button>`;
  const noLocal = !S.local_audio;
  const players = S.players || [];
  $("#out-menu").innerHTML = `
    <div class="grp">${esc(t("grp_hier"))}</div>
    ${item("browser", "📱", t("dieses_geraet"), { small: t("klein_browser") })}
    ${item("local", "🖥", t("mini_pc"), { disabled: noLocal, small: noLocal ? t("klein_kein_audio") : t("klein_lautsprecher") })}
    ${item("both", "🖥", t("mini_und_geraet"), { disabled: noLocal })}
    <div class="grp">${esc(t("grp_lautsprecher"))}</div>
    ${players.length
      ? players.map((p) => {
          const hier = p.ma && MA && MA.wanted && p.name === MA.name;
          return item("speaker:" + p.entity_id, p.ma ? "🎵" : "🔊", p.name, { small: (p.ma ? "Music Assistant · " : "") + (hier ? t("dieser_browser") : p.entity_id) });
        }).join("")
      : `<div class="none">${esc(t("keine_player"))}</div>`}
    ${maHinweis(players)}
    ${S.local_audio ? "" : item("none", "🔇", t("keine_ausgabe"))}`;
}

/* Why no player of Music Assistant shows up -- the most common reason is
 * that Music Assistant does not hand its players to Home Assistant. */
function maHinweis(players) {
  if (players.some((p) => p.ma)) return "";
  const text = t(S.music_assistant ? "ma_hinweis_ein" : "ma_hinweis_aus");
  return `<div class="grp">Music Assistant</div><div class="none">${esc(text)}</div>`;
}

$("#out-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("#out-menu");
  menu.hidden = !menu.hidden;
  if (!menu.hidden) renderOutMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".out-pick")) $("#out-menu").hidden = true;
});
$("#out-menu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-out]");
  if (!b || b.disabled) return;
  const out = b.dataset.out;
  const speaker = out.startsWith("speaker:") ? out.slice(8) : null;
  // the browser starts playing right here, inside the tap (needed on iOS)
  player.setWanted(out === "browser" || out === "both");
  // Back to the Music Assistant player of this browser: iPad/iPhone paused
  // its sound while "this device" played – release it again inside this tap.
  connectMa();
  if (MA && MA.wanted && speaker) MA.unlock(true);
  api("api/settings", { local_output: out === "local" || out === "both", speaker });
  $("#out-menu").hidden = true;
  renderOutput();
});
$("#browser-unlock").onclick = () => player.start();

/* DAB+ slideshow: tap to enlarge, tap again (or Esc) to close */
$("#now-slide").addEventListener("click", () => { $("#zoom img").src = $("#now-slide").src; $("#zoom").hidden = false; });
$("#zoom").addEventListener("click", () => ($("#zoom").hidden = true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#zoom").hidden = true; });

/* Browsers only allow sound after the user touched the page.  When the
 * page was opened with "this device" selected, the first tap anywhere
 * starts the sound – no extra button needed. */
const unlock = () => { if (player.wanted && player.blocked) player.start(); };
["click", "touchend", "keydown"].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));

/* lock screen / car display: station, logo and buttons via the Media Session API */
function updateMediaSession() {
  if (HOST || !("mediaSession" in navigator) || !S || !player.wanted) return; // HOST does it itself
  const st = S.station;
  const title = S.title ? (S.artist ? `${S.artist} – ${S.title}` : S.title) : (S.radiotext || (st && st.name) || "Yapaia Beat");
  const key = [title, st && st.id, st && st.logo_url].join("|");
  if (key === updateMediaSession.key) return;
  updateMediaSession.key = key;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: st ? st.name : "Yapaia Beat",
    album: "Yapaia Beat",
    artwork: st ? [{ src: new URL(st.logo_url, location.href).href, sizes: "256x256" }] : [],
  });
}
if (!HOST && "mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const safe = (fn) => { try { fn(); } catch (e) { /* unsupported action */ } };
  safe(() => ms.setActionHandler("play", () => { player.start(); api("api/play", {}); }));
  safe(() => ms.setActionHandler("pause", () => api("api/stop", {})));
  safe(() => ms.setActionHandler("stop", () => api("api/stop", {})));
  safe(() => ms.setActionHandler("nexttrack", () => api("api/next", {})));
  safe(() => ms.setActionHandler("previoustrack", () => api("api/previous", {})));
}

if (player.wanted && !player.playing) player.start(); // may be blocked until the first tap anywhere

spracheLaden().then(() => { connect(); loadStations(); });

// ---- Yapaia Design (docs/integration-protokoll.md §8a) --------------------
// Das Schema schickt die Integration an Beat; hier nur die CSS-Variablen setzen.
async function designHolen() {
  try {
    const d = await (await fetch("api/design", { cache: "no-store" })).json();
    const s = d && d.schema;
    if (!s || !s.css) return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(s.css)) root.style.setProperty(k, v);
    root.dataset.ySchema = s.id;
    root.dataset.yHell = String(s.hell);
    // Schriften liegen auf dem HA-Server: nur über Ingress (gleiche Herkunft) ladbar
    if (d.schriften && location.pathname.includes("/api/hassio_ingress/") && !document.querySelector(`link[href="${d.schriften}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = d.schriften;
      document.head.appendChild(l);
    }
  } catch { /* ohne Integration: eigenes Aussehen */ }
}
designHolen();
setInterval(designHolen, 60000);
