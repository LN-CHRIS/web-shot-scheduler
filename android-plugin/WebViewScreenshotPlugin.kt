/**
 * NATIVE ANDROID CODE - Add this file to your Android project
 * 
 * Location: android/app/src/main/java/app/lovable/<your-app-id>/WebViewScreenshotPlugin.kt
 * 
 * This plugin creates an off-screen WebView at the specified dimensions,
 * loads the URL, waits for it to render, and captures it as a bitmap.
 */

package app.lovable.webscreenshotscheduler

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "WebViewScreenshot")
class WebViewScreenshotPlugin : Plugin() {

    @PluginMethod
    fun capture(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("URL is required")
            return
        }

        val width = call.getInt("width", 3200) ?: 3200
        val height = call.getInt("height", 1800) ?: 1800
        val delayMs = call.getInt("delayMs", 3000) ?: 3000

        // Run on UI thread since WebView requires it
        activity.runOnUiThread {
            try {
                captureWebView(url, width, height, delayMs, call)
            } catch (e: Exception) {
                call.reject("Failed to initialize WebView: ${e.message}")
            }
        }
    }

    private fun captureWebView(url: String, width: Int, height: Int, delayMs: Int, call: PluginCall) {
        val webView = WebView(context).apply {
            // Configure WebView settings for best rendering
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                setSupportZoom(false)
                builtInZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                // Enable hardware acceleration for better rendering
                setLayerType(WebView.LAYER_TYPE_HARDWARE, null)
            }
            
            // Set background to white
            setBackgroundColor(android.graphics.Color.WHITE)
        }

        // Layout the WebView at the specified dimensions
        // This is crucial - it sets the virtual viewport size
        webView.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY)
        )
        webView.layout(0, 0, width, height)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, loadedUrl: String?) {
                super.onPageFinished(view, loadedUrl)
                
                // Wait for JavaScript/CSS to fully render
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        // Force a layout pass to ensure content is rendered
                        webView.measure(
                            android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                            android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY)
                        )
                        webView.layout(0, 0, width, height)

                        // Create bitmap at the exact dimensions
                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        val canvas = Canvas(bitmap)
                        
                        // Draw the WebView content to the canvas
                        webView.draw(canvas)
                        
                        // Convert to base64
                        val outputStream = ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                        val base64String = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
                        
                        // Clean up
                        bitmap.recycle()
                        webView.destroy()
                        
                        // Return result
                        val result = JSObject().apply {
                            put("base64", base64String)
                            put("width", width)
                            put("height", height)
                        }
                        call.resolve(result)
                        
                    } catch (e: Exception) {
                        webView.destroy()
                        call.reject("Failed to capture screenshot: ${e.message}")
                    }
                }, delayMs.toLong())
            }

            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                // Don't reject on resource errors, only log them
                android.util.Log.w("WebViewScreenshot", "Resource error: $errorCode - $description")
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                // Let the WebView handle all URL loading
                return false
            }
        }

        // Load the URL
        webView.loadUrl(url)
    }
}
