import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import './styles.css'

function ScrollToTopFab() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 420)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null
  return (
    <button
      className="scrollTopFab"
      aria-label="Volver al inicio"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  )
}

function AutoReloadOnNewBuild() {
  React.useEffect(() => {
    if (!import.meta.env.PROD) return

    const getActiveModuleSrc = () => {
      const el = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null
      const src = el?.getAttribute('src') ?? ''
      try {
        return src ? new URL(src, window.location.origin).toString() : ''
      } catch {
        return src
      }
    }

    let activeSrc = getActiveModuleSrc()
    let stopped = false

    const check = async () => {
      if (stopped) return
      try {
        const res = await fetch(window.location.pathname + window.location.search, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        })

        if (!res.ok) return
        const html = await res.text()
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const el = doc.querySelector('script[type="module"][src]') as HTMLScriptElement | null
        const nextSrcRaw = el?.getAttribute('src') ?? ''
        if (!nextSrcRaw) return
        const nextSrc = new URL(nextSrcRaw, window.location.origin).toString()

        if (!activeSrc) activeSrc = getActiveModuleSrc()
        if (activeSrc && nextSrc && activeSrc !== nextSrc) {
          window.location.reload()
        }
      } catch {
        // ignore
      }
    }

    const intervalMs = 45_000
    const t = window.setInterval(() => {
      void check()
    }, intervalMs)
    void check()

    return () => {
      stopped = true
      window.clearInterval(t)
    }
  }, [])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <AutoReloadOnNewBuild />
        <ScrollToTopFab />
        <div className="appFooter">
          <a
            className="appFooterBubble"
            href="https://unknownshoppers.com/menutags-landing/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="appFooterMenu">MENUTAGS</span>
            <span className="appFooterBy">by</span>
            <span className="appFooterBrand">The Unknown Shoppers</span>
          </a>
        </div>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
