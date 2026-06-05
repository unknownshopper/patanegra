import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

function tableLabel(tableId: string) {
  if (tableId.startsWith('togo-')) {
    const raw = tableId.replace('togo-', '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
  }
  if (tableId.startsWith('mesa-')) {
    const raw = tableId.replace('mesa-', '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? `Mesa ${n}` : tableId
  }
  const n = Number(tableId)
  if (Number.isFinite(n) && n > 0) return `Mesa ${n}`
  return tableId
}

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

  const [waiterCallTop, setWaiterCallTop] = React.useState<any | null>(null)
  const [waiterCallOpen, setWaiterCallOpen] = React.useState(false)
  const lastWaiterCallIdRef = React.useRef<string>('')

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

  React.useEffect(() => {
    if (!user?.role) {
      setWaiterCallTop(null)
      setWaiterCallOpen(false)
      return
    }

    const key = 'staff:lastSeenWaiterCallId'
    lastWaiterCallIdRef.current = String(localStorage.getItem(key) ?? '')

    const q = query(collection(db, 'waiterCalls'), where('status', '==', 'pending'))
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => {
            const am = a?.createdAt?.toMillis ? a.createdAt.toMillis() : Number(a?.createdAt ?? 0)
            const bm = b?.createdAt?.toMillis ? b.createdAt.toMillis() : Number(b?.createdAt ?? 0)
            return bm - am
          })

        const top = docs[0] ?? null
        if (!top) {
          setWaiterCallTop(null)
          setWaiterCallOpen(false)
          return
        }

        setWaiterCallTop(top)
        if (String(top.id) && String(top.id) !== String(lastWaiterCallIdRef.current)) {
          setWaiterCallOpen(true)
        }
      },
      (err) => {
        console.error('[SessionBar] waiterCalls snapshot error', err)
        setWaiterCallTop(null)
        setWaiterCallOpen(false)
      },
    )
  }, [user?.role])

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
        {waiterCallOpen && waiterCallTop ? (
          <div className="waiterAlert" style={{ cursor: 'pointer' }}>
            <span style={{ fontWeight: 800 }}>Llamando:</span> <span>{tableLabel(String((waiterCallTop as any)?.tableId ?? ''))}</span>
            <button
              className="button"
              style={{ marginLeft: 8, padding: '4px 10px' }}
              onClick={async () => {
                try {
                  if (!user?.uid) return
                  await updateDoc(doc(db, 'waiterCalls', String((waiterCallTop as any)?.id ?? '')), {
                    status: 'acknowledged',
                    ackByUid: user.uid,
                    ackAt: serverTimestamp(),
                  })
                  const key = 'staff:lastSeenWaiterCallId'
                  const id = String((waiterCallTop as any)?.id ?? '')
                  lastWaiterCallIdRef.current = id
                  localStorage.setItem(key, id)
                  setWaiterCallOpen(false)
                } catch {
                  // ignore
                }
              }}
            >
              Atender
            </button>
            <button
              className="button secondary"
              style={{ marginLeft: 6, padding: '4px 10px' }}
              onClick={() => {
                const key = 'staff:lastSeenWaiterCallId'
                const id = String((waiterCallTop as any)?.id ?? '')
                lastWaiterCallIdRef.current = id
                localStorage.setItem(key, id)
                setWaiterCallOpen(false)
              }}
            >
              Ocultar
            </button>
          </div>
        ) : null}
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
