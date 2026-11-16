package de.yapaia.cam

import org.json.JSONObject

/**
 * Eine Funktion des Dienstes (Kameras, später Sensoren, Audio …).
 *
 * Jedes Modul trägt unter seinem [name] einen Abschnitt zu `/status` bei und
 * beantwortet die Anfragen unter `/<name>/…`.
 */
interface Modul {
    /** Schlüssel in `/status` und erster Pfadteil seiner Adressen. */
    val name: String

    fun starten() {}
    fun stoppen() {}

    /** Zustand für `/status`. */
    fun status(): JSONObject

    /**
     * Anfrage unter `/<name>/<rest>` beantworten. `false` = nicht zuständig
     * (der Server antwortet dann mit 404).
     */
    fun bearbeiten(rest: String, anfrage: Anfrage, antwort: Antwort): Boolean = false

    /** Steuerbefehle aus der App (Intent-Aktionen an den Dienst). */
    fun befehl(aktion: String) {}
}
