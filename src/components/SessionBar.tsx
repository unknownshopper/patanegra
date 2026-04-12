import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

type Props = {
  title: string
  rightSlot?: React.ReactNode
  showMenuButton?: boolean
  menuHref?: string
  menuLabel?: string
}

export default function SessionBar({ title, rightSlot, showMenuButton = true, menuHref = '/menu', menuLabel = 'Menú' }: Props) {
  const { user, logout } = useAuth()

  return (
    <div className="topbar">
      <div style={{ display: 'grid', gap: 2 }}>
        <div className="topbarTitle">{title}</div>
        <div className="topbarSub">
          <span>Sesión:</span>
          <strong>{user?.displayName ? `${user.displayName} · ${user.email ?? '—'}` : user?.email ?? '—'}</strong>
          {user?.role ? <span className="pill">{user.role}</span> : null}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
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
