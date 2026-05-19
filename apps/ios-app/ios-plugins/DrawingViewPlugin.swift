import Capacitor
import UIKit

/// Native plugin to optimize the WKWebView for drawing performance:
/// - Disables bouncing/rubber-banding
/// - Enables edge-to-edge rendering
/// - Handles safe area insets
/// - Manages app lifecycle state saving
@objc(DrawingViewPlugin)
public class DrawingViewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DrawingViewPlugin"
    public let jsName = "DrawingView"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configureForDrawing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSafeAreaInsets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKeepScreenAwake", returnType: CAPPluginReturnPromise),
    ]

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        // Monitor app lifecycle for state preservation
        let willResign = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("appWillResignActive", data: [:])
        }

        let didBecomeActive = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("appDidBecomeActive", data: [:])
        }

        observers.append(contentsOf: [willResign, didBecomeActive])
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc func configureForDrawing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("No WebView available")
                return
            }

            // Disable rubber-banding
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false
            webView.scrollView.alwaysBounceHorizontal = false

            // Disable content inset adjustments
            webView.scrollView.contentInsetAdjustmentBehavior = .never

            // Disable zoom (handled by our own gesture system)
            webView.scrollView.minimumZoomScale = 1.0
            webView.scrollView.maximumZoomScale = 1.0

            // Allow for transparent background
            webView.isOpaque = false
            webView.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.06, alpha: 1.0)

            // Disable text selection menus
            webView.scrollView.isScrollEnabled = false

            call.resolve(["configured": true])
        }
    }

    @objc func getSafeAreaInsets(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let window = self.bridge?.webView?.window else {
                call.resolve(["top": 0, "bottom": 0, "left": 0, "right": 0])
                return
            }
            let insets = window.safeAreaInsets
            call.resolve([
                "top": insets.top,
                "bottom": insets.bottom,
                "left": insets.left,
                "right": insets.right,
            ])
        }
    }

    @objc func setKeepScreenAwake(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve(["enabled": enabled])
        }
    }
}
