import React from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import { db } from '../firebase'

type ClosingSummary = {
  salesCount?: number
  sum?: number
  discountTotal?: number
  byMethod?: any
  dough?: any
}

type ClosingRow = {
  id: string
  dayKey?: string
  createdAtMs?: number
  createdByName?: string | null
  summary?: ClosingSummary
}

function money(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)
}

function printHtml({ title, body }: { title: string; body: string }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 18px; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 6px 0; }
    .muted { color: #6b7280; font-size: 12px; }
    .grid { display: grid; gap: 12px; margin-top: 14px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
    .cardTitle { font-weight: 900; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-weight: 800; }
    .val { font-weight: 900; }
    .sub { padding-left: 14px; opacity: 0.9; }
    .big { font-size: 22px; font-weight: 950; }
    .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pill { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

function RowKV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
      <div className="muted" style={{ fontWeight: 800 }}>{label}</div>
      <div style={{ fontWeight: 950 }}>{value}</div>
    </div>
  )
}

function SubRowKV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '6px 0 10px 14px',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 14 }}>{value}</div>
    </div>
  )
}

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ fontWeight: 950, marginBottom: 8 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

export default function CierresPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<ClosingRow[]>([])
  const [openKey, setOpenKey] = React.useState<string | null>(null)

  const q = String(searchParams.get('q') ?? '').trim()

  React.useEffect(() => {
    document.title = 'Patanegra · Cierres'
  }, [])

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(null)

    ;(async () => {
      try {
        const qy = query(collection(db, 'opsClosings'), orderBy('dayKey', 'desc'), limit(300))
        const snap = await getDocs(qy)
        if (!alive) return
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
      } catch {
        if (!alive) return
        setRows([])
        setMsg('No se pudo cargar la lista de cierres.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const filtered = React.useMemo(() => {
    if (!q) return rows
    const qq = q.toLowerCase()
    return rows.filter((r) => {
      const dayKey = String(r.dayKey ?? r.id ?? '').toLowerCase()
      const by = String(r.createdByName ?? '').toLowerCase()
      return dayKey.includes(qq) || by.includes(qq)
    })
  }, [q, rows])

  const printDay = React.useCallback(
    (row: ClosingRow) => {
      const dayKey = String(row.dayKey ?? row.id)
      const by = row.createdByName ? String(row.createdByName) : '—'
      const sum = Number(row.summary?.sum ?? 0)
      const salesCount = Number(row.summary?.salesCount ?? 0)

      const efectivo = Number((row.summary as any)?.byMethod?.efectivo ?? 0)
      const propinaEfectivo = Number((row.summary as any)?.byMethod?.propinaEfectivo ?? 0)
      const terminal = Number((row.summary as any)?.byMethod?.terminal ?? 0)
      const propinaTerminal = Number((row.summary as any)?.byMethod?.propinaTerminal ?? 0)
      const transferencia = Number((row.summary as any)?.byMethod?.transferencia ?? 0)
      const propinaTransferencia = Number((row.summary as any)?.byMethod?.propinaTransferencia ?? 0)
      const cortesia = Number((row.summary as any)?.byMethod?.cortesia ?? 0)
      const legacy = Number((row.summary as any)?.byMethod?.legacy ?? 0)
      const discountTotal = Number(row.summary?.discountTotal ?? 0)
      const cm30 = Number((row.summary as any)?.dough?.cm30 ?? 0)
      const cm20 = Number((row.summary as any)?.dough?.cm20 ?? 0)

      const body = `
<h1>Cierre de caja · ${dayKey}</h1>
<div class="muted">Cerró: ${by}</div>
<div class="grid">
  <div class="card">
    <div class="cardTitle">Resumen</div>
    <div class="row"><div class="label">Total</div><div class="val big">${money(sum)}</div></div>
    <div class="row"><div class="label">Tickets</div><div class="val">${String(salesCount)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Pagos</div>
    <div class="row"><div class="label">Efectivo</div><div class="val">${money(efectivo)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${money(propinaEfectivo)}</div></div>
    <div class="row"><div class="label">Tarjeta</div><div class="val">${money(terminal)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${money(propinaTerminal)}</div></div>
    <div class="row"><div class="label">Transferencia</div><div class="val">${money(transferencia)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${money(propinaTransferencia)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Ajustes</div>
    <div class="row"><div class="label">Cortesía</div><div class="val">${money(cortesia)}</div></div>
    <div class="muted" style="margin-top: 4px;">Impacta costos/finanzas (no es ingreso).</div>
    <div style="height: 10px"></div>
    <div class="row"><div class="label">- Descuentos</div><div class="val">${money(discountTotal)}</div></div>
    <div class="row"><div class="label">Sin método</div><div class="val">${money(legacy)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Masas</div>
    <div class="twocol">
      <div class="pill"><div class="muted">30</div><div class="big">${String(cm30)}</div></div>
      <div class="pill"><div class="muted">20</div><div class="big">${String(cm20)}</div></div>
    </div>
  </div>
</div>
`

      const w = window.open('', '_blank', 'noopener,noreferrer')
      if (!w) return
      w.document.open()
      w.document.write(printHtml({ title: `Cierre ${dayKey}`, body }))
      w.document.close()
      w.focus()
      w.print()
    },
    [money],
  )

  return (
    <div className="container" style={{ paddingTop: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Cierres de caja</div>
          <div className="muted" style={{ fontSize: 12 }}>Listado de cierres guardados en Firestore.</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ margin: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900 }}>Buscar</div>
          <input
            className="input"
            style={{ minWidth: 260 }}
            placeholder="YYYY-MM-DD o usuario"
            value={q}
            onChange={(e) => {
              const sp = new URLSearchParams(searchParams)
              const v = String(e.target.value ?? '')
              if (v.trim()) sp.set('q', v)
              else sp.delete('q')
              setSearchParams(sp)
            }}
          />
        </div>

        <div style={{ height: 10 }} />

        {loading ? <div className="muted">Cargando…</div> : null}
        {msg ? <div className="muted">{msg}</div> : null}

        {!loading ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.length === 0 ? <div className="muted">Sin cierres.</div> : null}
            {filtered.map((r) => {
              const dayKey = String(r.dayKey ?? r.id)
              const sum = Number(r.summary?.sum ?? 0)
              const salesCount = Number(r.summary?.salesCount ?? 0)
              const by = r.createdByName ? String(r.createdByName) : '—'
              const isOpen = openKey === dayKey
              const efectivo = Number((r.summary as any)?.byMethod?.efectivo ?? 0)
              const propinaEfectivo = Number((r.summary as any)?.byMethod?.propinaEfectivo ?? 0)
              const terminal = Number((r.summary as any)?.byMethod?.terminal ?? 0)
              const propinaTerminal = Number((r.summary as any)?.byMethod?.propinaTerminal ?? 0)
              const transferencia = Number((r.summary as any)?.byMethod?.transferencia ?? 0)
              const propinaTransferencia = Number((r.summary as any)?.byMethod?.propinaTransferencia ?? 0)
              const cortesia = Number((r.summary as any)?.byMethod?.cortesia ?? 0)
              const legacy = Number((r.summary as any)?.byMethod?.legacy ?? 0)
              const discountTotal = Number(r.summary?.discountTotal ?? 0)
              const cm30 = Number((r.summary as any)?.dough?.cm30 ?? 0)
              const cm20 = Number((r.summary as any)?.dough?.cm20 ?? 0)

              return (
                <div key={r.id} className="card" style={{ margin: 0 }}>
                  <button
                    className="row"
                    onClick={() => setOpenKey((cur) => (cur === dayKey ? null : dayKey))}
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'baseline',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                    }}
                    aria-expanded={isOpen}
                  >
                    <div>
                      <div style={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{dayKey}</span>
                        <span className="muted" style={{ fontSize: 12, fontWeight: 900 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>Cerró: {by}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 950 }}>{money(sum)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{salesCount} venta(s)</div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <button className="button secondary" onClick={() => printDay(r)}>
                          Imprimir este día
                        </button>
                      </div>

                      <MiniCard title="Pagos">
                        <RowKV label="Efectivo" value={money(efectivo)} />
                        <SubRowKV label="+ Propina" value={money(propinaEfectivo)} />

                        <RowKV label="Tarjeta" value={money(terminal)} />
                        <SubRowKV label="+ Propina" value={money(propinaTerminal)} />

                        <RowKV label="Transferencia" value={money(transferencia)} />
                        <SubRowKV label="+ Propina" value={money(propinaTransferencia)} />

                        <div style={{ paddingTop: 8 }} />
                        <RowKV label="Total" value={money(sum)} />
                      </MiniCard>

                      <MiniCard title="Ajustes">
                        <RowKV label="Cortesía" value={money(cortesia)} />
                        <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.2 }}>
                          Impacta costos/finanzas (no es ingreso).
                        </div>
                        <div style={{ height: 10 }} />
                        <RowKV label="- Descuentos" value={money(discountTotal)} />
                        <RowKV label="Sin método" value={money(legacy)} />
                      </MiniCard>

                      <MiniCard title="Masas">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
                            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>30</div>
                            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 2 }}>{String(cm30)}</div>
                          </div>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
                            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>20</div>
                            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 2 }}>{String(cm20)}</div>
                          </div>
                        </div>
                      </MiniCard>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
