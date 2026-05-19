import Capacitor
import UIKit

@objc(ApplePencilPlugin)
public class ApplePencilPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApplePencilPlugin"
    public let jsName = "ApplePencil"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableLowLatency", returnType: CAPPluginReturnPromise),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        let supported = UIDevice.current.userInterfaceIdiom == .pad
        call.resolve(["supported": supported])
    }

    @objc func enableLowLatency(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let webView = self.bridge?.webView {
                // Enable low-latency rendering for pencil input
                if #available(iOS 17.0, *) {
                    webView.configuration.preferences.isElementFullscreenEnabled = true
                }
                // Disable WebView's built-in scrolling to avoid gesture conflicts
                webView.scrollView.isScrollEnabled = false
                webView.scrollView.bounces = false
                webView.scrollView.showsVerticalScrollIndicator = false
                webView.scrollView.showsHorizontalScrollIndicator = false

                // Request max touch sample rate for Apple Pencil
                webView.scrollView.panGestureRecognizer.maximumNumberOfTouches = 1
            }
            call.resolve(["enabled": true])
        }
    }
}
