import React from 'react'
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  doc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import SessionBar from '../components/SessionBar'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../firebase'

type Tab = {
  id: string
  tableId: string
  status: 'open' | 'closed'
  openedAt?: any
  closedAt?: any
  total?: number
  paymentStatus?: 'paid' | 'unpaid'
  paymentMethod?: 'efectivo' | 'terminal' | 'transferencia' | 'cortesia'
  tipAmount?: number
  paidTotal?: number
  paidAt?: any
  paidByUid?: string | null
  paidByName?: string | null
  peopleCount?: number
  note?: string
  tabName?: string
  isCourtesy?: boolean
  isVoided?: boolean
  voidedAt?: any
  voidedByUid?: string | null
  createdByUid?: string | null
  createdByName?: string | null
  createdByStaffId?: string | null
}

function tableLabel(id: string) {
  if (id.startsWith('togo-')) {
    const raw = id.replace('togo-', '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
  }
  if (id.startsWith('mesa-')) {
    const raw = id.replace('mesa-', '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? `Mesa ${n}` : id
  }
  const n = Number(id)
  if (Number.isFinite(n) && n > 0) return `Mesa ${n}`
  return id
}

function tabDisplayLabel(t: Tab) {
  const name = String((t as any)?.tabName ?? '').trim()
  if (name) return name
  return tableLabel(String((t as any)?.tableId ?? ''))
}

function money(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function CajaPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  React.useEffect(() => {
    const title = 'Patanegra · Caja'
    const desc = 'Panel de caja (cobros, cuentas, reportes). Solo personal autorizado.'
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

  const urlTable = (searchParams.get('mesa') ?? '').trim()
  const urlReport = (searchParams.get('reporte') ?? '').trim()

  const [tabs, setTabs] = React.useState<Tab[]>([])
  const [orders, setOrders] = React.useState<any[]>([])
  const [now, setNow] = React.useState(() => Date.now())

  const [payOpen, setPayOpen] = React.useState(false)
  const [payTab, setPayTab] = React.useState<Tab | null>(null)
  const [payMethod, setPayMethod] = React.useState<'efectivo' | 'terminal' | 'transferencia' | 'cortesia'>('efectivo')
  const [payCourtesy, setPayCourtesy] = React.useState(false)
  const [payCourtesyPct, setPayCourtesyPct] = React.useState<30 | 50 | 100>(100)
  const [payCourtesyName, setPayCourtesyName] = React.useState('')
  const [tipMode, setTipMode] = React.useState<'none' | 'pct5' | 'pct10' | 'pct15' | 'pct20' | 'custom'>('none')
  const [tipCustom, setTipCustom] = React.useState('')
  const [payBusy, setPayBusy] = React.useState(false)
  const [payMsg, setPayMsg] = React.useState<string | null>(null)

  const moveTabToTable = React.useCallback(
    async (t: Tab, targetTableId: string, opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent)
      const fromTableId = String(t.tableId ?? '')
      const toTableId = String(targetTableId ?? '').trim()
      if (!fromTableId || !toTableId || fromTableId === toTableId) return

      const fromLabel = tableLabel(fromTableId)
      const toLabel = tableLabel(toTableId)

      if (!silent) {
        const ok = window.confirm(`¿Mover la cuenta "${tabDisplayLabel(t)}" de ${fromLabel} a ${toLabel}?`) 
        if (!ok) return
      }

      await updateDoc(doc(db, 'tabs', t.id), { tableId: toTableId, updatedAt: serverTimestamp() })

      const openedAtMs = (t as any)?.openedAt?.toMillis ? (t as any).openedAt.toMillis() : null
      const creatorUid = (t as any)?.createdByUid ?? null
      const creatorStaffId = (t as any)?.createdByStaffId ?? null

      const myOrders = orders
        .filter((o) => String(o?.status ?? '') === 'pending')
        .filter((o) => String(o?.tableId ?? '') === fromTableId)

      const byTabId = myOrders.filter((o) => {
        const oid = o?.tabId
        return oid != null && String(oid) && String(oid) === String(t.id)
      })

      let legacyMatches: any[] = []
      if (byTabId.length === 0) {
        const sameCreatorTabs = tabs
          .filter((x) => String((x as any)?.status ?? '') === 'open')
          .filter((x) => String((x as any)?.tableId ?? '') === fromTableId)
          .filter((x) => (creatorUid ? (x as any)?.createdByUid === creatorUid : true))
          .filter((x) => (creatorStaffId ? (x as any)?.createdByStaffId === creatorStaffId : true))
          .map((x) => ({
            tab: x,
            openedAtMs: (x as any)?.openedAt?.toMillis ? (x as any).openedAt.toMillis() : null,
          }))
          .filter((x) => x.openedAtMs != null)
          .sort((a, b) => Number(a.openedAtMs) - Number(b.openedAtMs))

        let upperBoundMs: number | null = null
        if (openedAtMs != null) {
          const idx = sameCreatorTabs.findIndex((x) => String(x.tab.id) === String(t.id))
          if (idx >= 0 && idx + 1 < sameCreatorTabs.length) {
            upperBoundMs = Number(sameCreatorTabs[idx + 1].openedAtMs)
          }
        }

        legacyMatches = myOrders
          .filter((o) => {
            if (creatorUid && o?.createdByUid && String(o.createdByUid) !== String(creatorUid)) return false
            if (creatorStaffId && o?.createdByStaffId && String(o.createdByStaffId) !== String(creatorStaffId)) return false
            return true
          })
          .filter((o) => {
            const createdAtMs = o?.createdAt?.toMillis ? o.createdAt.toMillis() : null
            if (openedAtMs != null && createdAtMs != null && createdAtMs < openedAtMs) return false
            if (upperBoundMs != null && createdAtMs != null && createdAtMs >= upperBoundMs) return false
            return true
          })
      }

      const toUpdate = byTabId.length ? byTabId : legacyMatches
      if (!toUpdate.length) return

      await Promise.all(
        toUpdate.map((o) =>
          updateDoc(doc(db, 'orders', o.id), {
            tableId: toTableId,
            tableLabel: toLabel,
            updatedAt: serverTimestamp(),
          }),
        ),
      )
    },
    [orders, tabs],
  )

  const payComputed = React.useMemo(() => {
    const baseTotal = Number(payTab?.total ?? 0)
    const courtesyPct = payCourtesy ? Number(payCourtesyPct) : 0
    const courtesyAmount =
      courtesyPct > 0 ? Math.max(0, Math.round((baseTotal * courtesyPct) / 100 * 100) / 100) : 0
    const netBaseTotal = Math.max(0, Math.round((baseTotal - courtesyAmount) * 100) / 100)
    const pct = tipMode === 'pct5' ? 0.05 : tipMode === 'pct10' ? 0.1 : tipMode === 'pct15' ? 0.15 : tipMode === 'pct20' ? 0.2 : 0
    const tip =
      (payMethod !== 'terminal' && payMethod !== 'transferencia') || payCourtesy
        ? 0
        : tipMode === 'custom'
          ? Math.max(0, Number(String(tipCustom ?? '').replace(/[^0-9.]/g, '')) || 0)
          : Math.max(0, Math.round(netBaseTotal * pct * 100) / 100)
    const paidTotal = Math.max(0, Math.round((netBaseTotal + tip) * 100) / 100)
    return { baseTotal, courtesyPct, courtesyAmount, netBaseTotal, tip, paidTotal }
  }, [payCourtesy, payCourtesyPct, payMethod, payTab?.total, tipCustom, tipMode])

  const [reportOpen, setReportOpen] = React.useState<'day' | 'week' | 'month' | null>(null)
  const [expandedSaleId, setExpandedSaleId] = React.useState<string | null>(null)
  const [expandedTabId, setExpandedTabId] = React.useState<string | null>(null)

  const initialView = ((): 'dashboard' | 'report' => {
    const v = String(searchParams.get('v') ?? '').toLowerCase()
    if (v === 'report' || v === 'reporte') return 'report'
    return 'dashboard'
  })()
  const [view, setView] = React.useState<'dashboard' | 'report'>(initialView)

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  React.useEffect(() => {
    const v = String(searchParams.get('v') ?? '').toLowerCase()
    const next: 'dashboard' | 'report' = v === 'report' || v === 'reporte' ? 'report' : 'dashboard'
    setView(next)
  }, [searchParams])

  React.useEffect(() => {
    const q = query(collection(db, 'tabs'), orderBy('openedAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: Tab[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
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

  const baseTableIds = Array.from({ length: 10 }, (_, i) => `mesa-${String(i + 1).padStart(2, '0')}`)
  const openTabs = tabs.filter((t) => t.status === 'open')
  const paidOrLegacyTabs = tabs.filter((t) => t.status === 'closed' && !(t as any)?.isVoided)
  const pendingKitchen = orders.filter((o) => o.status === 'pending' && o.area === 'kitchen').length
  const pendingBar = orders.filter((o) => o.status === 'pending' && o.area === 'bar').length
  const report = React.useMemo(() => {
    const d = new Date(now)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
    const weekStartDate = new Date(d)
    const day = weekStartDate.getDay()
    const diff = (day + 6) % 7
    weekStartDate.setDate(weekStartDate.getDate() - diff)
    weekStartDate.setHours(0, 0, 0, 0)
    const weekStart = weekStartDate.getTime()
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime()
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime()

    let daySum = 0
    let weekSum = 0
    let monthSum = 0
    for (const t of paidOrLegacyTabs) {
      const paidAtMs = (t as any)?.paidAt?.toMillis ? (t as any).paidAt.toMillis() : null
      const legacyAtMs = (t as any)?.closedAt?.toMillis ? (t as any).closedAt.toMillis() : null
      const at = paidAtMs ?? legacyAtMs
      if (!at) continue
      const v = paidAtMs ? Number((t as any).paidTotal ?? (t as any).total ?? 0) : Number((t as any).total ?? 0)
      if (at >= dayStart) daySum += v
      if (at >= weekStart) weekSum += v
      if (at >= monthStart) monthSum += v
    }
    return { daySum, weekSum, monthSum, dayStart, weekStart, weekEnd, monthStart, monthEnd }
  }, [paidOrLegacyTabs, now])

  const reportDetails = React.useMemo(() => {
    const byKey: Record<
      string,
      {
        tabs: Tab[]
        sum: number
        byMethod: { efectivo: number; terminal: number; transferencia: number; cortesia: number; legacy: number }
      }
    > = {
      day: { tabs: [], sum: 0, byMethod: { efectivo: 0, terminal: 0, transferencia: 0, cortesia: 0, legacy: 0 } },
      week: { tabs: [], sum: 0, byMethod: { efectivo: 0, terminal: 0, transferencia: 0, cortesia: 0, legacy: 0 } },
      month: { tabs: [], sum: 0, byMethod: { efectivo: 0, terminal: 0, transferencia: 0, cortesia: 0, legacy: 0 } },
    }

    const compute = (key: 'day' | 'week' | 'month', start: number, end: number) => {
      const rows = paidOrLegacyTabs
        .filter((t) => {
          const paidAtMs = (t as any)?.paidAt?.toMillis ? (t as any).paidAt.toMillis() : null
          const legacyAtMs = (t as any)?.closedAt?.toMillis ? (t as any).closedAt.toMillis() : null
          const ms = paidAtMs ?? legacyAtMs
          return ms != null && ms >= start && ms < end
        })
        .sort((a, b) => {
          const aMs = ((a as any)?.paidAt?.toMillis ? (a as any).paidAt.toMillis() : (a as any)?.closedAt?.toMillis ? (a as any).closedAt.toMillis() : 0) as number
          const bMs = ((b as any)?.paidAt?.toMillis ? (b as any).paidAt.toMillis() : (b as any)?.closedAt?.toMillis ? (b as any).closedAt.toMillis() : 0) as number
          return bMs - aMs
        })

      let sum = 0
      const byMethod = { efectivo: 0, terminal: 0, transferencia: 0, cortesia: 0, legacy: 0 }

      for (const t of rows) {
        const isPaid = Boolean((t as any)?.paidAt?.toMillis)
        const total = isPaid ? Number((t as any).paidTotal ?? (t as any).total ?? 0) : Number((t as any).total ?? 0)
        sum += total

        const rawMethod = isPaid ? String((t as any).paymentMethod ?? '') : 'legacy'
        const m = rawMethod === 'efectivo' ? 'efectivo' : rawMethod === 'terminal' ? 'terminal' : rawMethod === 'transferencia' ? 'transferencia' : rawMethod === 'cortesia' ? 'cortesia' : 'legacy'
        ;(byMethod as any)[m] = Number((byMethod as any)[m] ?? 0) + total
      }

      byKey[key] = { tabs: rows, sum, byMethod }
    }

    compute('day', report.dayStart, report.dayStart + 24 * 60 * 60 * 1000)
    compute('week', report.weekStart, report.weekEnd)
    compute('month', report.monthStart, report.monthEnd)
    return byKey
  }, [paidOrLegacyTabs, report])

  const tabOrdersBreakdown = React.useCallback(
    (t: Tab) => {
      const tableId = (t as any).tableId
      const openedAtMs = (t as any)?.openedAt?.toMillis ? (t as any).openedAt.toMillis() : null
      const paidAtMs = (t as any)?.paidAt?.toMillis ? (t as any).paidAt.toMillis() : null
      const legacyAtMs = (t as any)?.closedAt?.toMillis ? (t as any).closedAt.toMillis() : null
      const endMs = paidAtMs ?? legacyAtMs

      const within = (ms: number | null) => {
        if (ms == null) return false
        if (openedAtMs != null && ms < openedAtMs) return false
        if (endMs != null && ms > endMs) return false
        return true
      }

      const foodQty = new Map<string, number>()
      const drinksQty = new Map<string, number>()
      const foodAmt = new Map<string, number>()
      const drinksAmt = new Map<string, number>()

      for (const o of orders) {
        if (!o || o.tableId !== tableId) continue
        const ms = o?.createdAt?.toMillis ? o.createdAt.toMillis() : null
        if (!within(ms)) continue
        const its = Array.isArray(o.items) ? o.items : []
        const targetQty = o.area === 'bar' ? drinksQty : foodQty
        const targetAmt = o.area === 'bar' ? drinksAmt : foodAmt
        for (const it of its) {
          const name = String(it?.name ?? '').trim()
          const qty = Number(it?.qty ?? 0)
          const unitPrice = Number(it?.unitPrice ?? 0)
          const size = it?.size === 'cm20' ? '20' : it?.size === 'cm30' ? '30' : null
          const label = size ? `${name} (${size})` : name
          if (!label || !Number.isFinite(qty) || qty <= 0) continue
          targetQty.set(label, (targetQty.get(label) ?? 0) + qty)
          if (Number.isFinite(unitPrice) && unitPrice > 0) {
            targetAmt.set(label, Math.round(((targetAmt.get(label) ?? 0) + unitPrice * qty) * 100) / 100)
          }
        }
      }

      const toList = (qtyM: Map<string, number>, amtM: Map<string, number>) =>
        Array.from(qtyM.entries())
          .map(([name, qty]) => ({ name, qty, amount: Number(amtM.get(name) ?? 0) }))
          .sort((a, b) => b.amount - a.amount || b.qty - a.qty || a.name.localeCompare(b.name))

      const food = toList(foodQty, foodAmt)
      const drinks = toList(drinksQty, drinksAmt)
      const foodTotal = food.reduce((s, x) => s + Number(x.amount ?? 0), 0)
      const drinksTotal = drinks.reduce((s, x) => s + Number(x.amount ?? 0), 0)
      return {
        food,
        drinks,
        foodTotal: Math.round(foodTotal * 100) / 100,
        drinksTotal: Math.round(drinksTotal * 100) / 100,
      }
    },
    [orders],
  )

  const removeOrderItem = React.useCallback(
    async (opts: { tabId: string; orderId: string; itemId: string }) => {
      const { tabId, orderId, itemId } = opts
      if (!tabId || !orderId || !itemId) return

      await runTransaction(db, async (tx) => {
        const tabRef = doc(db, 'tabs', tabId)
        const orderRef = doc(db, 'orders', orderId)

        const [tabSnap, orderSnap] = await Promise.all([tx.get(tabRef), tx.get(orderRef)])
        if (!tabSnap.exists() || !orderSnap.exists()) return

        const tab = tabSnap.data() as any
        const order = orderSnap.data() as any

        if (String(tab?.status ?? '') !== 'open') return
        if (String(order?.tabId ?? '') !== String(tabId)) return

        const items: any[] = Array.isArray(order?.items) ? [...order.items] : []
        const idx = items.findIndex((x) => String(x?.itemId ?? '') === String(itemId))
        if (idx < 0) return

        const cur = items[idx] ?? {}
        const curQty = Number(cur?.qty ?? 0)
        if (!Number.isFinite(curQty) || curQty <= 0) return

        const unitPrice = Number(cur?.unitPrice ?? 0)
        const unitFromLineTotal = curQty > 0 ? Number(cur?.lineTotal ?? 0) / curQty : 0
        const unit = unitPrice > 0 ? unitPrice : unitFromLineTotal
        const delta = Math.max(0, Math.round(unit * 100) / 100)

        if (curQty > 1) {
          const nextQty = curQty - 1
          items[idx] = {
            ...cur,
            qty: nextQty,
            lineTotal: Math.round((Number(unitPrice > 0 ? unitPrice : unit) * nextQty) * 100) / 100,
          }
        } else {
          items.splice(idx, 1)
        }

        const nextStatus = items.length === 0 ? 'resolved' : String(order?.status ?? 'pending')
        tx.update(orderRef, {
          items,
          status: nextStatus,
          updatedAt: serverTimestamp(),
          adjustedAt: serverTimestamp(),
          adjustedByUid: user?.uid ?? null,
          adjustedByName: user?.displayName ?? user?.email ?? null,
          voidedAt: items.length === 0 ? serverTimestamp() : (order?.voidedAt ?? null),
          voidedByUid: items.length === 0 ? (user?.uid ?? null) : (order?.voidedByUid ?? null),
          voidedByName: items.length === 0 ? (user?.displayName ?? user?.email ?? null) : (order?.voidedByName ?? null),
        })

        const prevTotal = Number(tab?.total ?? 0)
        const nextTotal = Math.max(0, Math.round((prevTotal - delta) * 100) / 100)
        tx.update(tabRef, { total: nextTotal, updatedAt: serverTimestamp() })
      })
    },
    [user?.displayName, user?.email, user?.uid],
  )

  const downloadCsv = React.useCallback((rows: Tab[], filename: string) => {
    const esc = (v: any) => {
      const s = String(v ?? '')
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"', '""')}"`
      return s
    }
    const out: string[] = []
    out.push(['fecha', 'hora', 'mesa', 'cuenta', 'metodo', 'subtotal_mxn', 'propina_mxn', 'total_mxn'].map(esc).join(','))
    for (const t of rows) {
      const dt = (t as any)?.paidAt?.toDate ? (t as any).paidAt.toDate() : (t as any)?.closedAt?.toDate ? (t as any).closedAt.toDate() : null
      const dateStr = dt ? dt.toLocaleDateString('es-MX') : ''
      const timeStr = dt ? dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
      const isPaid = Boolean((t as any)?.paidAt?.toMillis)
      const subtotal = Number((t as any).total ?? 0)
      const total = isPaid ? Number((t as any).paidTotal ?? (t as any).total ?? 0) : Number((t as any).total ?? 0)
      const method = isPaid ? String((t as any).paymentMethod ?? '') : 'legacy'
      const tip = isPaid ? Number((t as any).tipAmount ?? 0) : 0
      out.push([
        dateStr,
        timeStr,
        (t as any).tableId ?? '',
        (t as any).tabName ?? '',
        method,
        subtotal.toFixed(2),
        tip.toFixed(2),
        total.toFixed(2),
      ].map(esc).join(','))
    }
    const blob = new Blob([out.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [])

  const money = React.useCallback((n: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
  }, [])

  const isActiveStyle = React.useCallback(
    (active: boolean) => ({
      borderColor: active ? '#111827' : '#e5e7eb',
      opacity: active ? 1 : 0.95,
    }),
    [],
  )

  const openTabsByTable: Record<string, Tab[]> = {}
  for (const t of openTabs) {
    if (!t.tableId) continue
    if (!openTabsByTable[t.tableId]) openTabsByTable[t.tableId] = []
    openTabsByTable[t.tableId].push(t)
  }

  const mesaTableIds = baseTableIds

  const takeoutTableIds = Object.keys(openTabsByTable)
    .filter((id) => id.startsWith('togo-'))
    .map((id) => ({ id, n: Number(id.replace('togo-', '')) }))
    .sort((a, b) => (Number.isFinite(a.n) ? a.n : 0) - (Number.isFinite(b.n) ? b.n : 0))
    .map((x) => x.id)

  const takeoutOpenTabs = takeoutTableIds.flatMap((id) => openTabsByTable[id] ?? [])
  const takeoutPendingKitchen = orders.filter((o) => o.status === 'pending' && o.area === 'kitchen' && String(o.tableId ?? '').startsWith('togo-')).length
  const takeoutPendingBar = orders.filter((o) => o.status === 'pending' && o.area === 'bar' && String(o.tableId ?? '').startsWith('togo-')).length

  const payOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 90,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
    padding: 14,
  }

  const payPanelStyle: React.CSSProperties = {
    width: 'min(720px, 100%)',
    maxHeight: '82vh',
    overflow: 'auto',
    background: 'rgba(255,255,255,0.96)',
    border: '2px solid rgba(0,0,0,0.10)',
    borderRadius: 18,
    padding: 14,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  }

  return (
    <div className="container">
      <SessionBar
        title="Caja"
        showMenuButton={false}
        rightSlot={
          user?.role === 'admin' ? (
            <>
              <Link className="button secondary" to="/admin?v=dashboard" style={{ borderColor: '#e5e7eb' }}>
                Dashboard
              </Link>
              <Link className="button secondary" to="/admin?v=mesas" style={{ borderColor: '#e5e7eb' }}>
                Mesas
              </Link>
              <button
                className="button secondary"
                style={isActiveStyle(true)}
                onClick={() => {
                  setView('dashboard')
                  navigate('/caja?v=dashboard')
                }}
              >
                Caja
              </button>
              <button
                className="button secondary"
                style={isActiveStyle(view === 'report')}
                onClick={() => {
                  setView('report')
                  navigate('/caja?v=report')
                }}
              >
                Reporte
              </button>
              <Link className="button secondary" to="/almacen" style={{ borderColor: '#e5e7eb' }}>
                Almacén
              </Link>
              <Link className="button secondary" to="/menu-config" style={{ borderColor: '#e5e7eb' }}>
                Menú (Config)
              </Link>
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            </>
          ) : user?.role === 'gerente' ? (
            <>
              <button
                className="button secondary"
                style={isActiveStyle(view === 'dashboard')}
                onClick={() => {
                  setView('dashboard')
                  navigate('/caja?v=dashboard')
                }}
              >
                Caja
              </button>
              <button
                className="button secondary"
                style={isActiveStyle(view === 'report')}
                onClick={() => {
                  setView('report')
                  navigate('/caja?v=report')
                }}
              >
                Reporte
              </button>
              <Link className="button secondary" to="/almacen" style={{ borderColor: '#e5e7eb' }}>
                Almacén
              </Link>
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            </>
          ) : user?.role === 'caja' ? (
            <>
              <button
                className="button secondary"
                style={isActiveStyle(view === 'dashboard')}
                onClick={() => {
                  setView('dashboard')
                  navigate('/caja?v=dashboard')
                }}
              >
                Caja
              </button>
              <button
                className="button secondary"
                style={isActiveStyle(view === 'report')}
                onClick={() => {
                  setView('report')
                  navigate('/caja?v=report')
                }}
              >
                Reporte
              </button>
              <Link className="button secondary" to="/menu" style={{ borderColor: '#e5e7eb' }}>
                Menú
              </Link>
            </>
          ) : null
        }
      />

      {view === 'report' ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900 }}>Reporte</div>
          <div className="muted" style={{ fontSize: 12 }}>Ventas por cierres (tabs cerrados).</div>
          <div style={{ height: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <button className="card" style={{ margin: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setReportOpen((p) => (p === 'day' ? null : 'day'))}>
              <div className="muted" style={{ fontSize: 12 }}>Hoy</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.daySum)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.transferencia)}</strong>
              </div>
            </button>
            <button className="card" style={{ margin: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setReportOpen((p) => (p === 'week' ? null : 'week'))}>
              <div className="muted" style={{ fontSize: 12 }}>Semana</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.weekSum)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.transferencia)}</strong>
              </div>
            </button>
            <button className="card" style={{ margin: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setReportOpen((p) => (p === 'month' ? null : 'month'))}>
              <div className="muted" style={{ fontSize: 12 }}>Mes</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.monthSum)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.transferencia)}</strong>
              </div>
            </button>
          </div>

          {reportOpen ? (
            <>
              <div style={{ height: 12 }} />
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Detalle · {reportOpen === 'day' ? 'Hoy' : reportOpen === 'week' ? 'Semana' : 'Mes'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{reportDetails[reportOpen].tabs.length} venta(s)</div>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => downloadCsv(reportDetails[reportOpen].tabs, `reporte_caja_${reportOpen}_${new Date(now).toISOString().slice(0, 10)}.csv`)}
                  >
                    Descargar CSV
                  </button>
                </div>

                <div style={{ height: 12 }} />

                <div className="card" style={{ margin: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Efectivo</div>
                    <div style={{ fontWeight: 950 }}>{money(reportDetails[reportOpen].byMethod.efectivo)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Tarjeta</div>
                    <div style={{ fontWeight: 950 }}>{money(reportDetails[reportOpen].byMethod.terminal)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Transferencia</div>
                    <div style={{ fontWeight: 950 }}>{money(reportDetails[reportOpen].byMethod.transferencia)}</div>
                  </div>
                </div>

                <div style={{ height: 12 }} />

                <div style={{ display: 'grid', gap: 8 }}>
                  {reportDetails[reportOpen].tabs.length === 0 ? <div className="muted">Sin ventas en este rango.</div> : null}
                  {reportDetails[reportOpen].tabs.slice(0, 200).map((t) => {
                    const dt = (t as any)?.paidAt?.toDate ? (t as any).paidAt.toDate() : (t as any)?.closedAt?.toDate ? (t as any).closedAt.toDate() : null
                    const isPaid = Boolean((t as any)?.paidAt?.toMillis)
                    const subtotal = Number((t as any).total ?? 0)
                    const tip = isPaid ? Number((t as any).tipAmount ?? 0) : 0
                    const total = isPaid ? Number((t as any).paidTotal ?? (t as any).total ?? 0) : Number((t as any).total ?? 0)
                    const method = isPaid ? String((t as any).paymentMethod ?? '') : 'legacy'
                    const id = String((t as any).id)
                    const expanded = expandedSaleId === id
                    const breakdown = expanded ? tabOrdersBreakdown(t) : null
                    return (
                      <div
                        key={id}
                        className="card"
                        style={{ margin: 0, padding: 10, cursor: 'pointer' }}
                        onClick={() => setExpandedSaleId((p) => (p === id ? null : id))}
                      >
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {(t as any).tableId ?? '—'}{(t as any).tabName ? ` · ${(t as any).tabName}` : ''} · {method}
                            {dt ? ` · ${dt.toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : ''}
                          </div>
                          <div style={{ fontWeight: 950 }}>{money(total)}</div>
                        </div>

                        <div style={{ height: 6 }} />

                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div className="muted" style={{ fontSize: 12 }}>Consumo</div>
                          <div style={{ fontWeight: 900 }}>{money(subtotal)}</div>
                        </div>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div className="muted" style={{ fontSize: 12 }}>Propina</div>
                          <div style={{ fontWeight: 900 }}>{money(tip)}</div>
                        </div>

                        {expanded && breakdown ? (
                          <>
                            <div style={{ height: 10 }} />
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Alimentos</div>
                                {breakdown.food.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                <div style={{ display: 'grid', gap: 4 }}>
                                  {breakdown.food.slice(0, 30).map((x) => (
                                    <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                      <div>{x.name}</div>
                                      <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                        <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                        <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ height: 6 }} />
                                <div className="row" style={{ justifyContent: 'space-between' }}>
                                  <div className="muted" style={{ fontSize: 12 }}>Total alimentos</div>
                                  <div style={{ fontWeight: 950 }}>{breakdown.foodTotal ? money(Number(breakdown.foodTotal)) : '—'}</div>
                                </div>
                              </div>

                              <div style={{ width: 14 }} />

                              <div style={{ flex: 1 }}>
                                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Bebidas</div>
                                {breakdown.drinks.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                <div style={{ display: 'grid', gap: 4 }}>
                                  {breakdown.drinks.slice(0, 30).map((x) => (
                                    <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                      <div>{x.name}</div>
                                      <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                        <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                        <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ height: 6 }} />
                                <div className="row" style={{ justifyContent: 'space-between' }}>
                                  <div className="muted" style={{ fontSize: 12 }}>Total bebidas</div>
                                  <div style={{ fontWeight: 950 }}>{breakdown.drinksTotal ? money(Number(breakdown.drinksTotal)) : '—'}</div>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%' }}>
              <div>
                <div style={{ fontWeight: 800 }}>Mesas</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Cuentas abiertas: <strong style={{ color: '#111827' }}>{openTabs.length}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Órdenes pendientes: <strong style={{ color: '#111827' }}>{pendingKitchen}</strong> cocina · <strong style={{ color: '#111827' }}>{pendingBar}</strong> barra
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 800 }}>Para llevar</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Cuentas abiertas: <strong style={{ color: '#111827' }}>{takeoutOpenTabs.length}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Órdenes pendientes: <strong style={{ color: '#111827' }}>{takeoutPendingKitchen}</strong> cocina · <strong style={{ color: '#111827' }}>{takeoutPendingBar}</strong> barra
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="button secondary"
              onClick={async () => {
                if (!payTab) return
                const example = 'mesa-02'
                const target = String(window.prompt('Mover cuenta a mesa (ej. mesa-02)', example) ?? '').trim()
                if (!target) return
                try {
                  await moveTabToTable(payTab, target)
                } catch {
                  // ignore
                }
              }}
            >
              Cambiar mesa
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setPayMsg(null)
                setTipMode('none')
                setTipCustom('')
                setPayMethod('efectivo')
                setPayCourtesy(false)
                setPayCourtesyPct(100)
                setPayCourtesyName('')
                setPayTab(payTab)
                setPayOpen(true)
              }}
            >
              Cobrar
            </button>
          </div>
        </div>
      )}

      {view === 'dashboard' ? (
        <>
          <div className="tableGrid">
            {mesaTableIds.map((tableId) => {
              const tableTabs = openTabsByTable[tableId] ?? []
              const oldestOpenedAtMs =
                tableTabs.length
                  ? tableTabs.reduce<number | null>((min, t) => {
                      const ms = (t as any)?.openedAt?.toMillis ? (t as any).openedAt.toMillis() : null
                      if (ms == null) return min
                      if (min == null) return ms
                      return Math.min(min, ms)
                    }, null)
                  : null
              const isOpen = tableTabs.length > 0
              const hasBillRequest = tableTabs.some((t) => {
                const req = (t as any)?.billRequestedAt
                const printed = (t as any)?.billPrintedAt
                const requested = Boolean(req?.toMillis ? req.toMillis() : req)
                const done = Boolean(printed?.toMillis ? printed.toMillis() : printed)
                return requested && !done
              })
              return (
                <div
                  key={tableId}
                  className={`tableCard${isOpen ? ' open' : ''}`}
                  style={{ borderColor: isOpen ? 'rgba(245, 158, 11, 0.85)' : undefined }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{tableLabel(tableId)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {isOpen ? (
                          <>
                            <strong style={{ color: '#111827' }}>{tableTabs.length}</strong> cuenta(s)
                            {oldestOpenedAtMs != null ? ` · ${formatClock(oldestOpenedAtMs)}` : ''}
                          </>
                        ) : (
                          'Libre'
                        )}
                      </div>
                    </div>
                    {hasBillRequest ? (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          padding: '4px 8px',
                          borderRadius: 999,
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                        }}
                      >
                        Cuenta solicitada
                      </div>
                    ) : null}
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ display: 'grid', gap: 10 }}>
                    {tableTabs.map((t) => (
                      <div key={t.id} className="tabRow">
                        <div>
                          <div style={{ fontWeight: 900 }}>{t.tabName ? t.tabName : 'Cuenta'}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t.createdByName ? `Mesero: ${t.createdByName}${t.createdByStaffId ? ` (${t.createdByStaffId})` : ''}` : '—'}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Consumo: <strong style={{ color: '#111827' }}>{money(Number(t.total ?? 0))}</strong>
                          </div>
                        </div>

                        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                          <Link className="button secondary" to={`/menu?mesa=${String(t.tableId ?? '').trim()}`}>
                            Agregar pedido
                          </Link>
                          <button
                            className="button secondary"
                            onClick={() => setExpandedTabId((p) => (p === t.id ? null : t.id))}
                          >
                            Ver consumo
                          </button>
                          <button
                            className="button secondary"
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'tabs', String(t.id)), {
                                  billRequestedAt: serverTimestamp(),
                                  billRequestedByUid: user?.uid ?? null,
                                  billRequestedByName: user?.displayName ?? user?.email ?? null,
                                  updatedAt: serverTimestamp(),
                                })
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            Pedir cuenta
                          </button>
                          <button
                            className="button secondary"
                            onClick={async () => {
                              const example = 'mesa-02'
                              const target = String(window.prompt('Mover cuenta a mesa (ej. mesa-02)', example) ?? '').trim()
                              if (!target) return
                              try {
                                await moveTabToTable(t, target)
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            Cambiar mesa
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setPayMsg(null)
                              setTipMode('none')
                              setTipCustom('')
                              setPayMethod('efectivo')
                              setPayCourtesy(false)
                              setPayCourtesyPct(100)
                              setPayCourtesyName('')
                              setPayTab({ ...t })
                              setPayOpen(true)
                            }}
                          >
                            Cobrar
                          </button>
                        </div>

                        {expandedTabId === t.id ? (
                          <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                            <div className="card" style={{ margin: 0, padding: 10 }}>
                              {(() => {
                                const breakdown = tabOrdersBreakdown(t)
                                return (
                                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Alimentos</div>
                                      {breakdown.food.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                      <div style={{ display: 'grid', gap: 4 }}>
                                        {breakdown.food.slice(0, 30).map((x) => (
                                          <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                            <div>{x.name}</div>
                                            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                              <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                              <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div style={{ height: 6 }} />
                                      <div className="row" style={{ justifyContent: 'space-between' }}>
                                        <div className="muted" style={{ fontSize: 12 }}>Total alimentos</div>
                                        <div style={{ fontWeight: 950 }}>{breakdown.foodTotal ? money(Number(breakdown.foodTotal)) : '—'}</div>
                                      </div>
                                    </div>

                                    <div style={{ width: 14 }} />

                                    <div style={{ flex: 1 }}>
                                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Bebidas</div>
                                      {breakdown.drinks.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                      <div style={{ display: 'grid', gap: 4 }}>
                                        {breakdown.drinks.slice(0, 30).map((x) => (
                                          <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                            <div>{x.name}</div>
                                            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                              <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                              <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div style={{ height: 6 }} />
                                      <div className="row" style={{ justifyContent: 'space-between' }}>
                                        <div className="muted" style={{ fontSize: 12 }}>Total bebidas</div>
                                        <div style={{ fontWeight: 950 }}>{breakdown.drinksTotal ? money(Number(breakdown.drinksTotal)) : '—'}</div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>

                            <div style={{ height: 10 }} />

                            <div className="card" style={{ margin: 0, padding: 10 }}>
                              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quitar productos (cuenta abierta)</div>
                              {(() => {
                                const tabOrders = orders
                                  .filter((o) => String(o?.tabId ?? '') === String(t.id))
                                  .filter((o) => {
                                    const its = Array.isArray((o as any)?.items) ? (o as any).items : []
                                    return its.length > 0
                                  })
                                  .sort((a, b) => {
                                    const aMs = (a as any)?.createdAt?.toMillis ? (a as any).createdAt.toMillis() : 0
                                    const bMs = (b as any)?.createdAt?.toMillis ? (b as any).createdAt.toMillis() : 0
                                    return bMs - aMs
                                  })

                                if (!tabOrders.length) return <div className="muted" style={{ fontSize: 12 }}>Sin comandas.</div>

                                return (
                                  <div style={{ display: 'grid', gap: 10 }}>
                                    {tabOrders.slice(0, 20).map((o) => (
                                      <div key={String(o.id)} className="card" style={{ margin: 0, padding: 10 }}>
                                        <div className="row" style={{ justifyContent: 'space-between' }}>
                                          <div style={{ fontWeight: 900 }}>{String(o?.area ?? '') === 'bar' ? 'Barra' : 'Cocina'}</div>
                                          <div className="muted" style={{ fontSize: 12 }}>
                                            {(o as any)?.createdAt?.toDate
                                              ? (o as any).createdAt.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                                              : ''}
                                          </div>
                                        </div>
                                        {(() => {
                                          const printedAt = (o as any)?.printedAt
                                          const isPrinted = Boolean(printedAt?.toMillis ? printedAt.toMillis() : printedAt)
                                          return isPrinted ? (
                                            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ya impreso</div>
                                          ) : (
                                            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>No impreso</div>
                                          )
                                        })()}
                                        <div style={{ height: 8 }} />
                                        <div style={{ display: 'grid', gap: 6 }}>
                                          {(Array.isArray((o as any)?.items) ? (o as any).items : []).map((it: any) => (
                                            <div key={String(it?.itemId ?? '')} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                                              <div>
                                                <div style={{ fontWeight: 700 }}>{String(it?.name ?? it?.itemId ?? '')}</div>
                                                <div className="muted" style={{ fontSize: 12 }}>x{Number(it?.qty ?? 0)}</div>
                                              </div>
                                              <button
                                                className="button secondary"
                                                onClick={async () => {
                                                  const printedAt = (o as any)?.printedAt
                                                  const isPrinted = Boolean(printedAt?.toMillis ? printedAt.toMillis() : printedAt)
                                                  const msg = isPrinted
                                                    ? 'Esta comanda ya se imprimió. ¿Quitar 1 unidad de este producto de la cuenta de todas formas?'
                                                    : '¿Quitar 1 unidad de este producto?'
                                                  const ok = window.confirm(msg)
                                                  if (!ok) return
                                                  try {
                                                    await removeOrderItem({ tabId: String(t.id), orderId: String(o.id), itemId: String(it?.itemId ?? '') })
                                                  } catch (e: any) {
                                                    const msg = String(e?.code ? `${String(e.code)}: ${String(e.message ?? '')}` : e?.message ?? e ?? '')
                                                    window.alert(msg ? `No se pudo quitar el producto: ${msg}` : 'No se pudo quitar el producto.')
                                                  }
                                                }}
                                              >
                                                Quitar
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: 14 }} />

          <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(239, 68, 68, 0.35)' }}>
            <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 13 }}>Para llevar</div>
            {takeoutTableIds.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>Sin para llevar.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {takeoutTableIds.map((tableId) => {
                  const tableTabs = openTabsByTable[tableId] ?? []
                  const oldestOpenedAtMs =
                    tableTabs.length
                      ? tableTabs.reduce<number | null>((min, t) => {
                          const ms = (t as any)?.openedAt?.toMillis ? (t as any).openedAt.toMillis() : null
                          if (ms == null) return min
                          if (min == null) return ms
                          return Math.min(min, ms)
                        }, null)
                      : null

                  return (
                    <div key={tableId} style={{ border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 12, padding: 10 }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 950, fontSize: 13 }}>{tabDisplayLabel(tableTabs[0])}</div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            <strong style={{ color: '#111827' }}>{tableTabs.length}</strong> cuenta(s)
                            {oldestOpenedAtMs != null ? ` · ${formatClock(oldestOpenedAtMs)}` : ''}
                          </div>
                        </div>
                        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>{tableId}</div>
                      </div>

                      <div style={{ height: 8 }} />

                      <div style={{ display: 'grid', gap: 8 }}>
                        {tableTabs.map((t) => (
                          <div key={t.id} style={{ borderTop: '1px dashed rgba(0,0,0,0.10)', paddingTop: 8 }}>
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900, fontSize: 12 }}>{t.tabName ? t.tabName : 'Cuenta'}</div>
                                <div className="muted" style={{ fontSize: 11 }}>
                                  {t.createdByName ? `Mesero: ${t.createdByName}${t.createdByStaffId ? ` (${t.createdByStaffId})` : ''}` : '—'}
                                </div>
                                <div className="muted" style={{ fontSize: 11 }}>
                                  Consumo: <strong style={{ color: '#111827' }}>{money(Number(t.total ?? 0))}</strong>
                                </div>
                              </div>

                              <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button
                                  className="button secondary"
                                  onClick={() => setExpandedTabId((p) => (p === t.id ? null : t.id))}
                                >
                                  Ver consumo
                                </button>
                                <button
                                  className="button secondary"
                                  onClick={async () => {
                                    try {
                                      await updateDoc(doc(db, 'tabs', String(t.id)), {
                                        billRequestedAt: serverTimestamp(),
                                        billRequestedByUid: user?.uid ?? null,
                                        billRequestedByName: user?.displayName ?? user?.email ?? null,
                                        updatedAt: serverTimestamp(),
                                      })
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                >
                                  Pedir cuenta
                                </button>
                                <button
                                  className="button secondary"
                                  onClick={() => {
                                    setPayMsg(null)
                                    setTipMode('none')
                                    setTipCustom('')
                                    setPayMethod('efectivo')
                                    setPayCourtesy(false)
                                    setPayCourtesyPct(100)
                                    setPayCourtesyName('')
                                    setPayTab({ ...t })
                                    setPayOpen(true)
                                  }}
                                >
                                  Cobrar
                                </button>
                              </div>
                            </div>

                            {expandedTabId === t.id ? (
                              <div style={{ marginTop: 10 }}>
                                <div className="card" style={{ margin: 0, padding: 10 }}>
                                  {(() => {
                                    const breakdown = tabOrdersBreakdown(t)
                                    return (
                                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Alimentos</div>
                                          {breakdown.food.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                          <div style={{ display: 'grid', gap: 4 }}>
                                            {breakdown.food.slice(0, 30).map((x) => (
                                              <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                                <div>{x.name}</div>
                                                <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                                  <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                                  <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <div style={{ height: 6 }} />
                                          <div className="row" style={{ justifyContent: 'space-between' }}>
                                            <div className="muted" style={{ fontSize: 12 }}>Total alimentos</div>
                                            <div style={{ fontWeight: 950 }}>{breakdown.foodTotal ? money(Number(breakdown.foodTotal)) : '—'}</div>
                                          </div>
                                        </div>

                                        <div style={{ width: 14 }} />

                                        <div style={{ flex: 1 }}>
                                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Bebidas</div>
                                          {breakdown.drinks.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin items.</div> : null}
                                          <div style={{ display: 'grid', gap: 4 }}>
                                            {breakdown.drinks.slice(0, 30).map((x) => (
                                              <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                                                <div>{x.name}</div>
                                                <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                                  <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                                                  <div style={{ fontWeight: 950 }}>{x.amount ? money(Number(x.amount)) : '—'}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <div style={{ height: 6 }} />
                                          <div className="row" style={{ justifyContent: 'space-between' }}>
                                            <div className="muted" style={{ fontSize: 12 }}>Total bebidas</div>
                                            <div style={{ fontWeight: 950 }}>{breakdown.drinksTotal ? money(Number(breakdown.drinksTotal)) : '—'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </div>

                                <div style={{ height: 10 }} />

                                <div className="card" style={{ margin: 0, padding: 10 }}>
                                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quitar productos (cuenta abierta)</div>
                                  {(() => {
                                    const tabOrders = orders
                                      .filter((o) => String(o?.tabId ?? '') === String(t.id))
                                      .filter((o) => {
                                        const its = Array.isArray((o as any)?.items) ? (o as any).items : []
                                        return its.length > 0
                                      })
                                      .sort((a, b) => {
                                        const aMs = (a as any)?.createdAt?.toMillis ? (a as any).createdAt.toMillis() : 0
                                        const bMs = (b as any)?.createdAt?.toMillis ? (b as any).createdAt.toMillis() : 0
                                        return bMs - aMs
                                      })

                                    if (!tabOrders.length) return <div className="muted" style={{ fontSize: 12 }}>Sin comandas.</div>

                                    return (
                                      <div style={{ display: 'grid', gap: 10 }}>
                                        {tabOrders.slice(0, 20).map((o) => (
                                          <div key={String(o.id)} className="card" style={{ margin: 0, padding: 10 }}>
                                            <div className="row" style={{ justifyContent: 'space-between' }}>
                                              <div style={{ fontWeight: 900 }}>{String(o?.area ?? '') === 'bar' ? 'Barra' : 'Cocina'}</div>
                                              <div className="muted" style={{ fontSize: 12 }}>
                                                {(o as any)?.createdAt?.toDate
                                                  ? (o as any).createdAt.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                                                  : ''}
                                              </div>
                                            </div>
                                            {(() => {
                                              const printedAt = (o as any)?.printedAt
                                              const isPrinted = Boolean(printedAt?.toMillis ? printedAt.toMillis() : printedAt)
                                              return isPrinted ? (
                                                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ya impreso</div>
                                              ) : (
                                                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>No impreso</div>
                                              )
                                            })()}
                                            <div style={{ height: 8 }} />
                                            <div style={{ display: 'grid', gap: 6 }}>
                                              {(Array.isArray((o as any)?.items) ? (o as any).items : []).map((it: any) => (
                                                <div
                                                  key={String(it?.itemId ?? '')}
                                                  className="row"
                                                  style={{ justifyContent: 'space-between', gap: 10 }}
                                                >
                                                  <div>
                                                    <div style={{ fontWeight: 700 }}>{String(it?.name ?? it?.itemId ?? '')}</div>
                                                    <div className="muted" style={{ fontSize: 12 }}>x{Number(it?.qty ?? 0)}</div>
                                                  </div>
                                                  <button
                                                    className="button secondary"
                                                    onClick={async () => {
                                                      const printedAt = (o as any)?.printedAt
                                                      const isPrinted = Boolean(printedAt?.toMillis ? printedAt.toMillis() : printedAt)
                                                      const msg = isPrinted
                                                        ? 'Esta comanda ya se imprimió. ¿Quitar 1 unidad de este producto de la cuenta de todas formas?'
                                                        : '¿Quitar 1 unidad de este producto?'
                                                      const ok = window.confirm(msg)
                                                      if (!ok) return
                                                      try {
                                                        await removeOrderItem({
                                                          tabId: String(t.id),
                                                          orderId: String(o.id),
                                                          itemId: String(it?.itemId ?? ''),
                                                        })
                                                      } catch (e: any) {
                                                        const msg = String(
                                                          e?.code
                                                            ? `${String(e.code)}: ${String(e.message ?? '')}`
                                                            : e?.message ?? e ?? '',
                                                        )
                                                        window.alert(
                                                          msg ? `No se pudo quitar el producto: ${msg}` : 'No se pudo quitar el producto.',
                                                        )
                                                      }
                                                    }}
                                                  >
                                                    Quitar
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {payOpen && payTab ? (
        <div style={payOverlayStyle} onClick={() => (payBusy ? null : setPayOpen(false))}>
          <div style={payPanelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>Cobro</strong>
                <div className="muted" style={{ fontSize: 12 }}>{tabDisplayLabel(payTab)}</div>
              </div>
              <button className="button secondary" disabled={payBusy} onClick={() => setPayOpen(false)}>
                Cerrar
              </button>
            </div>

            <div style={{ height: 10 }} />

            {payMsg ? <div className="muted" style={{ marginBottom: 10 }}>{payMsg}</div> : null}

            <div className="card" style={{ margin: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Subtotal</div>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>{money(payComputed.baseTotal)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Total</div>
                  <div style={{ fontWeight: 950, fontSize: 22 }}>{money(payComputed.paidTotal)}</div>
                </div>
              </div>

              <div style={{ height: 10 }} />

              {payCourtesy ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Cortesía ({payComputed.courtesyPct}%)</div>
                  <div style={{ fontWeight: 900 }}>-{money(payComputed.courtesyAmount)}</div>
                </div>
              ) : null}

              {payCourtesy ? <div style={{ height: 6 }} /> : null}

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="muted" style={{ fontSize: 12 }}>Propina</div>
                <div style={{ fontWeight: 900 }}>{money(payComputed.tip)}</div>
              </div>
            </div>

            <div style={{ height: 10 }} />

            <div className="card" style={{ margin: 0 }}>
              <label className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>Cortesía</div>
                  <div className="muted" style={{ fontSize: 12 }}>Aplicar descuento por cortesía.</div>
                </div>
                <input
                  type="checkbox"
                  checked={payCourtesy}
                  disabled={payBusy}
                  onChange={(e) => {
                    const on = Boolean(e.target.checked)
                    setPayCourtesy(on)
                    if (on) {
                      if (payCourtesyPct === 100) setPayMethod('cortesia')
                      setTipMode('none')
                      setTipCustom('')
                    } else {
                      setPayMethod('efectivo')
                    }
                  }}
                />
              </label>

              {payCourtesy ? (
                <>
                  <div style={{ height: 10 }} />
                  <div className="muted" style={{ fontSize: 12 }}>Descuento</div>
                  <div style={{ height: 8 }} />
                  <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    <button
                      className="button secondary"
                      style={isActiveStyle(payCourtesyPct === 30)}
                      disabled={payBusy}
                      onClick={() => {
                        setPayCourtesyPct(30)
                        if (payMethod === 'cortesia') setPayMethod('efectivo')
                      }}
                    >
                      30%
                    </button>
                    <button
                      className="button secondary"
                      style={isActiveStyle(payCourtesyPct === 50)}
                      disabled={payBusy}
                      onClick={() => {
                        setPayCourtesyPct(50)
                        if (payMethod === 'cortesia') setPayMethod('efectivo')
                      }}
                    >
                      50%
                    </button>
                    <button
                      className="button secondary"
                      style={isActiveStyle(payCourtesyPct === 100)}
                      disabled={payBusy}
                      onClick={() => {
                        setPayCourtesyPct(100)
                        setPayMethod('cortesia')
                      }}
                    >
                      100%
                    </button>
                  </div>

                  <div style={{ height: 10 }} />
                  <div className="muted" style={{ fontSize: 12 }}>Nombre (a quién se da la cortesía)</div>
                  <div style={{ height: 6 }} />
                  <input
                    className="input"
                    placeholder="Ej. Cortesía para Juan"
                    value={payCourtesyName}
                    disabled={payBusy}
                    onChange={(e) => setPayCourtesyName(e.target.value)}
                  />
                </>
              ) : null}
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>Método de pago</div>
              <select
                className="input"
                value={payCourtesy && payCourtesyPct === 100 ? 'cortesia' : payMethod}
                disabled={payBusy || (payCourtesy && payCourtesyPct === 100)}
                onChange={(e) => setPayMethod(e.target.value as any)}
              >
                <option value="efectivo">Efectivo</option>
                <option value="terminal">Terminal</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>

            <div style={{ height: 10 }} />

            {(payMethod === 'terminal' || payMethod === 'transferencia') && !payCourtesy ? (
              <div className="card" style={{ margin: 0 }}>
                <div className="muted" style={{ fontSize: 12 }}>Propina</div>
                <div style={{ height: 8 }} />
                <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'pct5')} onClick={() => setTipMode('pct5')}>5%</button>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'pct10')} onClick={() => setTipMode('pct10')}>10%</button>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'pct15')} onClick={() => setTipMode('pct15')}>15%</button>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'pct20')} onClick={() => setTipMode('pct20')}>20%</button>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'custom')} onClick={() => setTipMode('custom')}>Otro</button>
                  <button className="button secondary" style={isActiveStyle(tipMode === 'none')} onClick={() => setTipMode('none')}>Sin</button>
                </div>
                {tipMode === 'custom' ? (
                  <>
                    <div style={{ height: 10 }} />
                    <input className="input" inputMode="decimal" placeholder="Propina (MXN)" value={tipCustom} onChange={(e) => setTipCustom(e.target.value)} />
                  </>
                ) : null}
              </div>
            ) : null}

            <div style={{ height: 12 }} />

            <button
              className="button"
              disabled={payBusy}
              onClick={async () => {
                const baseTotal = payComputed.baseTotal
                const tip = payComputed.tip
                const paidTotal = payComputed.paidTotal
                const courtesyName = String(payCourtesyName ?? '').trim()
                if (payCourtesy && !courtesyName) {
                  setPayMsg('Ingresa el nombre de a quién se le da la cortesía.')
                  return
                }

                const effectiveMethod = payCourtesy && payCourtesyPct === 100 ? 'cortesia' : payMethod

                setPayBusy(true)
                setPayMsg(null)
                try {
                  await updateDoc(doc(db, 'tabs', payTab.id), {
                    total: Number.isFinite(baseTotal) ? baseTotal : 0,
                    status: 'closed',
                    closedAt: serverTimestamp(),
                    paymentStatus: 'paid',
                    paymentMethod: effectiveMethod,
                    isCourtesy: payCourtesy,
                    courtesyPercent: payCourtesy ? payCourtesyPct : 0,
                    courtesyAmount: payCourtesy ? Number(payComputed.courtesyAmount ?? 0) : 0,
                    courtesyName: payCourtesy ? courtesyName : null,
                    tipAmount: tip,
                    paidTotal,
                    paidAt: serverTimestamp(),
                    paidByUid: user?.uid ?? null,
                    paidByName: user?.displayName ?? user?.email ?? null,
                  })

                  try {
                    const snap = await getDocs(query(collection(db, 'orders'), where('tabId', '==', payTab.id)))
                    if (snap.size) {
                      const batch = writeBatch(db)
                      for (const d of snap.docs) {
                        const o = d.data() as any
                        const status = String(o?.status ?? '')
                        if (status === 'resolved') continue
                        batch.update(doc(db, 'orders', d.id), {
                          status: 'resolved',
                          resolvedAt: serverTimestamp(),
                          resolvedByUid: user?.uid ?? null,
                          resolvedByName: user?.displayName ?? user?.email ?? null,
                        })
                      }
                      await batch.commit()
                    }
                  } catch {
                    // If resolving orders fails, the payment is still registered. Pending orders may still appear until resolved manually.
                  }

                  setPayOpen(false)
                  setPayTab(null)
                } catch (e: any) {
                  const msg = String(e?.code ? `${String(e.code)}: ${String(e.message ?? '')}` : e?.message ?? e ?? '')
                  setPayMsg(msg ? `No se pudo registrar el cobro: ${msg}` : 'No se pudo registrar el cobro. Revisa permisos o conexión.')
                } finally {
                  setPayBusy(false)
                }
              }}
            >
              Confirmar cobro
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
