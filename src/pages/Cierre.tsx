import React from 'react'
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'

type ClosingSummary = {
  salesCount: number
  sum: number
  discountTotal: number
  byMethod: {
    efectivo: number
    propinaEfectivo: number
    terminal: number
    propinaTerminal: number
    transferencia: number
    propinaTransferencia: number
    cortesia: number
    legacy: number
  }
  dough: { cm30: number; cm20: number }
}

type ClosingDoc = {
  id: string
  dayKey: string
  createdAtMs?: number
  createdByName?: string | null
  summary?: ClosingSummary
}

function Row({
  label,
  value,
  strong,
  border,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
  border?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: border === false ? undefined : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ opacity: 0.92, fontSize: 15, fontWeight: 800 }}>{label}</div>
      <div style={{ fontWeight: strong ? 950 : 900, fontSize: strong ? 18 : 17 }}>{value}</div>
    </div>
  )
}

function SubRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0 10px 0',
        borderBottom: '1px solid #1f2937',
      }}
    >
      <div style={{ opacity: 0.78, fontSize: 14, fontWeight: 800 }}>{label}</div>
      <div style={{ fontWeight: 850, fontSize: 16 }}>{value}</div>
    </div>
  )
}

function PaymentBlock({
  label,
  value,
  tipValue,
}: {
  label: string
  value: React.ReactNode
  tipValue: React.ReactNode
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ opacity: 0.92, fontSize: 15, fontWeight: 800 }}>{label}</div>
        <div style={{ fontWeight: 900, fontSize: 17 }}>{value}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6, paddingLeft: 12 }}>
        <div style={{ opacity: 0.75, fontSize: 14, fontWeight: 800 }}>+ Propina</div>
        <div style={{ fontWeight: 850, fontSize: 16, opacity: 0.95 }}>{tipValue}</div>
      </div>
    </div>
  )
}

function CourtesyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 0 0 0', opacity: 0.68, fontSize: 12.5, fontWeight: 750, lineHeight: 1.25 }}>
      {children}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 950, opacity: 0.9, marginBottom: 10, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </div>
  )
}

function dayKeyFromDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function money(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)
}

function clampDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

