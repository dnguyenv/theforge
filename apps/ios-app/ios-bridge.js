/**
 * iOS Native Bridge — Integrates Capacitor native plugins with the canvas app.
 * Loaded ONLY when running inside the iOS app (detects Capacitor environment).
 * Provides: Apple Pencil support, haptic feedback, safe area handling,
 * offline persistence, app lifecycle management.
 */

const isCapacitor = () => window.Capacitor !== undefined;

export class iOSBridge {
    constructor() {
        this._safeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
        this._initialized = false;
    }

    async init() {
        if (!isCapacitor()) return;

        const { Haptics } = await import('@capacitor/haptics');
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        this._haptics = Haptics;
        this._statusBar = StatusBar;

        // Configure native drawing view
        try {
            const DrawingView = window.Capacitor.Plugins.DrawingView;
            if (DrawingView) {
                await DrawingView.configureForDrawing();
                const insets = await DrawingView.getSafeAreaInsets();
                this._safeInsets = insets;
                this._applySafeAreaInsets(insets);
                await DrawingView.setKeepScreenAwake({ enabled: true });
            }
        } catch (e) {
            console.warn('DrawingView plugin not available:', e);
        }

        // Configure Apple Pencil
        try {
            const ApplePencil = window.Capacitor.Plugins.ApplePencil;
            if (ApplePencil) {
                const { supported } = await ApplePencil.isSupported();
                if (supported) {
                    await ApplePencil.enableLowLatency();
                }
            }
        } catch (e) {
            console.warn('ApplePencil plugin not available:', e);
        }

        // Dark status bar
        try {
            await this._statusBar.setStyle({ style: 'DARK' });
            await this._statusBar.setBackgroundColor({ color: '#12121a' });
        } catch (e) {}

        // App lifecycle — save state when backgrounded
        try {
            const DrawingView = window.Capacitor.Plugins.DrawingView;
            if (DrawingView) {
                DrawingView.addListener('appWillResignActive', () => {
                    window.dispatchEvent(new CustomEvent('ios:background'));
                });
                DrawingView.addListener('appDidBecomeActive', () => {
                    window.dispatchEvent(new CustomEvent('ios:foreground'));
                });
            }
        } catch (e) {}

        this._initialized = true;
    }

    _applySafeAreaInsets(insets) {
        const root = document.documentElement;
        root.style.setProperty('--safe-area-top', `${insets.top}px`);
        root.style.setProperty('--safe-area-bottom', `${insets.bottom}px`);
        root.style.setProperty('--safe-area-left', `${insets.left}px`);
        root.style.setProperty('--safe-area-right', `${insets.right}px`);
    }

    async hapticLight() {
        if (!this._haptics) return;
        try { await this._haptics.impact({ style: 'LIGHT' }); } catch {}
    }

    async hapticMedium() {
        if (!this._haptics) return;
        try { await this._haptics.impact({ style: 'MEDIUM' }); } catch {}
    }

    async hapticHeavy() {
        if (!this._haptics) return;
        try { await this._haptics.impact({ style: 'HEAVY' }); } catch {}
    }

    async hapticSelection() {
        if (!this._haptics) return;
        try { await this._haptics.selectionChanged(); } catch {}
    }

    get safeInsets() {
        return this._safeInsets;
    }

    get isRunning() {
        return this._initialized;
    }
}

export const iosBridge = new iOSBridge();
