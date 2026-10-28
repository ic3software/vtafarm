export type KeyringStore = 'ios' | 'android'

export type KeyringDownload = {
  label: string
  storeName: string
  url: string
}

export const KEYRING_DOWNLOADS: Record<KeyringStore, KeyringDownload> = {
  ios: {
    label: 'Download Keyring on the App Store; currently opens TestFlight',
    storeName: 'TestFlight',
    url: 'https://testflight.apple.com/join/NQYt25SQ',
  },
  android: {
    label: 'Get Keyring on Google Play',
    storeName: 'Google Play',
    url: 'https://play.google.com/store/apps/details?id=asml.bkc.harvard.wallet',
  },
}