export default function CierrePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const viewMode = ((): 'day' | 'week' | 'month' => {
    const m = String(searchParams.get('m') ?? '').toLowerCase()
    if (m === 'week' || m === 'semana') return 'week'
    if (m === 'month' || m === 'mes') return 'month'
    return 'day'
  })()

  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState<string | null>(null)

  const [closings, setClosings] = React.useState<ClosingDoc[]>([])

  const todayKey = dayKeyFromDate(new Date())
  const selectedDayKey = String(searchParams.get('d') ?? '').trim() || todayKey

  React.useEffect(() => {
    document.title = 'Patanegra · Cierre'
  }, [])

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)

    ;(async () => {
      try {
        const sinceMs = Date.now() - 120 * 24 * 60 * 60 * 1000
        const qy = query(collection(db, 'opsClosings'), where('createdAtMs', '>=', sinceMs), orderBy('createdAtMs', 'desc'))
        const snap = await getDocs(qy)
        if (!alive) return
        setClosings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
      } catch {
        if (!alive) return
        setClosings([])
        setMsg('No se pudo cargar cierres. Revisa conexión o permisos.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const selectedClosing = React.useMemo(() => {
    return closings.find((c) => String(c.dayKey) === selectedDayKey) ?? null
  }, [closings, selectedDayKey])

  const dayIndex = React.useMemo(() => {
    const sorted = [...closings]
      .filter((c) => c?.dayKey)
      .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)))
    const idx = sorted.findIndex((c) => String(c.dayKey) === selectedDayKey)
    return { sorted, idx }
  }, [closings, selectedDayKey])

  const aggregated = React.useMemo(() => {
    const base = selectedClosing?.summary
    if (viewMode === 'day') return base

    const d = clampDate(new Date(`${selectedDayKey}T00:00:00`))
    const start =
      viewMode === 'week'
        ? (() => {
            const w = new Date(d)
            const day = w.getDay()
            const diff = (day + 6) % 7
            w.setDate(w.getDate() - diff)
            return w
          })()
        : new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)

    const end =
      viewMode === 'week'
        ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
        : new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0)

    const startKey = dayKeyFromDate(start)
    const endKey = dayKeyFromDate(new Date(end.getTime() - 1))

    const rows = closings
      .filter((c) => {
        const k = String(c.dayKey ?? '')
        return k >= startKey && k <= endKey
      })
      .map((c) => c.summary)
      .filter(Boolean) as ClosingSummary[]

    const sumByMethod = {
      efectivo: 0,
      propinaEfectivo: 0,
      terminal: 0,
      propinaTerminal: 0,
      transferencia: 0,
      propinaTransferencia: 0,
      cortesia: 0,
      legacy: 0,
    }

    let salesCount = 0
    let sum = 0
    let discountTotal = 0
    let cm20 = 0
    let cm30 = 0

    for (const r of rows) {
      salesCount += Number(r.salesCount ?? 0)
      sum += Number(r.sum ?? 0)
      discountTotal += Number(r.discountTotal ?? 0)
      cm20 += Number(r.dough?.cm20 ?? 0)
      cm30 += Number(r.dough?.cm30 ?? 0)

      sumByMethod.efectivo += Number(r.byMethod?.efectivo ?? 0)
      sumByMethod.propinaEfectivo += Number(r.byMethod?.propinaEfectivo ?? 0)
      sumByMethod.terminal += Number(r.byMethod?.terminal ?? 0)
      sumByMethod.propinaTerminal += Number(r.byMethod?.propinaTerminal ?? 0)
      sumByMethod.transferencia += Number(r.byMethod?.transferencia ?? 0)
      sumByMethod.propinaTransferencia += Number(r.byMethod?.propinaTransferencia ?? 0)
      sumByMethod.cortesia += Number(r.byMethod?.cortesia ?? 0)
      sumByMethod.legacy += Number(r.byMethod?.legacy ?? 0)
    }

    return {
      salesCount,
      sum: Math.round(sum * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      byMethod: sumByMethod,
      dough: { cm20, cm30 },
    } satisfies ClosingSummary
  }, [closings, selectedClosing?.summary, selectedDayKey, viewMode])

  const titleLabel = React.useMemo(() => {
    const d = new Date(`${selectedDayKey}T00:00:00`)
    const locale = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit' })
    const mode = viewMode === 'day' ? 'Día' : viewMode === 'week' ? 'Semana' : 'Mes'
    return `${mode} · ${locale}`
  }, [selectedDayKey, viewMode])

  const gotoDay = React.useCallback(
    (nextDayKey: string) => {
      const sp = new URLSearchParams(searchParams)
      sp.set('d', nextDayKey)
      sp.set('m', viewMode)
      navigate(`/cierre?${sp.toString()}`)
    },
    [navigate, searchParams, viewMode],
  )

  const gotoMode = React.useCallback(
    (m: 'day' | 'week' | 'month') => {
      const sp = new URLSearchParams(searchParams)
      sp.set('d', selectedDayKey)
      sp.set('m', m)
      navigate(`/cierre?${sp.toString()}`)
    },
    [navigate, searchParams, selectedDayKey],
  )

  const prevNext = React.useMemo(() => {
    const { sorted, idx } = dayIndex
    const prev = idx > 0 ? sorted[idx - 1] : null
    const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null
    return { prev, next }
  }, [dayIndex])

  const s = aggregated

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1200px 700px at 50% -10%, #1f2937 0%, #0b0f19 55%, #070a12 100%)',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          minHeight: '100vh',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            className="button secondary"
            disabled={!prevNext.prev}
            onClick={() => prevNext.prev && gotoDay(String(prevNext.prev.dayKey))}
            style={{ minWidth: 56, minHeight: 44, fontSize: 20, fontWeight: 900, borderRadius: 12 }}
          >
            {'<'}
          </button>

          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontWeight: 950, fontSize: 20, letterSpacing: 0.2 }}>{titleLabel}</div>
            <div style={{ opacity: 0.85, fontSize: 14, fontWeight: 700 }}>{selectedClosing?.createdByName ? `Cerró: ${selectedClosing.createdByName}` : ''}</div>
          </div>

          <button
            className="button secondary"
            disabled={!prevNext.next}
            onClick={() => prevNext.next && gotoDay(String(prevNext.next.dayKey))}
            style={{ minWidth: 56, minHeight: 44, fontSize: 20, fontWeight: 900, borderRadius: 12 }}
          >
            {'>'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            className="button secondary"
            style={{ opacity: viewMode === 'day' ? 1 : 0.72, minHeight: 44, fontSize: 16, fontWeight: 900, borderRadius: 12, padding: '10px 14px' }}
            onClick={() => gotoMode('day')}
          >
            Día
          </button>
          <button
            className="button secondary"
            style={{ opacity: viewMode === 'week' ? 1 : 0.72, minHeight: 44, fontSize: 16, fontWeight: 900, borderRadius: 12, padding: '10px 14px' }}
            onClick={() => gotoMode('week')}
          >
            Semana
          </button>
          <button
            className="button secondary"
            style={{ opacity: viewMode === 'month' ? 1 : 0.72, minHeight: 44, fontSize: 16, fontWeight: 900, borderRadius: 12, padding: '10px 14px' }}
            onClick={() => gotoMode('month')}
          >
            Mes
          </button>
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(17,24,39,0.95) 0%, rgba(11,15,25,0.92) 100%)',
            border: '1px solid #273244',
            boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
            borderRadius: 18,
            padding: 16,
          }}
        >
          {loading ? <div style={{ opacity: 0.9, fontSize: 16, fontWeight: 800 }}>Cargando…</div> : null}
          {msg ? <div style={{ opacity: 0.95, fontSize: 16, fontWeight: 800 }}>{msg}</div> : null}
          {!loading && !s ? <div style={{ opacity: 0.9, fontSize: 16, fontWeight: 800 }}>Sin cierre disponible para este día.</div> : null}

          {s ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingBottom: 12,
                  borderBottom: '1px solid #273244',
                }}
              >
                <div style={{ opacity: 0.9, fontSize: 16, fontWeight: 850 }}>Total</div>
                <div style={{ fontWeight: 950, fontSize: 32, letterSpacing: 0.2 }}>{money(s.sum)}</div>
              </div>

              <SectionCard title="Ventas">
                <Row label="Tickets" value={String(s.salesCount)} border={false} />
              </SectionCard>

              <SectionCard title="Pagos">
                <PaymentBlock label="Efectivo" value={money(s.byMethod.efectivo)} tipValue={money(s.byMethod.propinaEfectivo)} />
                <PaymentBlock label="Tarjeta" value={money(s.byMethod.terminal)} tipValue={money(s.byMethod.propinaTerminal)} />
                <PaymentBlock label="Transferencia" value={money(s.byMethod.transferencia)} tipValue={money(s.byMethod.propinaTransferencia)} />
              </SectionCard>

              <SectionCard title="Ajustes">
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ opacity: 0.92, fontSize: 15, fontWeight: 800 }}>Cortesía</div>
                    <div style={{ fontWeight: 900, fontSize: 17 }}>{money(s.byMethod.cortesia)}</div>
                  </div>
                  <CourtesyNote>Impacta costos/finanzas (no es ingreso).</CourtesyNote>
                </div>
                <Row label="- Descuentos" value={money(s.discountTotal)} />
                <Row label="Sin método" value={money(s.byMethod.legacy)} border={false} />
              </SectionCard>

              <SectionCard title="Producción">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.18)', borderRadius: 18, padding: 14 }}>
                    <div style={{ opacity: 0.9, fontSize: 14, fontWeight: 900 }}>Masas 30</div>
                    <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{String(s.dough.cm30)}</div>
                  </div>
                  <div style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', borderRadius: 18, padding: 14 }}>
                    <div style={{ opacity: 0.9, fontSize: 14, fontWeight: 900 }}>Masas 20</div>
                    <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{String(s.dough.cm20)}</div>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ opacity: 0.78, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>Vista exclusiva · Cierre de caja</div>
      </div>
    </div>
  )
}
