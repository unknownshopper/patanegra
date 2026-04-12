import React from 'react'
import SessionBar from '../components/SessionBar'
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

type SupplyUnit = 'g' | 'kg' | 'ml' | 'lt' | 'pza'

type Supply = {
  id: string
  name: string
  unit: SupplyUnit
  stock: number
  minStock: number
  packSize?: number
  packUnit?: SupplyUnit
  isActive: boolean
}

const seedSupplies: Array<Omit<Supply, 'id'>> = [
  { name: 'Harina de trigo', unit: 'kg', stock: 0, minStock: 10, packSize: 25, packUnit: 'kg', isActive: true },
  { name: 'Harina 00', unit: 'kg', stock: 0, minStock: 5, packSize: 25, packUnit: 'kg', isActive: true },
  { name: 'Levadura seca', unit: 'g', stock: 0, minStock: 500, packSize: 500, packUnit: 'g', isActive: true },
  { name: 'Sal', unit: 'kg', stock: 0, minStock: 3, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Azúcar', unit: 'kg', stock: 0, minStock: 3, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Aceite de oliva', unit: 'lt', stock: 0, minStock: 6, packSize: 1, packUnit: 'lt', isActive: true },
  { name: 'Aceite vegetal', unit: 'lt', stock: 0, minStock: 6, packSize: 1, packUnit: 'lt', isActive: true },
  { name: 'Tomate triturado', unit: 'kg', stock: 0, minStock: 10, packSize: 3, packUnit: 'kg', isActive: true },
  { name: 'Puré / Salsa de tomate', unit: 'kg', stock: 0, minStock: 6, packSize: 3, packUnit: 'kg', isActive: true },
  { name: 'Queso mozzarella', unit: 'kg', stock: 0, minStock: 8, packSize: 2, packUnit: 'kg', isActive: true },
  { name: 'Queso parmesano', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Jamón', unit: 'kg', stock: 0, minStock: 3, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Pepperoni', unit: 'kg', stock: 0, minStock: 3, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Tocino', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Chorizo', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Champiñón', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Cebolla', unit: 'kg', stock: 0, minStock: 3, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Pimiento morrón', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Piña', unit: 'kg', stock: 0, minStock: 2, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Aceituna', unit: 'kg', stock: 0, minStock: 1, packSize: 1, packUnit: 'kg', isActive: true },
  { name: 'Orégano', unit: 'g', stock: 0, minStock: 300, packSize: 300, packUnit: 'g', isActive: true },
  { name: 'Chile quebrado', unit: 'g', stock: 0, minStock: 300, packSize: 300, packUnit: 'g', isActive: true },
  { name: 'Cajas pizza 20cm', unit: 'pza', stock: 0, minStock: 100, packSize: 50, packUnit: 'pza', isActive: true },
  { name: 'Cajas pizza 30cm', unit: 'pza', stock: 0, minStock: 100, packSize: 50, packUnit: 'pza', isActive: true },
  { name: 'Servilletas', unit: 'pza', stock: 0, minStock: 500, packSize: 500, packUnit: 'pza', isActive: true },
]

function stepForUnit(u: SupplyUnit) {
  if (u === 'pza') return 1
  if (u === 'kg' || u === 'lt') return 0.25
  return 50
}

function roundForUnit(n: number, u: SupplyUnit) {
  if (u === 'kg' || u === 'lt') return Math.round(n * 100) / 100
  return Math.round(n)
}

export default function AlmacenPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [supplies, setSupplies] = React.useState<Supply[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    const title = 'Patanegra · Almacén'
    const desc = 'Panel de almacén (inventario). Solo personal autorizado.'
    document.title = title

    const ensureMeta = (key: 'name' | 'property', value: string) => {
      const selector = key === 'name' ? `meta[name="${value}"]` : `meta[property="${value}"]`
      let el = document.head.querySelector(selector) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(key, value)
        document.head.appendChild(el)
      }
      return el
    }

    ensureMeta('name', 'description').setAttribute('content', desc)
    ensureMeta('name', 'robots').setAttribute('content', 'noindex, nofollow')
    ensureMeta('property', 'og:title').setAttribute('content', title)
    ensureMeta('property', 'og:description').setAttribute('content', desc)
  }, [])

  const backUrl = location.state?.from || '/admin'

  const [editStock, setEditStock] = React.useState<Record<string, string>>({})
  const [editMin, setEditMin] = React.useState<Record<string, string>>({})

  const [name, setName] = React.useState('')
  const [unit, setUnit] = React.useState<SupplyUnit>('kg')
  const [stock, setStock] = React.useState('0')
  const [minStock, setMinStock] = React.useState('0')
  const [packSize, setPackSize] = React.useState('')
  const [packUnit, setPackUnit] = React.useState<SupplyUnit>('kg')

  const canAdmin = user?.role === 'admin'
  const canAlmacen = user?.role === 'almacen'
  const isGerente = user?.role === 'gerente'
  const canEditMin = canAdmin
  const canIncStock = canAdmin || canAlmacen
  const canDecStock = canAdmin
  const canCreateSupply = canAdmin

  React.useEffect(() => {
    const q = query(collection(db, 'supplies'), orderBy('name', 'asc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: Supply[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setSupplies(data)
        setEditStock((prev) => {
          const next = { ...prev }
          for (const s of data) {
            if (next[s.id] == null) next[s.id] = String(Number(s.stock ?? 0))
          }
          return next
        })
        setEditMin((prev) => {
          const next = { ...prev }
          for (const s of data) {
            if (next[s.id] == null) next[s.id] = String(Number(s.minStock ?? 0))
          }
          return next
        })
      },
      () => {
        setSupplies([])
      },
    )
  }, [])

  return (
    <div className="container">
      <SessionBar
        title="Almacén"
        showMenuButton={false}
        rightSlot={
          canAdmin ? (
            <>
              <Link className="button secondary" to="/admin?v=dashboard" style={{ borderColor: '#e5e7eb' }}>
                Dashboard
              </Link>
              <Link className="button secondary" to="/admin?v=mesas" style={{ borderColor: '#e5e7eb' }}>
                Mesas
              </Link>
              <Link className="button secondary" to="/caja?v=dashboard" style={{ borderColor: '#e5e7eb' }}>
                Caja
              </Link>
              <Link className="button secondary" to="/admin?v=report" style={{ borderColor: '#e5e7eb' }}>
                Reporte
              </Link>
              <Link className="button secondary" to="/almacen" style={{ borderColor: '#111827' }}>
                Almacén
              </Link>
              <Link className="button secondary" to="/menu-config" style={{ borderColor: '#e5e7eb' }}>
                Menú (Config)
              </Link>
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            </>
          ) : isGerente ? (
            <>
              <Link className="button secondary" to="/caja?v=dashboard" style={{ borderColor: '#e5e7eb' }}>
                Dashboard
              </Link>
              <Link className="button secondary" to="/caja?v=report" style={{ borderColor: '#e5e7eb' }}>
                Reporte
              </Link>
              <Link className="button secondary" to="/almacen" style={{ borderColor: '#111827' }}>
                Almacén
              </Link>
              <Link className="button secondary" to="/menu-config" style={{ borderColor: '#e5e7eb' }}>
                Menú (Config)
              </Link>
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            </>
          ) : (
            <Link className="button secondary" to="/menu">
              Menú
            </Link>
          )
        }
      />
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 900 }}>Inventario</div>
            <div className="muted" style={{ fontSize: 12 }}>Insumos (fino): unidad, stock, mínimo, gramaje/paquete.</div>
          </div>

          {canAdmin ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setMsg(null)
                setBusy(true)
                try {
                  const batch = writeBatch(db)
                  const col = collection(db, 'supplies')
                  for (const s of seedSupplies) {
                    const ref = doc(col)
                    batch.set(ref, { ...s, createdAt: serverTimestamp() })
                  }
                  await batch.commit()
                  setMsg('Catálogo básico agregado.')
                } catch (e: any) {
                  const code = String(e?.code ?? '')
                  const message = String(e?.message ?? '')
                  console.error('Seed supplies failed', e)
                  setMsg(`No se pudo agregar el catálogo. ${code ? `(${code}) ` : ''}${message}`.trim())
                } finally {
                  setBusy(false)
                }
              }}
            >
              Cargar catálogo básico
            </button>
          ) : null}
        </div>

        {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}

        <div style={{ height: 12 }} />

        {canCreateSupply ? (
          <div className="card" style={{ margin: 0 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Agregar insumo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
              <input className="input" placeholder="Nombre (ej. Mozzarella)" value={name} onChange={(e) => setName(e.target.value)} />

              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as SupplyUnit)}>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="lt">lt</option>
                <option value="pza">pza</option>
              </select>

              <input className="input" inputMode="decimal" placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} />
              <input className="input" inputMode="decimal" placeholder="Mínimo" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <input className="input" inputMode="decimal" placeholder="Gramaje/paquete (opcional)" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
              <select className="input" value={packUnit} onChange={(e) => setPackUnit(e.target.value as SupplyUnit)}>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="lt">lt</option>
                <option value="pza">pza</option>
              </select>
              <button
                className="button"
                disabled={busy || !name.trim()}
                onClick={async () => {
                  setMsg(null)
                  setBusy(true)
                  try {
                    const s = {
                      name: name.trim(),
                      unit,
                      stock: Number(stock || 0),
                      minStock: Number(minStock || 0),
                      packSize: packSize.trim() ? Number(packSize) : null,
                      packUnit: packSize.trim() ? packUnit : null,
                      isActive: true,
                      createdAt: serverTimestamp(),
                    }
                    await addDoc(collection(db, 'supplies'), s)
                    setName('')
                    setStock('0')
                    setMinStock('0')
                    setPackSize('')
                    setMsg('Insumo agregado.')
                  } catch (e: any) {
                    const code = String(e?.code ?? '')
                    const message = String(e?.message ?? '')
                    console.error('Add supply failed', e)
                    setMsg(`No se pudo agregar el insumo. ${code ? `(${code}) ` : ''}${message}`.trim())
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gap: 10 }}>
          {supplies.length === 0 ? <div className="muted">Sin insumos aún. Puedes cargar el catálogo básico o agregar manualmente.</div> : null}
          {supplies.map((s) => {
            const stockN = Number(s.stock ?? 0)
            const minN = Number(s.minStock ?? 0)
            const fullThreshold = minN > 0 ? minN * 2 : 1
            const status: 'agotado' | 'bajo' | 'normal' | 'full' =
              stockN <= 0 ? 'agotado' : stockN < minN ? 'bajo' : stockN >= fullThreshold ? 'full' : 'normal'

            const badge =
              status === 'agotado'
                ? { text: 'AGOTADO', bg: '#dc2626', fg: '#ffffff', border: 'rgba(220, 38, 38, 0.35)' }
                : status === 'bajo'
                  ? { text: 'BAJO', bg: '#f59e0b', fg: '#111827', border: 'rgba(245, 158, 11, 0.35)' }
                  : status === 'full'
                    ? { text: 'FULL', bg: '#16a34a', fg: '#ffffff', border: 'rgba(22, 163, 74, 0.35)' }
                    : { text: 'NORMAL', bg: '#e5e7eb', fg: '#111827', border: 'rgba(17, 24, 39, 0.10)' }

            return (
              <div key={s.id} className="card" style={{ margin: 0, padding: 12, borderColor: badge.border }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Stock: <strong style={{ color: '#111827' }}>{stockN}</strong> {s.unit} · Mínimo: <strong style={{ color: '#111827' }}>{minN}</strong>
                      {s.packSize ? ` · Paquete: ${Number(s.packSize)} ${s.packUnit ?? ''}` : ''}
                    </div>

                  </div>

                  <div style={{ height: 10 }} />

                  <div className="row" style={{ gap: 10, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Stock ({s.unit})</div>
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
                        <button
                          className="qtyBtn"
                          disabled={!canDecStock}
                          onClick={async () => {
                            const step = stepForUnit(s.unit)
                            const cur = Number(editStock[s.id] ?? stockN)
                            const next = Math.max(0, roundForUnit(cur - step, s.unit))
                            setEditStock((p) => ({ ...p, [s.id]: String(next) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { stock: next, updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update stock failed', e)
                            }
                          }}
                        >
                          −
                        </button>
                        <input
                          className="input"
                          style={{ width: 120 }}
                          type="number"
                          inputMode="decimal"
                          step={stepForUnit(s.unit)}
                          value={editStock[s.id] ?? String(stockN)}
                          onChange={(e) => setEditStock((p) => ({ ...p, [s.id]: e.target.value }))}
                          onBlur={async () => {
                            if (!canIncStock) return
                            const raw = String(editStock[s.id] ?? '')
                            const n = roundForUnit(Number(raw || 0), s.unit)
                            const safe = canDecStock ? Math.max(0, n) : Math.max(stockN, n)
                            setEditStock((p) => ({ ...p, [s.id]: String(safe) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { stock: safe, updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update stock failed', e)
                            }
                          }}
                          disabled={!canIncStock}
                        />
                        <button
                          className="qtyBtn"
                          disabled={!canIncStock}
                          onClick={async () => {
                            const step = stepForUnit(s.unit)
                            const cur = Number(editStock[s.id] ?? stockN)
                            const next = roundForUnit(cur + step, s.unit)
                            setEditStock((p) => ({ ...p, [s.id]: String(next) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { stock: next, updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update stock failed', e)
                            }
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Mínimo</div>
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
                        <button
                          className="qtyBtn"
                          disabled={!canEditMin}
                          onClick={async () => {
                            const step = stepForUnit(s.unit)
                            const cur = Number(editMin[s.id] ?? minN)
                            const next = Math.max(0, roundForUnit(cur - step, s.unit))
                            setEditMin((p) => ({ ...p, [s.id]: String(next) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { minStock: next, updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update min failed', e)
                            }
                          }}
                        >
                          −
                        </button>
                        <input
                          className="input"
                          style={{ width: 120 }}
                          type="number"
                          inputMode="decimal"
                          step={stepForUnit(s.unit)}
                          value={editMin[s.id] ?? String(minN)}
                          onChange={(e) => setEditMin((p) => ({ ...p, [s.id]: e.target.value }))}
                          onBlur={async () => {
                            if (!canEditMin) return
                            const raw = String(editMin[s.id] ?? '')
                            const n = roundForUnit(Number(raw || 0), s.unit)
                            setEditMin((p) => ({ ...p, [s.id]: String(n) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { minStock: Math.max(0, n), updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update min failed', e)
                            }
                          }}
                          disabled={!canEditMin}
                        />
                        <button
                          className="qtyBtn"
                          disabled={!canEditMin}
                          onClick={async () => {
                            const step = stepForUnit(s.unit)
                            const cur = Number(editMin[s.id] ?? minN)
                            const next = roundForUnit(cur + step, s.unit)
                            setEditMin((p) => ({ ...p, [s.id]: String(next) }))
                            try {
                              await updateDoc(doc(db, 'supplies', s.id), { minStock: next, updatedAt: serverTimestamp() })
                            } catch (e) {
                              console.error('Update min failed', e)
                            }
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontWeight: 950,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    background: badge.bg,
                    color: badge.fg,
                    border: '2px solid rgba(0,0,0,0.08)',
                  }}
                >
                  {badge.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
