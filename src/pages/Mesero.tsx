import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth/AuthProvider'
import SessionBar from '../components/SessionBar'

type WaiterCall = {
  id: string
  tableId: string
  status: 'pending' | 'acknowledged' | 'resolved'
  createdAt?: any
  ackByUid?: string
}

type OrderItem = {
  itemId: string
  name: string
  qty: number
  categoryId?: string
}

type Order = {
  id: string
  tableId: string
  tableLabel?: string
  area: 'kitchen' | 'bar'
  status: 'pending' | 'acknowledged' | 'resolved'
  items?: OrderItem[]
  createdAt?: any
  createdByName?: string
  createdByUid?: string | null
  createdByStaffId?: string | null
}

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

export default function MeseroPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [calls, setCalls] = React.useState<WaiterCall[]>([])
  const [tabs, setTabs] = React.useState<any[]>([])
  const [orders, setOrders] = React.useState<Order[]>([])
  const [expandedTableId, setExpandedTableId] = React.useState<string | null>(null)

  const view = ((): 'menu' | 'pendientes' => {
    const v = String(searchParams.get('v') ?? '').toLowerCase().trim()
    if (v === 'pendientes' || v === 'pending') return 'pendientes'
    return 'menu'
  })()

  React.useEffect(() => {
    const title = 'Patanegra · Mesero'
    const desc = 'Panel de mesero (llamadas y órdenes). Solo personal autorizado.'
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

  React.useEffect(() => {
    const q = query(collection(db, 'waiterCalls'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: WaiterCall[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setCalls(data)
      },
      () => {
        setCalls([])
      },
    )
  }, [])

  React.useEffect(() => {
    const q = query(collection(db, 'tabs'), orderBy('openedAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setTabs(data)
      },
      () => {
        setTabs([])
      },
    )
  }, [])

  React.useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setOrders(data)
      },
      () => {
        setOrders([])
      },
    )
  }, [])

  const pending = calls.filter((c) => c.status === 'pending')
  const topPending = pending[0] ?? null

  const openTabs = tabs.filter((t) => t.status === 'open')
  const openTabByTableId = React.useMemo(() => {
    const m = new Map<string, any>()
    for (const t of openTabs) {
      const tableId = String((t as any)?.tableId ?? '').trim()
      if (!tableId) continue
      m.set(tableId, t)
    }
    return m
  }, [openTabs])
  const myStaffId = String((user as any)?.staffId ?? '').trim()
  const pendingOrders = orders.filter((o) => o.status !== 'resolved')

  const myOpenTabTableIds = React.useMemo(() => {
    const s = new Set<string>()
    for (const t of openTabs) {
      const byUid = String((t as any)?.createdByUid ?? '').trim()
      const byStaff = String((t as any)?.createdByStaffId ?? '').trim()
      if (user?.uid && byUid === user.uid) {
        if (t.tableId) s.add(String(t.tableId))
        continue
      }
      if (myStaffId && byStaff === myStaffId) {
        if (t.tableId) s.add(String(t.tableId))
      }
    }
    return s
  }, [openTabs, user?.uid, myStaffId])

  const myPendingOrders = pendingOrders.filter((o) => {
    if (!user?.uid && !myStaffId) return false

    const byUid = String((o as any)?.createdByUid ?? '').trim()
    const byStaff = String((o as any)?.createdByStaffId ?? '').trim()
    if (user?.uid && byUid === user.uid) return true
    if (myStaffId && byStaff === myStaffId) return true

    const tableId = String((o as any)?.tableId ?? '').trim()
    if (tableId && myOpenTabTableIds.has(tableId)) return true

    return false
  })
  const pendingKitchen = myPendingOrders.filter((o) => o.area === 'kitchen').length
  const pendingBar = myPendingOrders.filter((o) => o.area === 'bar').length

  const takeoutNameByTableId = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const t of openTabs) {
      const tableId = String((t as any)?.tableId ?? '').trim()
      if (!tableId) continue
      if (!tableId.startsWith('togo-')) continue
      const n = String((t as any)?.tabName ?? '').trim()
      if (!n) continue
      m.set(tableId, n)
    }
    return m
  }, [openTabs])

  const tablesFromOrders = React.useMemo(() => {
    const m = new Map<string, { tableId: string; label: string; kitchen: number; bar: number }>()
    for (const o of myPendingOrders) {
      const tableId = o.tableId
      if (!tableId) continue
      const label = o.tableLabel ?? tableLabel(tableId)
      const cur = m.get(tableId) ?? { tableId, label, kitchen: 0, bar: 0 }
      if (o.area === 'kitchen') cur.kitchen += 1
      if (o.area === 'bar') cur.bar += 1
      m.set(tableId, cur)
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [myPendingOrders])

  const activeTableRows = React.useMemo(() => {
    const m = new Map<string, { tableId: string; label: string; source: 'tab' | 'order' }>()
    for (const t of openTabs) {
      if (!t.tableId) continue
      const tableId = String(t.tableId)
      const takeoutName = takeoutNameByTableId.get(tableId) ?? ''
      const label = tableId.startsWith('togo-') && takeoutName ? takeoutName : tableLabel(tableId)
      m.set(tableId, { tableId, label, source: 'tab' })
    }
    for (const r of tablesFromOrders) {
      if (!m.has(r.tableId)) m.set(r.tableId, { tableId: r.tableId, label: r.label, source: 'order' })
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [openTabs, tablesFromOrders, takeoutNameByTableId])

  return (
    <div className="container">
      <SessionBar
        title="Mesero"
        showMenuButton={false}
        rightSlot={
          <>
            {topPending ? <div className="waiterAlert">Llamando: {tableLabel(topPending.tableId)}</div> : null}

            <Link
              className="button secondary"
              to={view === 'pendientes' ? '/mesero' : '/mesero?v=pendientes'}
              style={{ borderColor: '#e5e7eb' }}
            >
              {view === 'pendientes' ? 'Volver' : 'Pendientes'}
            </Link>

            {user?.role === 'admin' ? (
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
                <Link className="button secondary" to="/almacen" style={{ borderColor: '#e5e7eb' }}>
                  Almacén
                </Link>
                <Link className="button secondary" to="/menu-config" style={{ borderColor: '#e5e7eb' }}>
                  Menú (Config)
                </Link>
                <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                  Menú
                </Link>
                <Link className="button secondary" to="/admin?v=report" style={{ borderColor: '#e5e7eb' }}>
                  Reporte
                </Link>
              </>
            ) : user?.role === 'gerente' ? (
              <>
                <Link className="button secondary" to="/caja?v=dashboard" style={{ borderColor: '#e5e7eb' }}>
                  Caja
                </Link>
                <Link className="button secondary" to="/caja?v=report" style={{ borderColor: '#e5e7eb' }}>
                  Reporte
                </Link>
                <Link className="button secondary" to="/almacen" style={{ borderColor: '#e5e7eb' }}>
                  Almacén
                </Link>
                <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                  Menú
                </Link>
              </>
            ) : (
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            )}
          </>
        }
      />
      {view === 'menu' ? (
        <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Mesas activas</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            Órdenes: <strong style={{ color: '#111827' }}>{pendingKitchen}</strong> cocina · <strong style={{ color: '#111827' }}>{pendingBar}</strong> barra
          </div>
        </div>

        <div style={{ height: 12 }} />

        {activeTableRows.length === 0 ? <div className="muted">Sin mesas activas.</div> : null}
        {activeTableRows.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {activeTableRows.slice(0, 20).map((t) => (
              <div key={t.tableId} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{t.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {String(t.tableId).startsWith('togo-') && takeoutNameByTableId.get(String(t.tableId)) ? (
                        <>
                          Para llevar: <strong style={{ color: '#111827' }}>{String(t.tableId)}</strong>
                        </>
                      ) : (
                        <>{t.source === 'tab' ? 'Cuenta abierta' : 'Con comanda pendiente'}</>
                      )}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {t.source === 'tab' ? (
                      <button
                        className="button secondary"
                        onClick={async () => {
                          const tab = openTabByTableId.get(String(t.tableId))
                          if (!tab?.id) return
                          try {
                            await updateDoc(doc(db, 'tabs', String(tab.id)), {
                              billRequestedAt: serverTimestamp(),
                              billRequestedByUid: user?.uid ?? null,
                              billRequestedByName: user?.displayName ?? user?.email ?? null,
                              updatedAt: serverTimestamp(),
                            })
                          } catch (e: any) {
                            const msg = String(e?.code ? `${String(e.code)}: ${String(e.message ?? '')}` : e?.message ?? e ?? '')
                            window.alert(msg ? `No se pudo pedir la cuenta: ${msg}` : 'No se pudo pedir la cuenta.')
                          }
                        }}
                      >
                        Pedir cuenta
                      </button>
                    ) : null}
                    <Link className="button secondary" to={`/menu?mesa=${t.tableId}`}>
                      Agregar pedido
                    </Link>
                  </div>
                </div>

                {String(t.tableId).startsWith('togo-') ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {myPendingOrders.filter((o) => String(o.tableId) === String(t.tableId)).length === 0 ? (
                      <div className="muted" style={{ fontSize: 12 }}>Sin órdenes pendientes.</div>
                    ) : (
                      myPendingOrders
                        .filter((o) => String(o.tableId) === String(t.tableId))
                        .map((o) => (
                          <div key={o.id} className="card" style={{ margin: 0, padding: 10 }}>
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <div style={{ fontWeight: 900 }}>{o.area === 'bar' ? 'Barra' : 'Cocina'}</div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {o?.createdAt?.toDate
                                    ? o.createdAt.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                                </div>
                              </div>
                              <button
                                className="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'orders', o.id), {
                                    status: 'resolved',
                                    resolvedAt: serverTimestamp(),
                                    resolvedByUid: user?.uid ?? null,
                                  })
                                }}
                              >
                                Entregado
                              </button>
                            </div>

                            <div style={{ height: 6 }} />
                            <div style={{ display: 'grid', gap: 4 }}>
                              {(o.items ?? []).map((it) => (
                                <div key={it.itemId} className="row" style={{ justifyContent: 'space-between' }}>
                                  <div>{it.name}</div>
                                  <div style={{ fontWeight: 900 }}>x{it.qty}</div>
                                </div>
                              ))}
                              {(o.items ?? []).length === 0 ? <div className="muted">Sin detalle.</div> : null}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        </div>
      ) : null}

      {view === 'pendientes' ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Pendientes</strong>
            <div className="muted" style={{ fontSize: 12 }}>Solo tus órdenes pendientes</div>
          </div>

          <div style={{ height: 12 }} />

          {tablesFromOrders.length === 0 ? <div className="muted">Sin órdenes pendientes.</div> : null}
          {tablesFromOrders.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {tablesFromOrders.map((t) => {
                const expanded = expandedTableId === t.tableId
                const lines = myPendingOrders.filter((o) => o.tableId === t.tableId)
                return (
                  <div key={t.tableId} className="card" style={{ padding: 12 }}>
                    <button
                      className="button secondary"
                      style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
                      onClick={() => setExpandedTableId((prev) => (prev === t.tableId ? null : t.tableId))}
                    >
                      <span style={{ fontWeight: 900 }}>{t.label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t.kitchen} cocina · {t.bar} barra {expanded ? '▲' : '▼'}
                      </span>
                    </button>

                    {expanded ? (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        {lines.map((o) => (
                          <div key={o.id} className="card" style={{ margin: 0, padding: 10 }}>
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <div style={{ fontWeight: 900 }}>{o.area === 'bar' ? 'Barra' : 'Cocina'}</div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {o?.createdAt?.toDate
                                    ? o.createdAt.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                                </div>
                              </div>
                              <button
                                className="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'orders', o.id), {
                                    status: 'resolved',
                                    resolvedAt: serverTimestamp(),
                                    resolvedByUid: user?.uid ?? null,
                                  })
                                }}
                              >
                                Entregada
                              </button>
                            </div>

                            <div style={{ height: 6 }} />
                            <div style={{ display: 'grid', gap: 4 }}>
                              {(o.items ?? []).map((it) => (
                                <div key={it.itemId} className="row" style={{ justifyContent: 'space-between' }}>
                                  <div>{it.name}</div>
                                  <div style={{ fontWeight: 900 }}>x{it.qty}</div>
                                </div>
                              ))}
                              {(o.items ?? []).length === 0 ? <div className="muted">Sin detalle.</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Llamados</strong>
        </div>
        <div style={{ height: 12 }} />

        {pending.length === 0 ? <div className="muted">Sin llamados pendientes.</div> : null}

        <div style={{ display: 'grid', gap: 10 }}>
          {pending.map((c) => (
            <div key={c.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{tableLabel(c.tableId)}</div>
                  <div className="muted">Cliente solicita mesero</div>
                </div>
                <button
                  className="button"
                  onClick={async () => {
                    if (!user?.uid) return
                    await updateDoc(doc(db, 'waiterCalls', c.id), {
                      status: 'acknowledged',
                      ackByUid: user.uid,
                      ackAt: serverTimestamp(),
                    })
                  }}
                >
                  Atender
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
