package de.yapaia.cam

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Nach dem Booten (und nach einem Update): Dienst starten. Zusätzlich eine
 * unsichtbare Activity – ein Dienst, der aus einer Activity heraus startet,
 * darf auch im Hintergrund die Kamera benutzen. Ob Android die Activity aus
 * dem Hintergrund zulässt, hängt von „Über anderen Apps einblenden“ ab; ohne
 * läuft der Dienst trotzdem.
 */
class StartEmpfaenger : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        try {
            ctx.startActivity(Intent(ctx, Starter::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))
        } catch (_: Exception) {
        }
        YapaiaDienst.starten(ctx)
    }
}

/** Unsichtbar: startet den Dienst und schließt sich sofort. */
class Starter : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        YapaiaDienst.starten(this)
        finish()
    }
}
