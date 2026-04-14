import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SessionBar from '../components/SessionBar'
import { useAuth } from '../auth/AuthProvider'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'

type Category = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

type Item = {
  id: string
  categoryId: string
  name: string
  description?: string
  price?: number
  prices?: { cm20?: number; cm30?: number }
  sortOrder: number
  isActive: boolean
  promoPercent?: number
  promoLabel?: string
}

function hasSizes(it: Item) {
  return typeof it.prices?.cm20 === 'number' || typeof it.prices?.cm30 === 'number'
}

function slug(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

type MenuImportPayload = {
  categories: Array<{ name: string; sortOrder?: number; isActive?: boolean }>
  items: Array<{
    category: string
    name: string
    description?: string
    price?: number
    prices?: { cm20?: number; cm30?: number }
    sortOrder?: number
    isActive?: boolean
    promoPercent?: number
    promoLabel?: string
  }>
}

const PRESET_MENU_IMPORT_PAYLOAD: MenuImportPayload = {
  categories: [
    { name: 'Pizzas', sortOrder: 1, isActive: true },
    { name: 'Pizza Artesanal', sortOrder: 2, isActive: true },
    { name: 'Calzone', sortOrder: 3, isActive: true },
    { name: 'Pasta', sortOrder: 4, isActive: true },
    { name: 'Pan Artesanal', sortOrder: 5, isActive: true },
    { name: 'Sodas Italianas y Preparadas', sortOrder: 6, isActive: true },
    { name: 'Bebidas Naturales', sortOrder: 7, isActive: true },
    { name: 'Refrescos', sortOrder: 8, isActive: true },
  ],
  items: [
    {
      category: 'Pizzas',
      name: 'Pepperoni',
      description: 'Mix de quesos, salsa de tomate y pepperoni.',
      prices: { cm20: 130, cm30: 175 },
      sortOrder: 1,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Hawaiana',
      description: 'Mix de quesos, salsa de tomate, jamón y piña.',
      prices: { cm20: 130, cm30: 175 },
      sortOrder: 2,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Pata negra',
      description: 'Mix de quesos, salsa de tomate, espinacas, tocino, cebolla, champiñones, queso de cabra.',
      prices: { cm20: 155, cm30: 220 },
      sortOrder: 3,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Don Rafa',
      description: 'Mozzarella, salsa alfredo, espinacas y tocino ahumado.',
      prices: { cm20: 155, cm30: 220 },
      sortOrder: 4,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Familia',
      description: 'Mix de quesos, salsa de tomate, aceitunas negras, cebolla, jamón y aderezo de ajo.',
      prices: { cm20: 150, cm30: 195 },
      sortOrder: 5,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Pepcham',
      description: 'Mix de quesos, salsa de tomate, pepperoni y champiñones.',
      prices: { cm20: 145, cm30: 180 },
      sortOrder: 6,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Serrano',
      description: 'Mix de quesos, salsa de tomate, espinacas, champiñones, jamón serrano, queso de cabra.',
      prices: { cm20: 170, cm30: 245 },
      sortOrder: 7,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Gaucho',
      description: 'Mix de quesos, salsa de tomate, chorizo argentino y chimichurri.',
      prices: { cm20: 150, cm30: 200 },
      sortOrder: 8,
      isActive: true,
    },
    {
      category: 'Pizzas',
      name: 'Hongo',
      description: 'Mozzarella, salsa de tomate, espinacas y champiñones.',
      prices: { cm20: 140, cm30: 180 },
      sortOrder: 9,
      isActive: true,
    },

    {
      category: 'Pizza Artesanal',
      name: 'Margarita',
      description: 'Mozzarella, salsa de tomate y pesto de albahaca.',
      prices: { cm20: 140, cm30: 180 },
      sortOrder: 1,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Aloha',
      description: 'Mix de quesos, salsa alfredo, tocino y piña.',
      prices: { cm20: 155, cm30: 195 },
      sortOrder: 2,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Vegetariana',
      description:
        'Mix de quesos, salsa de tomate, morrón, aceitunas negras, elote amarillo, espinacas, champiñones, cebolla y queso de cabra.',
      prices: { cm20: 150, cm30: 200 },
      sortOrder: 3,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Tex mex',
      description: 'Mozzarella, salsa alfredo, chorizo, elote, cebolla, carne molida.',
      prices: { cm20: 150, cm30: 200 },
      sortOrder: 4,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Carnicera',
      description: 'Mozzarella, salsa de tomate, chorizo español, tocino y pepperoni.',
      prices: { cm20: 135, cm30: 185 },
      sortOrder: 5,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Benedella',
      description: 'Mozzarella, salsa de tomate, jamón y tocino.',
      prices: { cm20: 145, cm30: 190 },
      sortOrder: 6,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Delux',
      description:
        'Mix de quesos, salsa de tomate, cebolla, aceitunas negras, champiñones, pimiento verde, pepperoni y carne.',
      prices: { cm20: 160, cm30: 220 },
      sortOrder: 7,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Quesos',
      description: 'Salsa de tomate, mozzarella, manchego y parmesano.',
      prices: { cm20: 130, cm30: 175 },
      sortOrder: 8,
      isActive: true,
    },
    {
      category: 'Pizza Artesanal',
      name: 'Parrillera',
      description: 'Mozzarella, salsa de tomate, chorizo español, chorizo argentino y salchicha asadera.',
      prices: { cm20: 160, cm30: 210 },
      sortOrder: 9,
      isActive: true,
    },

    { category: 'Calzone', name: 'Peppecham', description: 'Mix de quesos, pepperoni y champiñones.', price: 130, sortOrder: 1, isActive: true },
    { category: 'Calzone', name: 'Alfredo', description: 'Mix de quesos, salsa alfredo, jamón, espinaca y cebolla.', price: 130, sortOrder: 2, isActive: true },

    { category: 'Pasta', name: 'Pasta del Día', price: 120, sortOrder: 1, isActive: true },

    { category: 'Pan Artesanal', name: 'Pan con ajo', price: 55, sortOrder: 1, isActive: true },
    { category: 'Pan Artesanal', name: 'Pan con champiñones', price: 65, sortOrder: 2, isActive: true },
    { category: 'Pan Artesanal', name: 'Pan combinados', price: 75, sortOrder: 3, isActive: true },

    { category: 'Sodas Italianas y Preparadas', name: 'Soda de fresa', price: 60, sortOrder: 1, isActive: true },
    { category: 'Sodas Italianas y Preparadas', name: 'Soda de mora', price: 60, sortOrder: 2, isActive: true },
    { category: 'Sodas Italianas y Preparadas', name: 'Soda de manzana', price: 60, sortOrder: 3, isActive: true },
    { category: 'Sodas Italianas y Preparadas', name: 'Limonada Eléctrica', price: 60, sortOrder: 4, isActive: true },
    { category: 'Sodas Italianas y Preparadas', name: 'Mojito azul', price: 70, sortOrder: 5, isActive: true },
    { category: 'Sodas Italianas y Preparadas', name: 'Flotante', price: 70, sortOrder: 6, isActive: true },

    { category: 'Bebidas Naturales', name: 'Agua de temporada', price: 40, sortOrder: 1, isActive: true },
    { category: 'Bebidas Naturales', name: 'Fresa con limón', price: 40, sortOrder: 2, isActive: true },
    { category: 'Bebidas Naturales', name: 'Jamaica con vainilla', price: 40, sortOrder: 3, isActive: true },
    { category: 'Bebidas Naturales', name: 'Té negro frío', price: 40, sortOrder: 4, isActive: true },

    { category: 'Refrescos', name: 'Coca cola / Coca cola light', price: 40, sortOrder: 1, isActive: true },
    { category: 'Refrescos', name: 'Sidral Mundet', price: 40, sortOrder: 2, isActive: true },
    { category: 'Refrescos', name: 'Fresca', price: 40, sortOrder: 3, isActive: true },
    { category: 'Refrescos', name: 'Agua Mineral', price: 35, sortOrder: 4, isActive: true },
    { category: 'Refrescos', name: 'Agua Natural', price: 25, sortOrder: 5, isActive: true },
  ],
}

export default function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const OPS_DEMO_KEY = 'opsDemo.v1'
  type OpsDemoState = {
    status: 'off' | 'on' | 'paused'
    startedAtMs: number | null
    lastTickMs: number | null
    operativeMs: number
    pauseMs: number
  }

  const [opsDemo, setOpsDemo] = React.useState<OpsDemoState>(() => {
    try {
      const raw = window.localStorage.getItem(OPS_DEMO_KEY)
      if (!raw) return { status: 'off', startedAtMs: null, lastTickMs: null, operativeMs: 0, pauseMs: 0 }
      const parsed = JSON.parse(raw) as Partial<OpsDemoState>
      return {
        status: parsed.status === 'on' || parsed.status === 'paused' || parsed.status === 'off' ? parsed.status : 'off',
        startedAtMs: typeof parsed.startedAtMs === 'number' ? parsed.startedAtMs : null,
        lastTickMs: typeof parsed.lastTickMs === 'number' ? parsed.lastTickMs : null,
        operativeMs: typeof parsed.operativeMs === 'number' ? parsed.operativeMs : 0,
        pauseMs: typeof parsed.pauseMs === 'number' ? parsed.pauseMs : 0,
      }
    } catch {
      return { status: 'off', startedAtMs: null, lastTickMs: null, operativeMs: 0, pauseMs: 0 }
    }
  })

  React.useEffect(() => {
    try {
      window.localStorage.setItem(OPS_DEMO_KEY, JSON.stringify(opsDemo))
    } catch {
      // ignore
    }
  }, [opsDemo])

  const [opsNow, setOpsNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setOpsNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  React.useEffect(() => {
    if (opsDemo.status === 'off') return
    setOpsDemo((prev) => {
      const nowMs = Date.now()
      const last = prev.lastTickMs ?? nowMs
      const delta = Math.max(0, nowMs - last)
      if (prev.status === 'on') {
        return { ...prev, lastTickMs: nowMs, operativeMs: prev.operativeMs + delta }
      }
      if (prev.status === 'paused') {
        return { ...prev, lastTickMs: nowMs, pauseMs: prev.pauseMs + delta }
      }
      return prev
    })
  }, [opsNow])

  const fmtHms = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }

  React.useEffect(() => {
    const title = 'Patanegra · Admin'
    const desc = 'Panel administrativo (solo personal autorizado).'
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

  const initialView = ((): 'dashboard' | 'tables' | 'editor' | 'report' => {
    const v = String(searchParams.get('v') ?? '').toLowerCase()
    if (v === 'editor' || v === 'menu') return 'editor'
    if (v === 'tables' || v === 'mesas') return 'tables'
    if (v === 'report' || v === 'reporte') return 'report'
    return 'dashboard'
  })()

  const [view, setView] = React.useState<'dashboard' | 'tables' | 'editor' | 'report'>(initialView)
  const [categories, setCategories] = React.useState<Category[]>([])
  const [items, setItems] = React.useState<Item[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null)
  const [importJson, setImportJson] = React.useState('')
  const [importBusy, setImportBusy] = React.useState(false)
  const [importMsg, setImportMsg] = React.useState<string | null>(null)

  const [opStartMs, setOpStartMs] = React.useState<number | null>(null)
  const [tabs, setTabs] = React.useState<any[]>([])
  const [orders, setOrders] = React.useState<any[]>([])
  const [now, setNow] = React.useState(() => Date.now())

  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null)

  const [reportOpen, setReportOpen] = React.useState<'day' | 'week' | 'month' | 'range' | null>(null)
  const [rangeStart, setRangeStart] = React.useState('')
  const [rangeEnd, setRangeEnd] = React.useState('')

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  React.useEffect(() => {
    const ref = doc(db, 'ops', 'current')
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as any
        const ms = data?.startAt?.toMillis ? data.startAt.toMillis() : null
        setOpStartMs(ms)
      },
      () => {
        setOpStartMs(null)
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

  React.useEffect(() => {
    const q = query(collection(db, 'menuCategories'), orderBy('sortOrder', 'asc'))
    return onSnapshot(q, (snap) => {
      const data: Category[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setCategories(data)
      setSelectedCategoryId((prev) => prev ?? data[0]?.id ?? null)
    })
  }, [])

  React.useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('sortOrder', 'asc'))
    return onSnapshot(q, (snap) => {
      const data: Item[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      setItems(data)
    })
  }, [])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null
  const selectedItems = selectedCategoryId ? items.filter((i) => i.categoryId === selectedCategoryId) : []

  const openTabs = tabs.filter((t) => t.status === 'open')
  const paidOrLegacyTabs = tabs.filter((t) => t.status === 'closed' && !(t as any)?.isVoided)

  const pendingKitchen = orders.filter((o) => o.status === 'pending' && o.area === 'kitchen').length
  const pendingBar = orders.filter((o) => o.status === 'pending' && o.area === 'bar').length

  const salesSinceOp = React.useMemo(() => {
    if (!opStartMs) return 0
    let sum = 0
    for (const t of paidOrLegacyTabs) {
      const paidAtMs = t?.paidAt?.toMillis ? t.paidAt.toMillis() : null
      const legacyAtMs = t?.closedAt?.toMillis ? t.closedAt.toMillis() : null
      const at = paidAtMs ?? legacyAtMs
      if (!at || at < opStartMs) continue
      const v = paidAtMs ? Number(t.paidTotal ?? t.total ?? 0) : Number(t.total ?? 0)
      sum += v
    }
    return sum
  }, [paidOrLegacyTabs, opStartMs])

  const report = React.useMemo(() => {
    const d = new Date(now)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
    const weekStartDate = new Date(d)
    const day = weekStartDate.getDay()
    const diff = (day + 6) % 7
    weekStartDate.setDate(weekStartDate.getDate() - diff)
    weekStartDate.setHours(0, 0, 0, 0)
    const weekStart = weekStartDate.getTime()
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime()

    let daySum = 0
    let weekSum = 0
    let monthSum = 0
    for (const t of paidOrLegacyTabs) {
      const paidAtMs = t?.paidAt?.toMillis ? t.paidAt.toMillis() : null
      const legacyAtMs = t?.closedAt?.toMillis ? t.closedAt.toMillis() : null
      const at = paidAtMs ?? legacyAtMs
      if (!at) continue
      const v = paidAtMs ? Number(t.paidTotal ?? t.total ?? 0) : Number(t.total ?? 0)
      if (at >= dayStart) daySum += v
      if (at >= weekStart) weekSum += v
      if (at >= monthStart) monthSum += v
    }
    return { daySum, weekSum, monthSum }
  }, [paidOrLegacyTabs, now])

  const reportRanges = React.useMemo(() => {
    const d = new Date(now)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
    const dayEnd = dayStart + 24 * 60 * 60 * 1000

    const weekStartDate = new Date(d)
    const day = weekStartDate.getDay()
    const diff = (day + 6) % 7
    weekStartDate.setDate(weekStartDate.getDate() - diff)
    weekStartDate.setHours(0, 0, 0, 0)
    const weekStart = weekStartDate.getTime()
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000

    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime()
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime()

    const parseRangeDate = (s: string, end: boolean) => {
      if (!s) return null
      const parts = s.split('-').map((x) => Number(x))
      if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return null
      const [yy, mm, dd] = parts
      const t = new Date(yy, mm - 1, dd, 0, 0, 0, 0).getTime()
      return end ? t + 24 * 60 * 60 * 1000 : t
    }

    const rangeStartMs = parseRangeDate(rangeStart, false)
    const rangeEndMs = parseRangeDate(rangeEnd, true)

    return {
      day: { start: dayStart, end: dayEnd, label: 'Hoy' },
      week: { start: weekStart, end: weekEnd, label: 'Semana' },
      month: { start: monthStart, end: monthEnd, label: 'Mes' },
      range: rangeStartMs != null && rangeEndMs != null ? { start: rangeStartMs, end: rangeEndMs, label: 'Rango' } : null,
    }
  }, [now, rangeStart, rangeEnd])

  const reportDetails = React.useMemo(() => {
    const byKey: Record<string, { tabs: any[]; topItems: Array<{ name: string; qty: number }>; sum: number }> = {
      day: { tabs: [], topItems: [], sum: 0 },
      week: { tabs: [], topItems: [], sum: 0 },
      month: { tabs: [], topItems: [], sum: 0 },
      range: { tabs: [], topItems: [], sum: 0 },
    }

    const compute = (key: 'day' | 'week' | 'month' | 'range', start: number, end: number) => {
      const tabsInRange = paidOrLegacyTabs
        .filter((t) => {
          const paidAtMs = t?.paidAt?.toMillis ? t.paidAt.toMillis() : null
          const legacyAtMs = t?.closedAt?.toMillis ? t.closedAt.toMillis() : null
          const ms = paidAtMs ?? legacyAtMs
          return ms != null && ms >= start && ms < end
        })
        .sort((a, b) => {
          const aMs = (a?.paidAt?.toMillis ? a.paidAt.toMillis() : a?.closedAt?.toMillis ? a.closedAt.toMillis() : 0) as number
          const bMs = (b?.paidAt?.toMillis ? b.paidAt.toMillis() : b?.closedAt?.toMillis ? b.closedAt.toMillis() : 0) as number
          return bMs - aMs
        })

      let sum = 0
      for (const t of tabsInRange) {
        const isPaid = Boolean(t?.paidAt?.toMillis)
        sum += isPaid ? Number(t.paidTotal ?? t.total ?? 0) : Number(t.total ?? 0)
      }

      const qtyByName = new Map<string, number>()
      const ordersInRange = orders.filter((o) => {
        const ms = o?.createdAt?.toMillis ? o.createdAt.toMillis() : null
        return ms != null && ms >= start && ms < end
      })
      for (const o of ordersInRange) {
        const its = Array.isArray(o.items) ? o.items : []
        for (const it of its) {
          const n = String(it?.name ?? '').trim()
          const q = Number(it?.qty ?? 0)
          if (!n || !Number.isFinite(q) || q <= 0) continue
          qtyByName.set(n, (qtyByName.get(n) ?? 0) + q)
        }
      }
      const topItems = Array.from(qtyByName.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3)

      byKey[key] = { tabs: tabsInRange, topItems, sum }
    }

    compute('day', reportRanges.day.start, reportRanges.day.end)
    compute('week', reportRanges.week.start, reportRanges.week.end)
    compute('month', reportRanges.month.start, reportRanges.month.end)
    if (reportRanges.range) compute('range', reportRanges.range.start, reportRanges.range.end)

    return byKey
  }, [paidOrLegacyTabs, orders, reportRanges])

  const downloadCsv = React.useCallback((rows: any[], filename: string) => {
    const esc = (v: any) => {
      const s = String(v ?? '')
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"', '""')}"`
      return s
    }
    const out: string[] = []
    out.push(['fecha', 'hora', 'mesa', 'cuenta', 'total_mxn'].map(esc).join(','))
    for (const t of rows) {
      const dt = t?.paidAt?.toDate ? t.paidAt.toDate() : t?.closedAt?.toDate ? t.closedAt.toDate() : null
      const dateStr = dt ? dt.toLocaleDateString('es-MX') : ''
      const timeStr = dt ? dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
      out.push([
        dateStr,
        timeStr,
        t.tableId ?? '',
        t.tabName ?? '',
        Number((t?.paidAt?.toMillis ? (t.paidTotal ?? t.total ?? 0) : (t.total ?? 0)) ?? 0).toFixed(2),
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

  React.useEffect(() => {
    const v = String(searchParams.get('v') ?? '').toLowerCase()
    const next: 'dashboard' | 'tables' | 'editor' | 'report' =
      v === 'editor' || v === 'menu'
        ? 'editor'
        : v === 'tables' || v === 'mesas'
          ? 'tables'
          : v === 'report' || v === 'reporte'
            ? 'report'
            : 'dashboard'
    setView(next)
  }, [searchParams])

  const extraTables = React.useMemo(() => {
    try {
      const raw = window.localStorage.getItem('adminTablesExtra')
      if (!raw) return { terraza: [] as string[], salon: [] as string[] }
      const data = JSON.parse(raw) as any
      return {
        terraza: Array.isArray(data?.terraza) ? data.terraza.map((x: any) => String(x)) : [],
        salon: Array.isArray(data?.salon) ? data.salon.map((x: any) => String(x)) : [],
      }
    } catch {
      return { terraza: [] as string[], salon: [] as string[] }
    }
  }, [now])

  const terraceTableIds = React.useMemo(() => {
    const base = ['terraza-01', 'terraza-02', 'terraza-03']
    const extra = extraTables.terraza.filter((x: string) => x && !base.includes(x))
    return [...base, ...extra]
  }, [extraTables.terraza])

  const salonTableIds = React.useMemo(() => {
    const base = ['salon-01', 'salon-02', 'salon-03', 'salon-04']
    const extra = extraTables.salon.filter((x: string) => x && !base.includes(x))
    return [...base, ...extra]
  }, [extraTables.salon])

  const tableLabelById: Record<string, string> = {
    'terraza-01': 'Terraza 01',
    'terraza-02': 'Terraza 02',
    'terraza-03': 'Terraza 03',
    'salon-01': 'Salón 01',
    'salon-02': 'Salón 02',
    'salon-03': 'Salón 03',
    'salon-04': 'Salón 04',
  }

  const tableLabel = React.useCallback(
    (id: string) => {
      const exact = tableLabelById[id]
      if (exact) return exact
      if (id.startsWith('togo-')) {
        const raw = id.replace('togo-', '').trim()
        const n = Number(raw)
        return Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
      }
      return id
    },
    [tableLabelById],
  )

  const openTabByTableId = React.useMemo(() => {
    const m = new Map<string, any>()
    for (const t of tabs) {
      if (t?.status !== 'open') continue
      const tableId = String(t?.tableId ?? '')
      if (!tableId) continue
      if (!m.has(tableId)) m.set(tableId, t)
    }
    return m
  }, [tabs])

  const takeoutTableIds = React.useMemo(() => {
    const ids = Array.from(openTabByTableId.keys()).filter((id) => id.startsWith('togo-'))
    return ids
      .map((id) => ({ id, n: Number(id.replace('togo-', '')) }))
      .sort((a, b) => (Number.isFinite(a.n) ? a.n : 0) - (Number.isFinite(b.n) ? b.n : 0))
      .map((x) => x.id)
  }, [openTabByTableId])

  const selectedOpenTab = React.useMemo(() => {
    if (!selectedTableId) return null
    return openTabByTableId.get(selectedTableId) ?? null
  }, [openTabByTableId, selectedTableId])

  const selectedConsumption = React.useMemo(() => {
    if (!selectedTableId) return null
    const tab = openTabByTableId.get(selectedTableId)
    if (!tab) return { items: [] as Array<{ name: string; qty: number; amount: number }>, total: 0, ordersCount: 0 }

    const openedAtMs = tab?.openedAt?.toMillis ? tab.openedAt.toMillis() : 0
    const rows = new Map<string, { name: string; qty: number; amount: number }>()
    let ordersCount = 0
    for (const o of orders) {
      const tableId = String(o?.tableId ?? '')
      if (tableId !== selectedTableId) continue
      const createdAtMs = o?.createdAt?.toMillis ? o.createdAt.toMillis() : 0
      if (openedAtMs && createdAtMs && createdAtMs < openedAtMs) continue
      ordersCount++
      const its = Array.isArray(o?.items) ? o.items : []
      for (const it of its) {
        const name = String(it?.name ?? '').trim() || 'Producto'
        const qty = Number(it?.qty ?? 0)
        if (!qty) continue
        const unit = Number(it?.unitPrice ?? it?.price ?? 0)
        const lineTotal = Number(it?.lineTotal ?? (unit ? unit * qty : 0))
        const key = name
        const prev = rows.get(key) ?? { name, qty: 0, amount: 0 }
        prev.qty += qty
        prev.amount += lineTotal
        rows.set(key, prev)
      }
    }
    const items = Array.from(rows.values()).sort((a, b) => b.amount - a.amount)
    const total = items.reduce((s, x) => s + x.amount, 0)
    return { items, total, ordersCount }
  }, [openTabByTableId, orders, selectedTableId])

  return (
    <div className="container">
      <SessionBar
        title="Admin"
        showMenuButton={false}
        rightSlot={
          <>
            <button
              className="button secondary"
              style={isActiveStyle(view === 'dashboard')}
              onClick={() => {
                setView('dashboard')
                navigate('/admin?v=dashboard')
              }}
            >
              Dashboard
            </button>

            <button
              className="button secondary"
              style={isActiveStyle(view === 'tables')}
              onClick={() => {
                setView('tables')
                navigate('/admin?v=mesas')
              }}
            >
              Mesas
            </button>

            <button className="button secondary" onClick={() => navigate('/caja')}>
              Caja
            </button>
            <button
              className="button secondary"
              style={isActiveStyle(view === 'editor')}
              onClick={() => {
                setView('editor')
                navigate('/admin?v=editor')
              }}
            >
              Menú (Config)
            </button>

            <button className="button secondary" onClick={() => navigate('/menu')}>
              Menú
            </button>
            <button
              className="button secondary"
              style={isActiveStyle(view === 'report')}
              onClick={() => {
                setView('report')
                navigate('/admin?v=report')
              }}
            >
              Reporte
            </button>
            <button className="button secondary" onClick={() => navigate('/almacen')}>
              Almacén
            </button>
          </>
        }
      />

      {view === 'dashboard' ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900 }}>Dashboard</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Inicio de operación:{' '}
                {opStartMs ? <strong style={{ color: '#111827' }}>{new Date(opStartMs).toLocaleString('es-MX')}</strong> : 'No iniciado'}
              </div>
            </div>

            <button
              className="button secondary"
              onClick={async () => {
                await setDoc(doc(db, 'ops', 'current'), { startAt: serverTimestamp() }, { merge: true })
              }}
            >
              Iniciar operación
            </button>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div
              className="card"
              style={{
                margin: 0,
                cursor: 'pointer',
                border: '1px solid rgba(0,0,0,0.08)',
                background:
                  opsDemo.status === 'on'
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))'
                    : opsDemo.status === 'paused'
                      ? 'linear-gradient(135deg, rgba(245,158,11,0.20), rgba(245,158,11,0.08))'
                      : 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08))',
              }}
              onClick={() => {
                setOpsDemo((prev) => {
                  const nowMs = Date.now()
                  if (prev.status === 'off') {
                    return {
                      status: 'on',
                      startedAtMs: nowMs,
                      lastTickMs: nowMs,
                      operativeMs: prev.operativeMs,
                      pauseMs: prev.pauseMs,
                    }
                  }
                  if (prev.status === 'on') return { ...prev, status: 'paused', lastTickMs: nowMs }
                  return { ...prev, status: 'on', lastTickMs: nowMs }
                })
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                ;(e.currentTarget as any).click?.()
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Operación</div>
                  <div style={{ fontWeight: 950, fontSize: 22, color: '#111827' }}>
                    {opsDemo.status === 'on' ? 'ON' : opsDemo.status === 'paused' ? 'PAUSA' : 'OFF'}
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    Inició:{' '}
                    {opsDemo.startedAtMs ? (
                      <strong style={{ color: '#111827' }}>{new Date(opsDemo.startedAtMs).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</strong>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="button secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpsDemo((prev) => {
                        if (prev.status === 'off') {
                          const nowMs = Date.now()
                          return { ...prev, status: 'on', startedAtMs: nowMs, lastTickMs: nowMs }
                        }
                        if (prev.status === 'on') return { ...prev, status: 'paused', lastTickMs: Date.now() }
                        return { ...prev, status: 'on', lastTickMs: Date.now() }
                      })
                    }}
                  >
                    {opsDemo.status === 'off' ? 'Encender' : opsDemo.status === 'on' ? 'Pausar' : 'Reanudar'}
                  </button>
                  <button
                    className="button secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpsDemo((prev) => ({ ...prev, status: 'off', lastTickMs: null }))
                    }}
                  >
                    Apagar
                  </button>
                </div>
              </div>

              <div style={{ height: 10 }} />
              <div className="muted" style={{ fontSize: 12 }}>Operativo: {fmtHms(opsDemo.operativeMs)}</div>
              <div className="muted" style={{ fontSize: 12 }}>Pausa: {fmtHms(opsDemo.pauseMs)}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Toca la tarjeta para pausar/reanudar.</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Cuentas abiertas</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{openTabs.length}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Órdenes pendientes (Cocina)</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{pendingKitchen}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Órdenes pendientes (Barra)</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{pendingBar}</div>
            </div>
            {user?.role === 'admin' || user?.role === 'piso' ? (
              <div className="card" style={{ margin: 0 }}>
                <div className="muted" style={{ fontSize: 12 }}>Pendientes</div>
                <button
                  className="button secondary"
                  disabled={pendingKitchen + pendingBar === 0}
                  onClick={async () => {
                    const n = pendingKitchen + pendingBar
                    if (!n) return
                    const ok = window.confirm(`Esto borrará ${n} órdenes pendientes (cocina/barra). ¿Continuar?`)
                    if (!ok) return

                    const toDelete = orders.filter((o) => {
                      if (o.status !== 'pending') return false
                      if (o.area !== 'kitchen' && o.area !== 'bar') return false
                      return true
                    })

                    const batch = writeBatch(db)
                    for (const o of toDelete) {
                      const id = String((o as any)?.id ?? '').trim()
                      if (!id) continue
                      batch.delete(doc(db, 'orders', id))
                    }
                    await batch.commit()
                  }}
                >
                  Borrar pendientes
                </button>

                <div style={{ height: 8 }} />

                <button
                  className="button secondary"
                  onClick={async () => {
                    const legacy = orders.filter((o) => {
                      const status = String((o as any)?.status ?? '')
                      if (status === 'resolved') return false
                      const tableId = String((o as any)?.tableId ?? '')
                      if (!tableId) return false
                      if (tableId.startsWith('terraza-')) return true
                      if (tableId.startsWith('salon-')) return true
                      return false
                    })

                    const n = legacy.length
                    if (!n) {
                      window.alert('No hay órdenes antiguas (terraza/salón) por resolver.')
                      return
                    }

                    const ok = window.confirm(`Esto marcará como resueltas ${n} órdenes antiguas (terraza/salón). ¿Continuar?`)
                    if (!ok) return

                    const ids = legacy.map((o) => String((o as any)?.id ?? '').trim()).filter(Boolean)
                    if (!ids.length) return

                    const chunks: string[][] = []
                    for (let i = 0; i < ids.length; i += 450) chunks.push(ids.slice(i, i + 450))
                    for (const chunk of chunks) {
                      const batch = writeBatch(db)
                      for (const id of chunk) {
                        batch.update(doc(db, 'orders', id), {
                          status: 'resolved',
                          resolvedAt: serverTimestamp(),
                          resolvedByUid: user?.uid ?? null,
                          resolvedByName: user?.displayName ?? user?.email ?? null,
                        })
                      }
                      await batch.commit()
                    }
                  }}
                >
                  Resolver antiguas (terraza/salón)
                </button>

                <div style={{ height: 8 }} />

                <div className="muted" style={{ fontSize: 12 }}>Ventas</div>
                <button
                  className="button secondary"
                  disabled={paidOrLegacyTabs.length === 0}
                  onClick={async () => {
                    const n = paidOrLegacyTabs.length
                    if (!n) return
                    const ok = window.confirm(`Esto borrará ${n} cuentas cerradas (ventas). ¿Continuar?`)
                    if (!ok) return

                    const ids = paidOrLegacyTabs.map((t) => String((t as any)?.id ?? '').trim()).filter(Boolean)
                    if (!ids.length) return

                    const chunks: string[][] = []
                    for (let i = 0; i < ids.length; i += 450) chunks.push(ids.slice(i, i + 450))
                    for (const chunk of chunks) {
                      const batch = writeBatch(db)
                      for (const id of chunk) {
                        batch.update(doc(db, 'tabs', id), { isVoided: true, voidedAt: serverTimestamp(), voidedByUid: user?.uid ?? null })
                      }
                      await batch.commit()
                    }
                  }}
                >
                  Borrar ventas
                </button>
              </div>
            ) : null}
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Ventas al momento (operación)</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(salesSinceOp)}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Ventas hoy (tiempo real)</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.daySum)}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Semana</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.weekSum)}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Mes</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.monthSum)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {view === 'tables' ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900 }}>Mesas</div>
              <div className="muted" style={{ fontSize: 12 }}>Croquis rápido (Salón / Terraza). Toca una mesa para ver el consumo.</div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                className="button secondary"
                onClick={() => {
                  navigate('/menu?togo=1')
                }}
              >
                Para llevar +
              </button>

              <button
                className="button secondary"
                onClick={() => {
                  const areaRaw = String(window.prompt('Área: terraza o salon', 'terraza') ?? '').trim().toLowerCase()
                  const area = areaRaw === 'salon' || areaRaw === 'salón' ? 'salon' : 'terraza'
                  const id = String(window.prompt('ID de mesa (ej. terraza-05 o salon-05)', '') ?? '').trim()
                  if (!id) return
                  try {
                    const raw = window.localStorage.getItem('adminTablesExtra')
                    const data = raw ? (JSON.parse(raw) as any) : {}
                    const next = {
                      terraza: Array.isArray(data?.terraza) ? data.terraza.map((x: any) => String(x)) : [],
                      salon: Array.isArray(data?.salon) ? data.salon.map((x: any) => String(x)) : [],
                    }
                    const list = area === 'salon' ? next.salon : next.terraza
                    if (!list.includes(id)) list.push(id)
                    window.localStorage.setItem('adminTablesExtra', JSON.stringify(next))
                    setNow(Date.now())
                  } catch {
                    // ignore
                  }
                }}
              >
                + Agregar mesa
              </button>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Para llevar</div>
              {!takeoutTableIds.length ? <div className="muted">Sin cuentas para llevar abiertas.</div> : null}
              {takeoutTableIds.length ? (
                <div className="card" style={{ margin: 0, padding: 10, borderColor: 'rgba(239, 68, 68, 0.25)' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {takeoutTableIds.map((id) => {
                      const t = openTabByTableId.get(id)
                      const total = Number(t?.total ?? 0)
                      const openedAtMs = t?.openedAt?.toMillis ? t.openedAt.toMillis() : null
                      const openedAtStr = openedAtMs != null ? formatClock(openedAtMs) : null
                      const selected = selectedTableId === id
                      return (
                        <button
                          key={id}
                          className="row"
                          style={{
                            justifyContent: 'space-between',
                            gap: 12,
                            width: '100%',
                            textAlign: 'left',
                            padding: 10,
                            borderRadius: 12,
                            border: `1px solid ${selected ? '#111827' : 'rgba(239, 68, 68, 0.18)'}`,
                            background: selected ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.92)',
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedTableId(id)}
                        >
                          <div>
                            <div style={{ fontWeight: 950 }}>{t?.tabName ? String(t.tabName) : tableLabel(id)}</div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {openedAtStr ? `Abierta · ${openedAtStr} · ${money(total)}` : `Abierta · ${money(total)}`}
                            </div>
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>{id}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Terraza</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {terraceTableIds.map((id) => {
                  const t = openTabByTableId.get(id)
                  const isOpen = Boolean(t)
                  const total = Number(t?.total ?? 0)
                  const openedAtMs = t?.openedAt?.toMillis ? t.openedAt.toMillis() : null
                  const openedAtStr = openedAtMs != null ? formatClock(openedAtMs) : null
                  return (
                    <button
                      key={id}
                      className="card"
                      style={{
                        margin: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderColor: selectedTableId === id ? '#111827' : isOpen ? '#fca5a5' : '#e5e7eb',
                      }}
                      onClick={() => setSelectedTableId(id)}
                    >
                      <div style={{ fontWeight: 950 }}>{tableLabel(id)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {isOpen ? (openedAtStr ? `Abierta · ${openedAtStr} · ${money(total)}` : `Abierta · ${money(total)}`) : 'Libre'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Salón</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {salonTableIds.map((id) => {
                  const t = openTabByTableId.get(id)
                  const isOpen = Boolean(t)
                  const total = Number(t?.total ?? 0)
                  const openedAtMs = t?.openedAt?.toMillis ? t.openedAt.toMillis() : null
                  const openedAtStr = openedAtMs != null ? formatClock(openedAtMs) : null
                  return (
                    <button
                      key={id}
                      className="card"
                      style={{
                        margin: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderColor: isOpen ? 'rgba(216, 31, 38, 0.55)' : 'rgba(11, 11, 11, 0.10)',
                        background: isOpen ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.90)',
                      }}
                      onClick={() => setSelectedTableId(id)}
                    >
                      <div style={{ fontWeight: 950 }}>{tableLabel(id)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {isOpen ? (openedAtStr ? `Abierta · ${openedAtStr} · ${money(total)}` : `Abierta · ${money(total)}`) : 'Libre'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedTableId ? (
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      Detalle · {selectedOpenTab?.tabName ? String(selectedOpenTab.tabName) : tableLabel(selectedTableId)}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {selectedOpenTab ? `Cuenta abierta · ${selectedConsumption?.ordersCount ?? 0} comanda(s)` : 'Sin cuenta abierta'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="button secondary" onClick={() => navigate(`/caja?mesa=${encodeURIComponent(selectedTableId)}`)}>
                      Abrir en Caja
                    </button>
                    <button className="button secondary" onClick={() => setSelectedTableId(null)}>
                      Cerrar
                    </button>
                  </div>
                </div>

                {selectedOpenTab ? (
                  <>
                    <div style={{ height: 10 }} />
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="muted" style={{ fontSize: 12 }}>Consumo calculado por `orders.items`.</div>
                      <div style={{ fontWeight: 950 }}>{money(selectedConsumption?.total ?? 0)}</div>
                    </div>
                    <div style={{ height: 10 }} />
                    {selectedConsumption?.items?.length ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {selectedConsumption.items.map((x) => (
                          <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{x.name}</div>
                              <div className="muted" style={{ fontSize: 12 }}>x{x.qty}</div>
                            </div>
                            <div style={{ fontWeight: 900 }}>{money(x.amount)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted">Aún no hay consumo registrado en comandas.</div>
                    )}
                  </>
                ) : (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Esta mesa está libre.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === 'report' ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900 }}>Reporte</div>
              <div className="muted" style={{ fontSize: 12 }}>Día en vivo, semana y mes acumulados.</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <button
              type="button"
              aria-label="Ver detalle de Hoy"
              className="card"
              style={{ margin: 0, textAlign: 'left', cursor: 'pointer', transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onFocus={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onBlur={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onClick={() => setReportOpen((p) => (p === 'day' ? null : 'day'))}
            >
              <div className="muted" style={{ fontSize: 12 }}>Hoy</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.daySum)}</div>
            </button>
            <button
              type="button"
              aria-label="Ver detalle de Semana"
              className="card"
              style={{ margin: 0, textAlign: 'left', cursor: 'pointer', transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onFocus={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onBlur={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onClick={() => setReportOpen((p) => (p === 'week' ? null : 'week'))}
            >
              <div className="muted" style={{ fontSize: 12 }}>Semana</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.weekSum)}</div>
            </button>
            <button
              type="button"
              aria-label="Ver detalle de Mes"
              className="card"
              style={{ margin: 0, textAlign: 'left', cursor: 'pointer', transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onFocus={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onBlur={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onClick={() => setReportOpen((p) => (p === 'month' ? null : 'month'))}
            >
              <div className="muted" style={{ fontSize: 12 }}>Mes</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(report.monthSum)}</div>
            </button>
            <button
              type="button"
              aria-label="Ver detalle de Rango"
              className="card"
              style={{
                margin: 0,
                textAlign: 'left',
                cursor: reportRanges.range ? 'pointer' : 'not-allowed',
                opacity: reportRanges.range ? 1 : 0.6,
                transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
              }}
              disabled={!reportRanges.range}
              onMouseEnter={(e) => {
                if (!reportRanges.range) return
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onFocus={(e) => {
                if (!reportRanges.range) return
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)'
                e.currentTarget.style.borderColor = '#111827'
              }}
              onBlur={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              onClick={() => setReportOpen((p) => (p === 'range' ? null : 'range'))}
            >
              <div className="muted" style={{ fontSize: 12 }}>Rango</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{money(reportDetails.range.sum)}</div>
            </button>
          </div>

          <div style={{ height: 10 }} />

          <div className="card" style={{ margin: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 900 }}>Rango personalizado</div>
              <div className="muted" style={{ fontSize: 12 }}>Selecciona fechas y toca la card “Rango”.</div>
            </div>
            <div style={{ height: 10 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input className="input" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              <input className="input" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
          </div>

          <div style={{ height: 12 }} />

          {reportOpen ? (
            <div className="card" style={{ margin: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>Detalle · {reportOpen === 'day' ? 'Hoy' : reportOpen === 'week' ? 'Semana' : reportOpen === 'month' ? 'Mes' : 'Rango'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {reportDetails[reportOpen].tabs.length} venta(s) · Top productos: {reportDetails[reportOpen].topItems.length ? reportDetails[reportOpen].topItems.map((x) => `${x.name} (${x.qty})`).join(' · ') : '—'}
                  </div>
                </div>
                <button
                  className="button secondary"
                  onClick={() => downloadCsv(reportDetails[reportOpen].tabs, `reporte_${reportOpen}_${new Date(now).toISOString().slice(0, 10)}.csv`)}
                >
                  Descargar CSV
                </button>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ display: 'grid', gap: 8 }}>
                {reportDetails[reportOpen].tabs.length === 0 ? <div className="muted">Sin ventas en este rango.</div> : null}
                {reportDetails[reportOpen].tabs.slice(0, 200).map((t) => (
                  <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t.tableId ?? '—'}{t.tabName ? ` · ${t.tabName}` : ''} ·{' '}
                      {t?.closedAt?.toDate ? t.closedAt.toDate().toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
                    </div>
                    <div style={{ fontWeight: 900 }}>{money(Number(t.total ?? 0))}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ height: 12 }} />

          <div className="card" style={{ margin: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 900 }}>Top 3 productos (hoy)</div>
              <div className="muted" style={{ fontSize: 12 }}>Basado en comandas (`orders`).</div>
            </div>
            <div style={{ height: 10 }} />
            {reportDetails.day.topItems.length === 0 ? <div className="muted">Sin datos de productos hoy.</div> : null}
            <div style={{ display: 'grid', gap: 8 }}>
              {reportDetails.day.topItems.map((x) => (
                <div key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>{x.name}</div>
                  <div style={{ fontWeight: 900 }}>x{x.qty}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {view === 'editor' ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Editor de menú</strong>
            <button
              className="button"
              onClick={async () => {
                const nextSortOrder = categories.length ? Math.max(...categories.map((c) => Number(c.sortOrder ?? 0))) + 1 : 1
                const ref = await addDoc(collection(db, 'menuCategories'), {
                  name: 'Nueva categoría',
                  sortOrder: nextSortOrder,
                  isActive: true,
                })
                setSelectedCategoryId(ref.id)
              }}
            >
              + Categoría
            </button>
          </div>

        <div style={{ height: 12 }} />

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Importar carta (JSON)</strong>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="button secondary"
                disabled={importBusy}
                onClick={() => {
                  setImportMsg(null)
                  setImportJson(JSON.stringify(PRESET_MENU_IMPORT_PAYLOAD, null, 2))
                }}
              >
                Cargar carta (precios)
              </button>
              <button
                className="button"
                disabled={importBusy}
                onClick={async () => {
                setImportMsg(null)
                let payload: MenuImportPayload
                try {
                  payload = JSON.parse(importJson) as MenuImportPayload
                } catch {
                  setImportMsg('JSON inválido.')
                  return
                }

                if (!payload?.categories?.length || !payload?.items?.length) {
                  setImportMsg('El JSON debe incluir categories[] e items[].')
                  return
                }

                setImportBusy(true)
                try {
                  const batch = writeBatch(db)

                  const categoryIdByName = new Map<string, string>()
                  const sortedCategories = [...payload.categories]
                  for (let i = 0; i < sortedCategories.length; i++) {
                    const c = sortedCategories[i]
                    const id = slug(c.name)
                    categoryIdByName.set(c.name.trim().toLowerCase(), id)
                    batch.set(doc(db, 'menuCategories', id), {
                      name: c.name,
                      sortOrder: Number(c.sortOrder ?? i + 1),
                      isActive: c.isActive ?? true,
                    })
                  }

                  const sortedItems = [...payload.items]
                  for (let i = 0; i < sortedItems.length; i++) {
                    const it = sortedItems[i]
                    const catKey = it.category.trim().toLowerCase()
                    const categoryId = categoryIdByName.get(catKey) ?? slug(it.category)
                    const itemId = `${categoryId}__${slug(it.name)}`

                    const docData: any = {
                      categoryId,
                      name: it.name,
                      description: it.description ?? '',
                      sortOrder: Number(it.sortOrder ?? i + 1),
                      isActive: it.isActive ?? true,
                    }

                    if (it.prices && (typeof it.prices.cm20 === 'number' || typeof it.prices.cm30 === 'number')) {
                      docData.prices = {
                        cm30: typeof it.prices.cm30 === 'number' ? Number(it.prices.cm30) : null,
                        cm20: typeof it.prices.cm20 === 'number' ? Number(it.prices.cm20) : null,
                      }
                      docData.price = null
                    } else {
                      docData.price = Number(it.price ?? 0)
                      docData.prices = null
                    }

                    if (typeof it.promoPercent === 'number' && it.promoPercent > 0) {
                      docData.promoPercent = Number(it.promoPercent)
                      docData.promoLabel = it.promoLabel ?? 'Descuento'
                    } else {
                      docData.promoPercent = null
                      docData.promoLabel = null
                    }

                    batch.set(doc(db, 'menuItems', itemId), docData)
                  }

                  await batch.commit()
                  setImportMsg('Importación completada. Revisa /menu.')
                } catch {
                  setImportMsg('No se pudo importar. Revisa permisos y formato.')
                } finally {
                  setImportBusy(false)
                }
                }}
              >
                Importar / Actualizar
              </button>
            </div>
          </div>

          {importMsg ? <div className="muted" style={{ marginTop: 8 }}>{importMsg}</div> : null}
          <div style={{ height: 10 }} />
          <textarea
            className="input"
            style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 }}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"categories":[{"name":"Pizzas"}],"items":[{"category":"Pizzas","name":"Pepperoni","prices":{"cm30":145,"cm20":110}}]}'
          />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
          <div className="card">
            <div className="muted">Categorías</div>
            <div style={{ height: 10 }} />
            <div style={{ display: 'grid', gap: 8 }}>
              {categories.map((c) => {
                const active = c.id === selectedCategoryId
                return (
                  <button
                    key={c.id}
                    className={`button secondary`}
                    style={{
                      justifyContent: 'space-between',
                      display: 'flex',
                      opacity: c.isActive ? 1 : 0.55,
                      borderColor: active ? '#111827' : '#e5e7eb',
                    }}
                    onClick={() => setSelectedCategoryId(c.id)}
                  >
                    <span style={{ textAlign: 'left' }}>{c.name}</span>
                    <span className="muted">{c.sortOrder}</span>
                  </button>
                )
              })}

              {categories.length === 0 ? <div className="muted">Sin categorías.</div> : null}
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="muted">Categoría seleccionada</div>
                <div style={{ height: 4 }} />
                <strong>{selectedCategory?.name ?? '—'}</strong>
              </div>
              <div className="row">
                <button
                  className="button secondary"
                  disabled={!selectedCategory}
                  onClick={async () => {
                    if (!selectedCategory) return
                    await updateDoc(doc(db, 'menuCategories', selectedCategory.id), {
                      isActive: !selectedCategory.isActive,
                    })
                  }}
                >
                  {selectedCategory?.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  className="button secondary"
                  disabled={!selectedCategory}
                  onClick={async () => {
                    if (!selectedCategory) return
                    const ok = window.confirm('¿Eliminar categoría? No elimina productos automáticamente.')
                    if (!ok) return
                    await deleteDoc(doc(db, 'menuCategories', selectedCategory.id))
                    setSelectedCategoryId(null)
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label>Nombre</label>
                <input
                  className="input"
                  value={selectedCategory?.name ?? ''}
                  disabled={!selectedCategory}
                  onChange={(e) => {
                    if (!selectedCategory) return
                    setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, name: e.target.value } : c)))
                  }}
                  onBlur={async () => {
                    if (!selectedCategory) return
                    await updateDoc(doc(db, 'menuCategories', selectedCategory.id), {
                      name: selectedCategory.name,
                    })
                  }}
                />
              </div>

              <div>
                <label>Orden</label>
                <input
                  className="input"
                  type="number"
                  value={selectedCategory?.sortOrder ?? 0}
                  disabled={!selectedCategory}
                  onChange={(e) => {
                    if (!selectedCategory) return
                    const v = Number(e.target.value)
                    setCategories((prev) => prev.map((c) => (c.id === selectedCategory.id ? { ...c, sortOrder: v } : c)))
                  }}
                  onBlur={async () => {
                    if (!selectedCategory) return
                    await updateDoc(doc(db, 'menuCategories', selectedCategory.id), {
                      sortOrder: Number(selectedCategory.sortOrder ?? 0),
                    })
                  }}
                />
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Productos</strong>
              <button
                className="button"
                disabled={!selectedCategoryId}
                onClick={async () => {
                  if (!selectedCategoryId) return
                  const nextSortOrder = selectedItems.length
                    ? Math.max(...selectedItems.map((i) => Number(i.sortOrder ?? 0))) + 1
                    : 1
                  await addDoc(collection(db, 'menuItems'), {
                    categoryId: selectedCategoryId,
                    name: 'Nuevo producto',
                    description: '',
                    price: 0,
                    sortOrder: nextSortOrder,
                    isActive: true,
                  })
                }}
              >
                + Producto
              </button>
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gap: 12 }}>
              {selectedItems.map((it) => (
                <div key={it.id} className="card" style={{ opacity: it.isActive ? 1 : 0.55 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{it.name}</strong>
                    <div className="row">
                      <button
                        className="button secondary"
                        onClick={async () => {
                          await updateDoc(doc(db, 'menuItems', it.id), { isActive: !it.isActive })
                        }}
                      >
                        {it.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          const ok = window.confirm('¿Eliminar producto?')
                          if (!ok) return
                          await deleteDoc(doc(db, 'menuItems', it.id))
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label>Nombre</label>
                      <input
                        className="input"
                        defaultValue={it.name}
                        onBlur={async (e) => {
                          await updateDoc(doc(db, 'menuItems', it.id), { name: e.target.value })
                        }}
                      />
                    </div>

                    <div>
                      <label>Descripción</label>
                      <input
                        className="input"
                        defaultValue={it.description ?? ''}
                        onBlur={async (e) => {
                          await updateDoc(doc(db, 'menuItems', it.id), { description: e.target.value })
                        }}
                      />
                    </div>

                    <div className="row">
                      <div style={{ flex: 1 }}>
                        <label>Precios</label>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div className="row" style={{ alignItems: 'flex-end' }}>
                            <label style={{ width: 140 }}>
                              <input
                                type="checkbox"
                                defaultChecked={hasSizes(it)}
                                onChange={async (e) => {
                                  const enabled = e.target.checked
                                  if (!enabled) {
                                    await updateDoc(doc(db, 'menuItems', it.id), { prices: null })
                                    return
                                  }

                                  await updateDoc(doc(db, 'menuItems', it.id), {
                                    prices: {
                                      cm30: Number(it.prices?.cm30 ?? it.price ?? 0),
                                      cm20: Number(it.prices?.cm20 ?? 0),
                                    },
                                  })
                                }}
                              />{' '}
                              Usar 20/30cm
                            </label>

                            {!hasSizes(it) ? (
                              <div style={{ flex: 1 }}>
                                <input
                                  className="input"
                                  type="number"
                                  step="0.01"
                                  defaultValue={Number(it.price ?? 0)}
                                  onBlur={async (e) => {
                                    await updateDoc(doc(db, 'menuItems', it.id), { price: Number(e.target.value) })
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="muted" style={{ fontSize: 12 }}>
                                Edita abajo los 2 precios
                              </div>
                            )}
                          </div>

                          {hasSizes(it) ? (
                            <div className="row">
                              <div style={{ flex: 1 }}>
                                <label>30 cm</label>
                                <input
                                  className="input"
                                  type="number"
                                  step="0.01"
                                  defaultValue={Number(it.prices?.cm30 ?? 0)}
                                  onBlur={async (e) => {
                                    await updateDoc(doc(db, 'menuItems', it.id), {
                                      prices: {
                                        cm30: Number(e.target.value),
                                        cm20: Number(it.prices?.cm20 ?? 0),
                                      },
                                    })
                                  }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label>20 cm</label>
                                <input
                                  className="input"
                                  type="number"
                                  step="0.01"
                                  defaultValue={Number(it.prices?.cm20 ?? 0)}
                                  onBlur={async (e) => {
                                    await updateDoc(doc(db, 'menuItems', it.id), {
                                      prices: {
                                        cm30: Number(it.prices?.cm30 ?? 0),
                                        cm20: Number(e.target.value),
                                      },
                                    })
                                  }}
                                />
                              </div>
                            </div>
                          ) : null}

                          <div className="row" style={{ alignItems: 'flex-end' }}>
                            <label style={{ width: 240 }}>
                              <input
                                type="checkbox"
                                defaultChecked={typeof it.promoPercent === 'number' && it.promoPercent > 0}
                                onChange={async (e) => {
                                  const enabled = e.target.checked
                                  await updateDoc(doc(db, 'menuItems', it.id), {
                                    promoPercent: enabled ? Number(it.promoPercent ?? 30) : null,
                                    promoLabel: enabled ? (it.promoLabel ?? 'Descuento') : null,
                                  })
                                }}
                              />{' '}
                              Promo (% descuento)
                            </label>

                            <div style={{ width: 140 }}>
                              <label>%</label>
                              <input
                                className="input"
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                defaultValue={Number(it.promoPercent ?? 30)}
                                onBlur={async (e) => {
                                  await updateDoc(doc(db, 'menuItems', it.id), { promoPercent: Number(e.target.value) })
                                }}
                              />
                            </div>

                            <div style={{ flex: 1 }}>
                              <label>Texto</label>
                              <input
                                className="input"
                                defaultValue={it.promoLabel ?? 'Descuento'}
                                onBlur={async (e) => {
                                  await updateDoc(doc(db, 'menuItems', it.id), { promoLabel: e.target.value })
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ width: 140 }}>
                        <label>Orden</label>
                        <input
                          className="input"
                          type="number"
                          defaultValue={Number(it.sortOrder ?? 0)}
                          onBlur={async (e) => {
                            await updateDoc(doc(db, 'menuItems', it.id), { sortOrder: Number(e.target.value) })
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {selectedCategoryId && selectedItems.length === 0 ? (
                <div className="muted">Sin productos en esta categoría.</div>
              ) : null}
              {!selectedCategoryId ? <div className="muted">Selecciona una categoría.</div> : null}
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </div>
  )
}
