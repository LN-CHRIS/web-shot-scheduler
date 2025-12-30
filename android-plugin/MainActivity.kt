/**
 * NATIVE ANDROID CODE - Modify your existing MainActivity.kt
 * 
 * Location: android/app/src/main/java/app/lovable/<your-app-id>/MainActivity.kt
 * 
 * Add the WebViewScreenshotPlugin to the list of plugins.
 */

package app.lovable.webscreenshotscheduler

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register the custom plugin before calling super.onCreate()
        registerPlugin(WebViewScreenshotPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
