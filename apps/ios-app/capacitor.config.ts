import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'art.antam.canvas',
  appName: 'An Tam Art',
  webDir: 'www',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    scrollEnabled: false,
    backgroundColor: '#0a0a0f',
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#12121a',
    },
  },
  server: {
    iosScheme: 'capacitor',
    allowNavigation: ['theforge-val4.onrender.com'],
  },
};

export default config;
