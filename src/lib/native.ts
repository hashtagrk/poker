import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { StateStorage } from 'zustand/middleware'

/** True inside the iOS app, false in a browser. */
export const isNative = Capacitor.isNativePlatform()

/**
 * iOS can evict a web view's localStorage under storage pressure, so the app
 * keeps games in native preferences instead.
 */
export const nativeStorage: StateStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
}

/** Downloads don't exist in an iOS web view; write a file and open the share sheet instead. */
export async function shareJsonFile(filename: string, json: string): Promise<void> {
  const { uri } = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title: filename, files: [uri] })
}

export async function setUpNativeChrome(): Promise<void> {
  if (!isNative) return
  await StatusBar.setStyle({ style: Style.Dark })
  await SplashScreen.hide()
}
