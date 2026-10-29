import { texte } from '../i18n/index.js';

export const T = texte(
  {
    // Sprachfenster
    sprachbefehl: 'Sprachbefehl',
    fenster_schliessen: 'Sprachfenster schließen',
    beispiel_einleitung: 'Sag oder tippe zum Beispiel:',
    ja: 'Ja',
    nein: 'Nein',
    hoere_zu: 'Ich höre zu … {text}',
    oder_tippen: 'Oder tippen …',
    befehl_tippen: 'Befehl tippen …',
    zuhoeren_beenden: 'Zuhören beenden',
    sprechen: 'Sprechen',
    senden: 'Senden',
    kein_https:
      'Sprechen geht hier nicht: Browser geben das Mikrofon nur über HTTPS frei. Sprich stattdessen über Home Assistant Assist (Satellit oder Assist-Knopf in der Home-Assistant-App).',
    keine_erkennung:
      'Dieser Browser kann keine Sprache erkennen. Tippe den Befehl oder nutze Home Assistant Assist.',
    // Erkennung
    erkennung_fehlt: 'Spracherkennung ist in diesem Browser nicht verfügbar.',
    mikrofon_verweigert: 'Das Mikrofon wurde nicht freigegeben.',
    nichts_gehoert: 'Ich habe nichts gehört.',
    erkennung_fehler: 'Spracherkennung: {fehler}',
    erkennung_start: 'Spracherkennung ließ sich nicht starten.',
    // Client (Fehlerantworten, die der Browser selbst erzeugt)
    nicht_geklappt: 'Das hat nicht geklappt (Fehler {status}).',
    keine_antwort: 'Keine Antwort erhalten.',
    nicht_erreichbar: 'Yapaia ist gerade nicht erreichbar.',
    // Einstellungen
    weg_lautsprecher: 'An den Lautsprecher „{ziel}“ – ohne Verzögerung.',
    weg_beat_ma_browser:
      'Yapaia Beat spielt über Music Assistant auf „{ziel}“. Ist das dieser Browser, mischt er die Ansage sofort selbst ein; sonst mischt Beat sie ins Radio.',
    weg_beat_ma:
      'Yapaia Beat spielt über Music Assistant auf „{ziel}“ und mischt die Ansage ins Radio – die Musik läuft dabei leiser weiter.',
    weg_beat_radio: 'Yapaia Beat mischt die Ansage ins Radio (einige Sekunden verzögert).',
    weg_beat:
      'Yapaia spricht selbst – läuft das Radio von Yapaia Beat, mischt Beat die Ansage ein.',
    weg_selbst: 'Yapaia spricht selbst.',
    lautsprecher_ma: '{name} (Music Assistant)',
    lautsprecher_unterbricht: '{name} (unterbricht die Wiedergabe)',
    ma_ein_player: 'Music Assistant: ein Player gefunden.',
    ma_n_player: 'Music Assistant: {n} Player gefunden.',
    ma_ohne_player:
      'Music Assistant ist eingerichtet, gibt aber keinen Player an Home Assistant weiter. In Music Assistant: Einstellungen → Wiedergabegeräte → Player wählen → „Dieses Wiedergabegerät für Home Assistant freigeben“ einschalten und speichern.',
    ma_keine_integration:
      'Music Assistant ist in Home Assistant nicht als Integration eingerichtet (Einstellungen → Geräte & Dienste). Das Add-on allein reicht nicht.',
    http_fehler: 'HTTP {status}',
    test_text: 'Das ist eine Testansage von Yapaia.',
    test_browser_ok:
      'Im Browser eingemischt („{player}“) – nach {s} s gesprochen, die Musik lief leiser weiter.',
    test_browser_fehler:
      'Der Browser konnte die Ansage nicht abspielen (einmal irgendwo tippen und erneut testen).',
    test_beat_ok: 'Yapaia Beat hat die Ansage ins Radio gemischt.',
    h_assist: 'Sprechen über Home Assistant Assist',
    assist_text:
      'Sprachsatelliten und der Assist-Knopf der Home-Assistant-App hören auch ohne HTTPS zu. Yapaia legt dafür in Home Assistant die Automation „Yapaia Sprachbefehle“ an; sie gibt die Sätze über die Integration „Yapaia“ an Yapaia Go weiter.',
    laedt: 'Lade …',
    nur_addon: 'Nur im Home-Assistant-Add-on verfügbar.',
    integration_verbunden: 'Integration „Yapaia“ verbunden',
    automation_da: 'Automation „Yapaia Sprachbefehle“',
    richte_ein: 'Richte ein …',
    neu_einrichten: 'Neu einrichten',
    in_ha_einrichten: 'In Home Assistant einrichten',
    eingerichtet: 'Eingerichtet. Sag zum Beispiel „Yapaia, fahre mich nach Magdeburg“.',
    nicht_geklappt_kurz: 'Das hat nicht geklappt.',
    h_so_sprichst: 'So sprichst du mit Yapaia',
    so_satellit: 'Satellit: Aktivierungswort, dann z. B. „Yapaia, wo ist die nächste Tankstelle?“',
    so_app: 'Home-Assistant-App: Assist öffnen (Mikrofon), dann den Befehl sprechen.',
    so_kurz:
      'Häufige Befehle gehen auch ohne „Yapaia“: „Fahre mich nach …“, „Stoppe die Navigation“, „Wann sind wir da?“',
    so_ki:
      'Nutzt dein Assist eine KI als Gesprächsagent, schalte dort „Befehle bevorzugt lokal verarbeiten“ ein — sonst erreichen die Sätze Yapaia nicht.',
    h_ansagen: 'Ansagen und Radio',
    beat_einmischen:
      'Läuft Yapaia Beat, Ansagen ins Radio einmischen: die Musik wird leiser, die Ansage kommt darüber, danach wird die Musik wieder lauter. Braucht Yapaia Beat 1.6.',
    beat_nicht_eingerichtet: 'Yapaia Beat ist in Home Assistant nicht eingerichtet.',
    ansagen_ueber: 'Ansagen über',
    automatisch: 'Automatisch',
    lautsprecher_hilfe:
      'Zur Wahl stehen alle Lautsprecher aus Home Assistant, zum Beispiel ein Sprachsatellit. Läuft das Radio von Yapaia Beat über Music Assistant, mischt Beat die Ansage ein; die Musik läuft dabei leiser weiter. Sonst geht sie an den gewählten Lautsprecher (Automatisch: an Music Assistant, wenn es genau einen Player gibt). Music Assistant hält dafür kurz an, was dort läuft; ein Lautsprecher mit dem Zusatz „unterbricht“ beendet es. Ohne Wahl spricht Yapaia selbst.',
    radio_ueber_ma: 'Läuft das Radio über Music Assistant',
    ma_browser: 'Im Browser einmischen – sofort, Musik läuft leiser weiter',
    ma_mischen: 'Beat mischt – Musik läuft weiter, Ansage einige Sekunden später',
    ma_sofort: 'Music Assistant spricht sofort – Musik pausiert, kommt später wieder',
    ma_browser_hilfe:
      '„Im Browser einmischen“ geht, wenn dieser Browser in Yapaia Beat als „Music Assistant in diesem Browser“ angemeldet ist und das Radio darauf spielt (Yapaia Beat 1.9). Sonst mischt Beat.',
    gong: 'Gong vor Ansagen über Music Assistant. Mischt Yapaia Beat die Ansage ins Radio, gibt es keinen Gong.',
    ansagen_aktuell: 'So kommen Ansagen gerade an: ',
    teste: 'Teste …',
    ansage_testen: 'Ansage ins Radio testen',
    h_ki: 'KI für freie Sätze',
    ki_text:
      'Versteht Yapaia einen Satz nicht, kann es eine KI aus Home Assistant fragen. Die übersetzt nur — ausgeführt wird weiterhin von Yapaia, und eine Route startet erst nach „Ja“. Ohne KI funktionieren alle eingebauten Befehle, auch offline.',
    keine_ki: 'Keine KI (nur eingebaute Befehle)',
    kein_agent: 'In Home Assistant ist kein Gesprächsagent eingerichtet.',
  },
  {
    sprachbefehl: 'Voice command',
    fenster_schliessen: 'Close voice window',
    beispiel_einleitung: 'Say or type, for example:',
    ja: 'Yes',
    nein: 'No',
    hoere_zu: 'Listening … {text}',
    oder_tippen: 'Or type …',
    befehl_tippen: 'Type a command …',
    zuhoeren_beenden: 'Stop listening',
    sprechen: 'Speak',
    senden: 'Send',
    kein_https:
      'Speaking does not work here: browsers only allow microphone access over HTTPS. Speak via Home Assistant Assist instead (satellite or the Assist button in the Home Assistant app).',
    keine_erkennung:
      'This browser cannot recognise speech. Type the command or use Home Assistant Assist.',
    erkennung_fehlt: 'Speech recognition is not available in this browser.',
    mikrofon_verweigert: 'Microphone access was not granted.',
    nichts_gehoert: 'I did not hear anything.',
    erkennung_fehler: 'Speech recognition: {fehler}',
    erkennung_start: 'Speech recognition could not be started.',
    nicht_geklappt: 'That did not work (error {status}).',
    keine_antwort: 'No response received.',
    nicht_erreichbar: 'Yapaia cannot be reached right now.',
    weg_lautsprecher: 'To the speaker “{ziel}” – without delay.',
    weg_beat_ma_browser:
      'Yapaia Beat plays via Music Assistant on “{ziel}”. If that is this browser, it mixes in the announcement itself straight away; otherwise Beat mixes it into the radio.',
    weg_beat_ma:
      'Yapaia Beat plays via Music Assistant on “{ziel}” and mixes the announcement into the radio – the music keeps playing more quietly.',
    weg_beat_radio: 'Yapaia Beat mixes the announcement into the radio (delayed by a few seconds).',
    weg_beat:
      'Yapaia speaks itself – if the radio is playing from Yapaia Beat, Beat mixes in the announcement.',
    weg_selbst: 'Yapaia speaks itself.',
    lautsprecher_ma: '{name} (Music Assistant)',
    lautsprecher_unterbricht: '{name} (interrupts playback)',
    ma_ein_player: 'Music Assistant: one player found.',
    ma_n_player: 'Music Assistant: {n} players found.',
    ma_ohne_player:
      'Music Assistant is set up but does not pass any player on to Home Assistant. In Music Assistant: Settings → Players → choose the player → turn on “Expose this player to Home Assistant” and save.',
    ma_keine_integration:
      'Music Assistant is not set up as an integration in Home Assistant (Settings → Devices & services). The add-on alone is not enough.',
    http_fehler: 'HTTP {status}',
    test_text: 'This is a test announcement from Yapaia.',
    test_browser_ok:
      'Mixed in in the browser (“{player}”) – spoken after {s} s, the music kept playing more quietly.',
    test_browser_fehler:
      'The browser could not play the announcement (tap anywhere once and test again).',
    test_beat_ok: 'Yapaia Beat mixed the announcement into the radio.',
    h_assist: 'Speaking via Home Assistant Assist',
    assist_text:
      'Voice satellites and the Assist button in the Home Assistant app listen even without HTTPS. For this, Yapaia creates the automation “Yapaia voice commands” in Home Assistant; it passes the sentences on to Yapaia Go via the “Yapaia” integration.',
    laedt: 'Loading …',
    nur_addon: 'Only available in the Home Assistant add-on.',
    integration_verbunden: 'Integration “Yapaia” connected',
    automation_da: 'Automation “Yapaia voice commands”',
    richte_ein: 'Setting up …',
    neu_einrichten: 'Set up again',
    in_ha_einrichten: 'Set up in Home Assistant',
    eingerichtet: 'Set up. Say, for example, “Yapaia, take me to Magdeburg”.',
    nicht_geklappt_kurz: 'That did not work.',
    h_so_sprichst: 'How to talk to Yapaia',
    so_satellit: 'Satellite: wake word, then e.g. “Yapaia, where is the nearest fuel station?”',
    so_app: 'Home Assistant app: open Assist (microphone), then speak the command.',
    so_kurz:
      'Common commands also work without “Yapaia”: “Take me to …”, “Stop navigation”, “When will we arrive?”',
    so_ki:
      'If your Assist uses an AI as its conversation agent, turn on “Prefer handling commands locally” there — otherwise the sentences do not reach Yapaia.',
    h_ansagen: 'Announcements and radio',
    beat_einmischen:
      'While Yapaia Beat is playing, mix announcements into the radio: the music gets quieter, the announcement is played over it, then the music gets louder again. Requires Yapaia Beat 1.6.',
    beat_nicht_eingerichtet: 'Yapaia Beat is not set up in Home Assistant.',
    ansagen_ueber: 'Announcements via',
    automatisch: 'Automatic',
    lautsprecher_hilfe:
      'All speakers from Home Assistant are available, for example a voice satellite. If the radio from Yapaia Beat plays via Music Assistant, Beat mixes in the announcement; the music keeps playing more quietly. Otherwise it goes to the chosen speaker (Automatic: to Music Assistant if there is exactly one player). Music Assistant briefly stops whatever is playing there; a speaker marked “interrupts” ends it. Without a choice, Yapaia speaks itself.',
    radio_ueber_ma: 'If the radio plays via Music Assistant',
    ma_browser: 'Mix in in the browser – immediately, music keeps playing more quietly',
    ma_mischen: 'Beat mixes – music keeps playing, announcement a few seconds later',
    ma_sofort: 'Music Assistant speaks immediately – music pauses and resumes later',
    ma_browser_hilfe:
      '“Mix in in the browser” works if this browser is registered in Yapaia Beat as “Music Assistant in this browser” and the radio is playing on it (Yapaia Beat 1.9). Otherwise Beat mixes.',
    gong: 'Chime before announcements via Music Assistant. If Yapaia Beat mixes the announcement into the radio, there is no chime.',
    ansagen_aktuell: 'How announcements arrive right now: ',
    teste: 'Testing …',
    ansage_testen: 'Test announcement on the radio',
    h_ki: 'AI for free-form sentences',
    ki_text:
      'If Yapaia does not understand a sentence, it can ask an AI from Home Assistant. The AI only translates — Yapaia still carries it out, and a route only starts after “Yes”. Without AI, all built-in commands work, even offline.',
    keine_ki: 'No AI (built-in commands only)',
    kein_agent: 'No conversation agent is set up in Home Assistant.',
  }
);
