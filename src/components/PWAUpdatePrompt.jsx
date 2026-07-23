// src/components/PWAUpdatePrompt.jsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for a new service worker every 60 minutes instead of on every
      // tab focus, so you're not getting reload prompts constantly while
      // actively working.
      if (registration) {
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#0f172a', color: 'white',
      padding: '14px 18px', borderRadius: 10,
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: 'inherit', fontSize: 13.5,
    }}>
      <span>A new version is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#0d7377', color: 'white', border: 'none',
          borderRadius: 6, padding: '6px 12px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{
          background: 'none', color: '#94a3b8', border: 'none',
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Later
      </button>
    </div>
  )
}
