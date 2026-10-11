/**
 * Die Entitaeten, die Yapaia SELBST nach Home Assistant schreibt.
 *
 * ─── WOFUER ─────────────────────────────────────────────────────────────────
 * Aus dem Protokoll einer echten Installation:
 *
 *     ha_tracker: konfigurierte Entitaet nicht gefunden -- Quelle bleibt inaktiv
 *     { entityId: "device_tracker.yapaia_vehicle",
 *       verfuegbar: ["device_tracker.ipad_2"] }
 *
 * Yapaia war als seine eigene Positionsquelle eingestellt.
 *
 * Das war keine Fehlbedienung. Die Auswahlliste unter „Positionsquelle" wird
 * aus Home Assistant gefuellt -- aus allen `device_tracker.*` mit Koordinaten.
 * Yapaias eigener Fahrzeug-Tracker traegt Koordinaten, also stand er mit
 * drin, unter dem Namen „Yapaia Go Vehicle". Von allen Eintraegen klang er am
 * meisten nach „das Fahrzeug, um das es geht".
 *
 * Gewaehlt ergibt das einen Kreis: Yapaia schreibt seine Position nach Home
 * Assistant und liest sie von dort als Eingabe zurueck. Neues entsteht dabei
 * nirgends. Im besten Fall passiert nichts, im schlechteren friert die
 * Navigation auf dem letzten Wert ein, den sie selbst geschrieben hat -- und
 * das Protokoll meldet nicht „Kreis", sondern „nicht gefunden".
 *
 * ─── WARUM EINE EIGENE DATEI FUER EINE ZEICHENKETTE ──────────────────────────
 * Weil mehrere Stellen dieselbe Entitaet erzeugen (`statesBridge.ts`,
 * `mqtt/discovery.ts` ueber `object_id`) und eine weitere sie
 * ausschliessen muss (`position/haTracker`). Stuende der Name dreimal als
 * Literal da, koennte einer davon umbenannt werden, ohne dass die anderen
 * nachziehen -- und der Ausschluss griffe still ins Leere. Genau die Sorte
 * Fehler, die hier schon zu oft vorkam: ein Weg, der existiert, aber von der
 * Stelle aus, die hinsieht, nicht erreichbar ist.
 *
 * Die Datei haengt bewusst von NICHTS ab. Sie darf damit von jedem Modul
 * importiert werden, ohne einen Ringschluss zu bauen.
 */

/**
 * Yapaias eigener Fahrzeug-Tracker -- die AUSGABE der Navigation.
 *
 * Er ist zugleich der Schluessel, unter dem `buildHaStates` die Position
 * fuehrt, und die Entitaet, die MQTT anlegt (wer MQTT nutzt).
 */
export const EIGENER_FAHRZEUG_TRACKER = 'device_tracker.yapaia_vehicle';

/** Derselbe Standort als Entitaet der Integration „Yapaia" (`yapaia/beschreibung.ts`, `standort`). */
export const EIGENER_STANDORT = 'device_tracker.yapaia_go_standort';

/**
 * Ob eine Entity-ID eine ist, die Yapaia selbst schreibt.
 *
 * Als Funktion und nicht als Vergleich an den Aufrufstellen, damit ein
 * zweiter eigener Tracker (falls je einer dazukommt) an genau einer Stelle
 * nachgetragen wird.
 */
export function istEigeneEntitaet(entityId: string): boolean {
  return entityId === EIGENER_FAHRZEUG_TRACKER || entityId === EIGENER_STANDORT;
}
