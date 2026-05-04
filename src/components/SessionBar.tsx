import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

type Props = {
  title: string
  rightSlot?: React.ReactNode
  showMenuButton?: boolean
  menuHref?: string
  menuLabel?: string
  autoHideOnScroll?: boolean
}

export default function SessionBar({
  title,
  rightSlot,
  showMenuButton = true,
  menuHref = '/menu',
  menuLabel = 'Menú',
  autoHideOnScroll = false,
}: Props) {
  const { user, logout } = useAuth()

  const [hidden, setHidden] = React.useState(false)
  const lastYRef = React.useRef(0)

  React.useEffect(() => {
    if (!autoHideOnScroll) return

    lastYRef.current = window.scrollY || 0
    setHidden(false)

    const onScroll = () => {
      const y = window.scrollY || 0
      const last = lastYRef.current
      lastYRef.current = y

      if (y < 10) {
        setHidden(false)
        return
      }

      const delta = y - last
      if (Math.abs(delta) < 6) return
      if (delta > 0) setHidden(true)
      else setHidden(false)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [autoHideOnScroll])

  return (
    <div className={hidden ? 'topbar topbarAutoHide topbarHidden' : autoHideOnScroll ? 'topbar topbarAutoHide' : 'topbar'}>
      <div className="topbarLeft">
        <div className="topbarTitle">{title}</div>
        <div className="topbarSub">
          <span>Sesión:</span>
          <strong>{user?.displayName ? `${user.displayName} · ${user.email ?? '—'}` : user?.email ?? '—'}</strong>
          {user?.role ? <span className="pill">{user.role}</span> : null}
        </div>
      </div>

      <div className="row topbarRight" style={{ justifyContent: 'flex-end' }}>
        {rightSlot ?? null}
        {showMenuButton ? (
          <Link className="button secondary" to={menuHref}>
            {menuLabel}
          </Link>
        ) : null}
        <button className="button secondary" onClick={logout}>
          Salir
        </button>
      </div>
    </div>
  )
}
