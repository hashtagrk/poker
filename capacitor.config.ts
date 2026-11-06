import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hashtagrk.alpinepoker',
  appName: 'Alpine Poker',
  webDir: 'dist',
  backgroundColor: '#0f1f18',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0f1f18',
    },
  },
}

export default config
