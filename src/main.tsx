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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ScrollToTopFab />
        <div className="appFooter">
          <div className="appFooterBubble">
            <span className="appFooterMenu">MENUTAGS</span>
            <span className="appFooterBy">by</span>
            <span className="appFooterBrand">The Unknown Shoppers</span>
          </div>
        </div>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
