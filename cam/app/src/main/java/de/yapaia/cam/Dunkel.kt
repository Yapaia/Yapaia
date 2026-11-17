package de.yapaia.cam

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager

/**
 * Display dunkel: schwarze Vollbild-Activity mit kleinster Helligkeit.
 * Eine Berührung oder irgendeine Taste schließt sie wieder (die Taste wird
 * dabei verschluckt). Aufruf: `/anzeige/dunkel`, zurück: `/anzeige/hell`.
 */
class Dunkel : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        offen = this
        setContentView(View(this).apply { setBackgroundColor(Color.BLACK) })
        window.attributes = window.attributes.apply { screenBrightness = 0f }
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_UP) finish()
        return true
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_UP) finish()
        return true
    }

    override fun onDestroy() {
        if (offen === this) offen = null
        super.onDestroy()
    }

    companion object {
        @Volatile var offen: Dunkel? = null

        fun an(ctx: Context) = ctx.startActivity(Intent(ctx, Dunkel::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))

        fun aus() { offen?.let { it.runOnUiThread { it.finish() } } }
    }
}
