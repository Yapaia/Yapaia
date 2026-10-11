# Änderungen

## 0.2.0

**Yapaia Router: Gerät in der Integration „Yapaia“, SIM nach Land.**

- Der Router ist jetzt ein Modul der gemeinsamen Integration „Yapaia“
  (Gerät „Yapaia Router“) statt der eigenständigen Integration
  „GL.iNet Cellular“. Einrichten über *Integration hinzufügen → Yapaia →
  GL.iNet-Router*. Entitäten heißen `…yapaia_router_…`.
- **SIM nach Land:** Das Land kommt aus dem Ländercode (MCC) des eingebuchten
  Netzes. Je Land lässt sich die SIM festlegen; an der Grenze schaltet der
  Router um, sobald das neue Land einige Minuten stabil ist. Neu: Sensor
  „Land“, Binärsensor „Roaming“, Schalter „SIM nach Land“, Auslöser „Land
  gewechselt“, „SIM gewechselt“, „SIM-Wechsel fehlgeschlagen“.
- **Umschaltung lernt sich selbst ein:** Beim ersten Wechsel werden die
  bekannten Befehle probiert; gemerkt wird nur der, nach dem der Router die neue
  SIM wirklich meldet. Kein Laptop und keine Entwicklerwerkzeuge mehr nötig.
- Diagnose-Download enthält zusätzlich Ländercode und SIM-Heimatland.

## 0.1.1

- Umgezogen ins Monorepo [Yapaia/yapaia](https://github.com/Yapaia/yapaia) (Ordner `router/`).
  Links zu Doku und Fehlermeldungen zeigen dorthin. Keine Änderung an der Funktion.
- Die Installation über HACS entfällt vorerst (siehe README).

## 0.1.0

- Erste Fassung: Mobilfunkstatus des GL.iNet GL-X3000, SIM-Umschaltung,
  Neuverbinden, Router-Neustart, Diagnose, Aktion `glinet_cellular.rpc_call`.
