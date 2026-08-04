import React from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../firebase'

type ClosingSummary = {
  salesCount?: number
  sum?: number
  discountTotal?: number
  byMethod?: {
    efectivo?: number
    terminal?: number
    transferencia?: number
  }
}

type ClosingDoc = {
  id: string
  dayKey?: string
  createdAtMs?: number
  createdByName?: string | null
  summary?: ClosingSummary
}

function money(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)
}

export default function OwnerPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [latest, setLatest] = React.useState<ClosingDoc | null>(null)

  React.useEffect(() => {
    document.title = 'Patanegra · Owner'
  }, [])

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)

    ;(async () => {
      try {
        const qy = query(
          collection(db, 'opsClosings'),
          orderBy('dayKey', 'desc'),
          limit(1),
        )
        const snap = await getDocs(qy)
        if (!alive) return
        const first = snap.docs[0]
        setLatest(first ? ({ id: first.id, ...(first.data() as any) } as any) : null)
      } catch {
        if (!alive) return
        setLatest(null)
        setMsg('No se pudo cargar el último cierre.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const sum = Number(latest?.summary?.sum ?? 0)
  const salesCount = Number(latest?.summary?.salesCount ?? 0)
  const efectivo = Number(latest?.summary?.byMethod?.efectivo ?? 0)
  const terminal = Number(latest?.summary?.byMethod?.terminal ?? 0)
  const transferencia = Number(latest?.summary?.byMethod?.transferencia ?? 0)
  const discountTotal = Number(latest?.summary?.discountTotal ?? 0)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0f19',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          minHeight: '100vh',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await logout()
              } finally {
                navigate('/login')
              }
            }}
          >
            Salir
          </button>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Dashboard</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Owner · Móvil</div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
          {loading ? <div style={{ opacity: 0.85 }}>Cargando…</div> : null}
          {msg ? <div style={{ opacity: 0.9 }}>{msg}</div> : null}
          {!loading && !latest ? <div style={{ opacity: 0.85 }}>Sin cierres recientes.</div> : null}

          {latest ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ opacity: 0.85, fontSize: 12 }}>Último cierre</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 950, fontSize: 16 }}>{String(latest.dayKey ?? latest.id)}</div>
                <div style={{ fontWeight: 950, fontSize: 22 }}>{money(sum)}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ opacity: 0.85, fontSize: 12 }}>Ventas</div>
                <div style={{ fontWeight: 900 }}>{String(salesCount)}</div>
              </div>

              <div style={{ height: 1, background: '#1f2937' }} />

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>Efectivo</div>
                  <div style={{ fontWeight: 900 }}>{money(efectivo)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>Tarjeta</div>
                  <div style={{ fontWeight: 900 }}>{money(terminal)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>Transferencia</div>
                  <div style={{ fontWeight: 900 }}>{money(transferencia)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>Descuentos (-)</div>
                  <div style={{ fontWeight: 900 }}>-{money(discountTotal)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <Link
                  to={`/cierre?d=${encodeURIComponent(String(latest.dayKey ?? latest.id))}&m=day`}
                  className="button"
                  style={{ textDecoration: 'none', textAlign: 'center' }}
                >
                  Ver cierre
                </Link>
                <Link to="/cierres" className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                  Ver lista de cierres
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ opacity: 0.7, fontSize: 11, textAlign: 'center' }}>Jornada: 11:00–04:00</div>
      </div>
    </div>
  )
}
