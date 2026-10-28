import { forwardRef, type ButtonHTMLAttributes } from 'react'
import appStoreBadge from '@/assets/app-store-badge.svg'
import googlePlayBadge from '@/assets/google-play-badge.svg'
import { KEYRING_DOWNLOADS, type KeyringStore } from '@/lib/keyringDownloads'
import '@/styles/store-buttons.css'

export const KeyringStoreButton = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { store: KeyringStore }>(
  function KeyringStoreButton({ store, className = '', ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        className={`keyring-store-button is-${store}${className ? ` ${className}` : ''}`}
        aria-label={KEYRING_DOWNLOADS[store].label}
      >
        {store === 'android'
          ? <img className="google-play-badge" src={googlePlayBadge} alt="" />
          : <img className="app-store-badge" src={appStoreBadge} alt="" />}
      </button>
    )
  },
)
