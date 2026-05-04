import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SessionBar from '../components/SessionBar'
import { useAuth } from '../auth/AuthProvider'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
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

type MenuExtra = {
  id: string
  name: string
  group: string
  unitPrice: number
  sortOrder: number
  isActive: boolean
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

function toMillisMaybe(ts: any) {
  try {
    if (!ts) return null
    if (typeof ts.toMillis === 'function') return ts.toMillis()
    if (typeof ts === 'number') return ts
    return null
  } catch {
    return null
  }
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
  const [extras, setExtras] = React.useState<MenuExtra[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null)
  const [importJson, setImportJson] = React.useState('')
  const [importBusy, setImportBusy] = React.useState(false)
  const [importMsg, setImportMsg] = React.useState<string | null>(null)

  const [opStartMs, setOpStartMs] = React.useState<number | null>(null)
  const [tabs, setTabs] = React.useState<any[]>([])
  const [orders, setOrders] = React.useState<any[]>([])
  const [orderVoids, setOrderVoids] = React.useState<any[]>([])
  const [now, setNow] = React.useState(() => Date.now())

  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null)

  const [reportOpen, setReportOpen] = React.useState<'day' | 'week' | 'month' | 'range' | null>(null)
  const [rangeStart, setRangeStart] = React.useState('')
  const [rangeEnd, setRangeEnd] = React.useState('')
  const [reportDayMs, setReportDayMs] = React.useState<number | null>(null)
  const [reportExpandedTabId, setReportExpandedTabId] = React.useState<string | null>(null)
  const [reportSubView, setReportSubView] = React.useState<'summary' | 'top' | 'waiters'>('summary')
  const [reportExpandedStaffKey, setReportExpandedStaffKey] = React.useState<string | null>(null)

  const [reportTabs, setReportTabs] = React.useState<any[]>([])
  const [reportOrders, setReportOrders] = React.useState<any[]>([])
  const [reportLoadedAtMs, setReportLoadedAtMs] = React.useState<number | null>(null)

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
    const needsReportData = view === 'report' || Boolean(reportOpen)
    if (!needsReportData) return

    const nowMs = Date.now()
    if (reportLoadedAtMs != null && nowMs - reportLoadedAtMs < 60_000) return

    let alive = true
    ;(async () => {
      try {
        const sinceMs = nowMs - 60 * 24 * 60 * 60 * 1000
        const sinceTs = Timestamp.fromMillis(sinceMs)

        const [tabsSnap, ordersSnap] = await Promise.all([
          getDocs(query(collection(db, 'tabs'), where('openedAt', '>=', sinceTs), orderBy('openedAt', 'desc'))),
          getDocs(query(collection(db, 'orders'), where('createdAt', '>=', sinceTs), orderBy('createdAt', 'desc'))),
        ])

        if (!alive) return
        setReportTabs(tabsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
        setReportOrders(ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
        setReportLoadedAtMs(nowMs)
      } catch {
        if (!alive) return
        setReportTabs([])
        setReportOrders([])
        setReportLoadedAtMs(nowMs)
      }
    })()

    return () => {
      alive = false
    }
  }, [reportLoadedAtMs, reportOpen, view])

  React.useEffect(() => {
    const q = query(collection(db, 'tabs'), where('status', '==', 'open'))
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
    const q = query(collection(db, 'orders'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'))
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

  React.useEffect(() => {
    const q = query(collection(db, 'menuExtras'), orderBy('sortOrder', 'asc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: MenuExtra[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        setExtras(data)
      },
      () => {
        setExtras([])
      },
    )
  }, [])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null
  const selectedItems = selectedCategoryId ? items.filter((i) => i.categoryId === selectedCategoryId) : []

  const openTabs = tabs.filter((t) => t.status === 'open')
  const paidOrLegacyTabs = reportTabs.filter((t) => t.status === 'closed' && !(t as any)?.isVoided)

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
    const byKey: Record<
      string,
      {
        tabs: any[]
        topItems: Array<{ name: string; qty: number }>
        sum: number
        byMethod: {
          efectivo: number
          terminal: number
          propinaTerminal: number
          transferencia: number
          propinaTransferencia: number
          cortesia: number
          legacy: number
        }
        dough: { cm30: number; cm20: number }
      }
    > = {
      day: {
        tabs: [],
        topItems: [],
        sum: 0,
        byMethod: { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 },
        dough: { cm30: 0, cm20: 0 },
      },
      week: {
        tabs: [],
        topItems: [],
        sum: 0,
        byMethod: { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 },
        dough: { cm30: 0, cm20: 0 },
      },
      month: {
        tabs: [],
        topItems: [],
        sum: 0,
        byMethod: { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 },
        dough: { cm30: 0, cm20: 0 },
      },
      range: {
        tabs: [],
        topItems: [],
        sum: 0,
        byMethod: { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 },
        dough: { cm30: 0, cm20: 0 },
      },
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
      const byMethod = { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 }
      for (const t of tabsInRange) {
        const isPaid = Boolean(t?.paidAt?.toMillis)
        const total = isPaid ? Number(t.paidTotal ?? t.total ?? 0) : Number(t.total ?? 0)
        sum += total

        const pbm = isPaid ? ((t as any)?.paidByMethod as any) : null
        const tbm = isPaid ? ((t as any)?.tipByMethod as any) : null
        if (pbm && typeof pbm === 'object') {
          byMethod.efectivo += Number(pbm.efectivo ?? 0)
          byMethod.terminal += Number(pbm.terminal ?? 0)
          byMethod.transferencia += Number(pbm.transferencia ?? 0)
          byMethod.cortesia += Number(pbm.cortesia ?? 0)

          if (tbm && typeof tbm === 'object') {
            byMethod.propinaTerminal += Number(tbm.terminal ?? 0)
            byMethod.propinaTransferencia += Number(tbm.transferencia ?? 0)
          }
          continue
        }

        const tip = isPaid ? Number(t?.tipAmount ?? 0) : 0
        const tipOk = Number.isFinite(tip) && tip > 0 ? tip : 0
        const baseTotal = Math.max(0, total - tipOk)

        const rawMethod = isPaid ? String(t?.paymentMethod ?? '') : 'legacy'
        const m =
          rawMethod === 'efectivo'
            ? 'efectivo'
            : rawMethod === 'terminal'
              ? 'terminal'
              : rawMethod === 'transferencia'
                ? 'transferencia'
                : rawMethod === 'cortesia'
                  ? 'cortesia'
                  : 'legacy'

        if (m === 'terminal') {
          byMethod.terminal += baseTotal
          byMethod.propinaTerminal += tipOk
        } else if (m === 'transferencia') {
          byMethod.transferencia += baseTotal
          byMethod.propinaTransferencia += tipOk
        } else {
          ;(byMethod as any)[m] = Number((byMethod as any)[m] ?? 0) + total
        }
      }

      const qtyByName = new Map<string, number>()
      let doughCm30 = 0
      let doughCm20 = 0
      const ordersInRange = reportOrders.filter((o) => {
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

          const cat = String((it as any)?.categoryName ?? '').toLowerCase()
          const size = String((it as any)?.size ?? '').toLowerCase()
          const isPizza = cat.includes('pizza')
          const isCalzone = cat.includes('calzone')
          if (isCalzone) {
            doughCm20 += q
          } else if (isPizza) {
            if (size.includes('20')) doughCm20 += q
            else doughCm30 += q
          }
        }
      }
      const topItems = Array.from(qtyByName.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3)

      byKey[key] = { tabs: tabsInRange, topItems, sum, byMethod, dough: { cm30: doughCm30, cm20: doughCm20 } }
    }

    compute('day', reportRanges.day.start, reportRanges.day.end)
    compute('week', reportRanges.week.start, reportRanges.week.end)
    compute('month', reportRanges.month.start, reportRanges.month.end)
    if (reportRanges.range) compute('range', reportRanges.range.start, reportRanges.range.end)

    return byKey
  }, [paidOrLegacyTabs, reportOrders, reportRanges])

  const reportDayOptions = React.useMemo(() => {
    const d = new Date(now)
    const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const week = Array.from({ length: 7 }, (_, i) => todayStart - i * dayMs)
    const month = Array.from({ length: 30 }, (_, i) => todayStart - i * dayMs)
    return { week, month }
  }, [now])

  React.useEffect(() => {
    if (!reportOpen) {
      setReportDayMs(null)
      setReportSubView('summary')
      return
    }
    if (reportOpen === 'week') {
      setReportDayMs((prev) => (prev != null ? prev : reportDayOptions.week[0] ?? null))
      return
    }
    if (reportOpen === 'month') {
      setReportDayMs((prev) => (prev != null ? prev : reportDayOptions.month[0] ?? null))
      return
    }
    setReportDayMs(null)
  }, [reportDayOptions.month, reportDayOptions.week, reportOpen])

  const computeRange = React.useCallback(
    (start: number, end: number) => {
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
      const byMethod = { efectivo: 0, terminal: 0, propinaTerminal: 0, transferencia: 0, propinaTransferencia: 0, cortesia: 0, legacy: 0 }
      for (const t of tabsInRange) {
        const isPaid = Boolean(t?.paidAt?.toMillis)
        const total = isPaid ? Number(t.paidTotal ?? t.total ?? 0) : Number(t.total ?? 0)
        sum += total

        const pbm = isPaid ? ((t as any)?.paidByMethod as any) : null
        const tbm = isPaid ? ((t as any)?.tipByMethod as any) : null
        if (pbm && typeof pbm === 'object') {
          byMethod.efectivo += Number(pbm.efectivo ?? 0)
          byMethod.terminal += Number(pbm.terminal ?? 0)
          byMethod.transferencia += Number(pbm.transferencia ?? 0)
          byMethod.cortesia += Number(pbm.cortesia ?? 0)

          if (tbm && typeof tbm === 'object') {
            byMethod.propinaTerminal += Number(tbm.terminal ?? 0)
            byMethod.propinaTransferencia += Number(tbm.transferencia ?? 0)
          }
          continue
        }

        const tip = isPaid ? Number(t?.tipAmount ?? 0) : 0
        const tipOk = Number.isFinite(tip) && tip > 0 ? tip : 0
        const baseTotal = Math.max(0, total - tipOk)

        const rawMethod = isPaid ? String(t?.paymentMethod ?? '') : 'legacy'
        const m =
          rawMethod === 'efectivo'
            ? 'efectivo'
            : rawMethod === 'terminal'
              ? 'terminal'
              : rawMethod === 'transferencia'
                ? 'transferencia'
                : rawMethod === 'cortesia'
                  ? 'cortesia'
                  : 'legacy'

        if (m === 'terminal') {
          byMethod.terminal += baseTotal
          byMethod.propinaTerminal += tipOk
        } else if (m === 'transferencia') {
          byMethod.transferencia += baseTotal
          byMethod.propinaTransferencia += tipOk
        } else {
          ;(byMethod as any)[m] = Number((byMethod as any)[m] ?? 0) + total
        }
      }

      const qtyByName = new Map<string, number>()
      let doughCm30 = 0
      let doughCm20 = 0
      const ordersInRange = reportOrders.filter((o) => {
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

          const cat = String((it as any)?.categoryName ?? '').toLowerCase()
          const size = String((it as any)?.size ?? '').toLowerCase()
          const isPizza = cat.includes('pizza')
          const isCalzone = cat.includes('calzone')
          if (isCalzone) {
            doughCm20 += q
          } else if (isPizza) {
            if (size.includes('20')) doughCm20 += q
            else doughCm30 += q
          }
        }
      }
      const topItems = Array.from(qtyByName.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
        .slice(0, 3)

      return { tabs: tabsInRange, topItems, sum, byMethod, dough: { cm30: doughCm30, cm20: doughCm20 } }
    },
    [reportOrders, paidOrLegacyTabs],
  )

  const reportEffective = React.useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000
    if (!reportOpen) return null
    if (reportOpen === 'day') {
      return { key: 'day' as const, label: 'Hoy', start: reportRanges.day.start, end: reportRanges.day.end }
    }
    if (reportOpen === 'week') {
      const start = reportDayMs != null ? reportDayMs : reportRanges.week.start
      const end = reportDayMs != null ? start + dayMs : reportRanges.week.end
      const label = reportDayMs != null ? new Date(start).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Semana'
      return { key: 'week' as const, label, start, end }
    }
    if (reportOpen === 'month') {
      const start = reportDayMs != null ? reportDayMs : reportRanges.month.start
      const end = reportDayMs != null ? start + dayMs : reportRanges.month.end
      const label = reportDayMs != null ? new Date(start).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) : 'Mes'
      return { key: 'month' as const, label, start, end }
    }
    if (reportOpen === 'range') {
      const r = reportRanges.range
      if (!r) return { key: 'range' as const, label: 'Rango', start: reportRanges.day.start, end: reportRanges.day.start }
      return { key: 'range' as const, label: 'Rango', start: r.start, end: r.end }
    }
    return null
  }, [reportDayMs, reportOpen, reportRanges.day.end, reportRanges.day.start, reportRanges.month.end, reportRanges.month.start, reportRanges.range, reportRanges.week.end, reportRanges.week.start])

  const reportEffectiveDetails = React.useMemo(() => {
    if (!reportEffective) return null
    return computeRange(reportEffective.start, reportEffective.end)
  }, [computeRange, reportEffective])

  const reportItemsByTabId = React.useMemo(() => {
    const out = new Map<string, Array<{ name: string; qty: number; amount: number }>>()
    if (!reportEffective) return out
    const start = reportEffective.start
    const end = reportEffective.end

    const byTab = new Map<string, Map<string, { qty: number; amount: number }>>()
    for (const o of reportOrders) {
      const ms = o?.createdAt?.toMillis ? o.createdAt.toMillis() : null
      if (ms == null || ms < start || ms >= end) continue
      const tabId = String(o?.tabId ?? '').trim()
      if (!tabId) continue
      const its = Array.isArray(o?.items) ? o.items : []
      for (const it of its) {
        const name = String(it?.name ?? '').trim()
        const qty = Number(it?.qty ?? 0)
        if (!name || !Number.isFinite(qty) || qty <= 0) continue
        const unit = Number((it as any)?.unitPrice ?? 0)
        const unitOk = Number.isFinite(unit) && unit > 0 ? unit : 0
        const delta = Math.round(unitOk * qty * 100) / 100

        const m = byTab.get(tabId) ?? new Map<string, { qty: number; amount: number }>()
        const cur = m.get(name) ?? { qty: 0, amount: 0 }
        m.set(name, { qty: cur.qty + qty, amount: Math.round((cur.amount + delta) * 100) / 100 })
        byTab.set(tabId, m)
      }
    }

    for (const [tabId, m] of byTab.entries()) {
      const rows = Array.from(m.entries())
        .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
      out.set(tabId, rows)
    }
    return out
  }, [reportOrders, reportEffective])

  React.useEffect(() => {
    setReportExpandedTabId(null)
    setReportExpandedStaffKey(null)
    setReportSubView('summary')
  }, [reportEffective?.start, reportEffective?.end, reportOpen])

  const reportTopByBucket = React.useMemo(() => {
    const start = reportEffective?.start
    const end = reportEffective?.end
    if (start == null || end == null) {
      return { pizzas: [], calzones: [], bebidas: [], jarras: [], otrosAlimentos: [] } as any
    }
    const out = {
      pizzas: [] as Array<{ name: string; qty: number; amount: number }>,
      calzones: [] as Array<{ name: string; qty: number; amount: number }>,
      bebidas: [] as Array<{ name: string; qty: number; amount: number }>,
      jarras: [] as Array<{ name: string; qty: number; amount: number }>,
      otrosAlimentos: [] as Array<{ name: string; qty: number; amount: number }>,
    }
    const categoryNameById = new Map<string, string>()
    for (const c of categories) categoryNameById.set(String(c.id), String((c as any)?.name ?? ''))

    const norm = (s: any) => String(s ?? '').toLowerCase()
    const isDrinkCategoryName = (catName: string) => {
      const c = norm(catName)
      return (
        c.includes('bebid') ||
        c.includes('bar') ||
        c.includes('coctel') ||
        c.includes('cocktail') ||
        c.includes('vino') ||
        c.includes('cerve') ||
        c.includes('refresco') ||
        c.includes('soda') ||
        c.includes('agua') ||
        c.includes('jug')
      )
    }

    const isJarraNameOrCategory = (name: string, catName: string) => {
      const n = norm(name)
      const c = norm(catName)
      return n.includes('jarra') || c.includes('jarra')
    }

    const isDrinkNameFallback = (name: string) => {
      const n = norm(name)
      return n.includes('sangria') || n.includes('sangría') || n.includes('tinto') || n.includes('verano')
    }

    // Aggregate sold qty/amount by menu item id (fallback to name if missing)
    const soldByKey = new Map<string, { qty: number; amount: number }>()
    for (const o of reportOrders) {
      const ms = o?.createdAt?.toMillis ? o.createdAt.toMillis() : null
      if (ms == null || ms < start || ms >= end) continue
      const its = Array.isArray(o?.items) ? o.items : []
      for (const it of its) {
        const itemId = String(it?.itemId ?? '').trim()
        const name = String(it?.name ?? '').trim()
        const key = itemId || name
        const qty = Number(it?.qty ?? 0)
        if (!key || !name || !Number.isFinite(qty) || qty <= 0) continue
        const unit = Number(it?.unitPrice ?? 0)
        const unitOk = Number.isFinite(unit) && unit > 0 ? unit : 0
        const delta = Math.round(unitOk * qty * 100) / 100
        const cur = soldByKey.get(key) ?? { qty: 0, amount: 0 }
        soldByKey.set(key, { qty: cur.qty + qty, amount: Math.round((cur.amount + delta) * 100) / 100 })
      }
    }

    const bucketKeyFromMenuItem = (mi: any) => {
      const name = String(mi?.name ?? '')
      const catName = String(categoryNameById.get(String(mi?.categoryId ?? '')) ?? '')
      const catNorm = norm(catName)
      const isPizza = catNorm.includes('pizza')
      const isCalzone = catNorm.includes('calzone')
      const isJarra = isJarraNameOrCategory(name, catName)
      const isDrink = isDrinkCategoryName(catName) || isDrinkNameFallback(name)
      if (isPizza) return 'pizzas' as const
      if (isCalzone) return 'calzones' as const
      if (isJarra) return 'jarras' as const
      if (isDrink) return 'bebidas' as const
      return 'otrosAlimentos' as const
    }

    const m = {
      pizzas: new Map<string, { qty: number; amount: number }>(),
      calzones: new Map<string, { qty: number; amount: number }>(),
      bebidas: new Map<string, { qty: number; amount: number }>(),
      jarras: new Map<string, { qty: number; amount: number }>(),
      otrosAlimentos: new Map<string, { qty: number; amount: number }>(),
    }

    // Build rows from menu catalog so we also list items with qty 0
    const menuRows = items
      .filter((x) => Boolean((x as any)?.isActive ?? true))
      .map((mi) => {
        const id = String((mi as any)?.id ?? '')
        const name = String((mi as any)?.name ?? '').trim()
        const sold = soldByKey.get(id) ?? soldByKey.get(name) ?? { qty: 0, amount: 0 }
        const bucket = bucketKeyFromMenuItem(mi)
        return { bucket, name, qty: sold.qty, amount: sold.amount }
      })

    for (const r of menuRows) {
      const cur = m[r.bucket].get(r.name) ?? { qty: 0, amount: 0 }
      // if the same name appears multiple times in menu (shouldn't), sum it
      m[r.bucket].set(r.name, { qty: cur.qty + r.qty, amount: Math.round((cur.amount + r.amount) * 100) / 100 })
    }

    const toRows = (mm: Map<string, { qty: number; amount: number }>) =>
      Array.from(mm.entries())
        .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
        .sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name))


    out.pizzas = toRows(m.pizzas)
    out.calzones = toRows(m.calzones)
    out.bebidas = toRows(m.bebidas)
    out.jarras = toRows(m.jarras)
    out.otrosAlimentos = toRows(m.otrosAlimentos)
    return out
  }, [reportOrders, reportEffective?.end, reportEffective?.start])

  const reportByWaiter = React.useMemo(() => {
    if (!reportOpen) return [] as Array<{ name: string; tabs: number; total: number; tips: number }>
    const tabs = (reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs) as any[]
    const m = new Map<string, { tabs: number; total: number; tips: number }>()
    for (const t of tabs) {
      const name = String(t?.createdByName ?? '').trim() || '—'
      const isPaid = Boolean(t?.paidAt?.toMillis)
      const total = isPaid ? Number(t?.paidTotal ?? t?.total ?? 0) : Number(t?.total ?? 0)
      const tip = isPaid ? Number(t?.tipAmount ?? 0) : 0
      const tipOk = Number.isFinite(tip) && tip > 0 ? tip : 0
      const prev = m.get(name) ?? { tabs: 0, total: 0, tips: 0 }
      m.set(name, {
        tabs: prev.tabs + 1,
        total: Math.round((prev.total + (Number.isFinite(total) ? total : 0)) * 100) / 100,
        tips: Math.round((prev.tips + tipOk) * 100) / 100,
      })
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total || b.tabs - a.tabs || a.name.localeCompare(b.name))
  }, [reportDetails, reportEffectiveDetails?.tabs, reportOpen])

  const reportByCashier = React.useMemo(() => {
    if (!reportOpen) return [] as Array<{ name: string; tabs: number; total: number; tips: number }>
    const tabs = (reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs) as any[]
    const m = new Map<string, { tabs: number; total: number; tips: number }>()
    for (const t of tabs) {
      const isPaid = Boolean(t?.paidAt?.toMillis)
      if (!isPaid) continue
      const name = String(t?.paidByName ?? '').trim() || '—'
      const total = Number(t?.paidTotal ?? t?.total ?? 0)
      const tip = Number(t?.tipAmount ?? 0)
      const tipOk = Number.isFinite(tip) && tip > 0 ? tip : 0
      const prev = m.get(name) ?? { tabs: 0, total: 0, tips: 0 }
      m.set(name, {
        tabs: prev.tabs + 1,
        total: Math.round((prev.total + (Number.isFinite(total) ? total : 0)) * 100) / 100,
        tips: Math.round((prev.tips + tipOk) * 100) / 100,
      })
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total || b.tabs - a.tabs || a.name.localeCompare(b.name))
  }, [reportDetails, reportEffectiveDetails?.tabs, reportOpen])

  const reportItemsByCreatedBy = React.useMemo(() => {
    if (!reportOpen) return new Map<string, Array<{ name: string; qty: number; amount: number }>>()
    const tabs = (reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs) as any[]
    const agg = new Map<string, Map<string, { qty: number; amount: number }>>()

    for (const t of tabs) {
      const staff = String(t?.createdByName ?? '').trim() || '—'
      const tabId = String(t?.id ?? '').trim()
      if (!tabId) continue
      const rows = reportItemsByTabId.get(tabId) ?? []
      const m = agg.get(staff) ?? new Map<string, { qty: number; amount: number }>()
      for (const r of rows) {
        const name = String(r?.name ?? '').trim()
        const qty = Number(r?.qty ?? 0)
        const amount = Number((r as any)?.amount ?? 0)
        if (!name || !Number.isFinite(qty) || qty <= 0) continue
        const cur = m.get(name) ?? { qty: 0, amount: 0 }
        m.set(name, { qty: cur.qty + qty, amount: Math.round((cur.amount + (Number.isFinite(amount) ? amount : 0)) * 100) / 100 })
      }
      agg.set(staff, m)
    }

    const out = new Map<string, Array<{ name: string; qty: number; amount: number }>>() 
    for (const [staff, m] of agg.entries()) {
      out.set(
        staff,
        Array.from(m.entries())
          .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
          .sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name)),
      )
    }
    return out
  }, [reportDetails, reportEffectiveDetails?.tabs, reportItemsByTabId, reportOpen])

  const reportItemsByPaidBy = React.useMemo(() => {
    if (!reportOpen) return new Map<string, Array<{ name: string; qty: number; amount: number }>>()
    const tabs = (reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs) as any[]
    const agg = new Map<string, Map<string, { qty: number; amount: number }>>()

    for (const t of tabs) {
      const staff = String(t?.paidByName ?? '').trim() || '—'
      const tabId = String(t?.id ?? '').trim()
      if (!tabId) continue
      const rows = reportItemsByTabId.get(tabId) ?? []
      const m = agg.get(staff) ?? new Map<string, { qty: number; amount: number }>()
      for (const r of rows) {
        const name = String(r?.name ?? '').trim()
        const qty = Number(r?.qty ?? 0)
        const amount = Number((r as any)?.amount ?? 0)
        if (!name || !Number.isFinite(qty) || qty <= 0) continue
        const cur = m.get(name) ?? { qty: 0, amount: 0 }
        m.set(name, { qty: cur.qty + qty, amount: Math.round((cur.amount + (Number.isFinite(amount) ? amount : 0)) * 100) / 100 })
      }
      agg.set(staff, m)
    }

    const out = new Map<string, Array<{ name: string; qty: number; amount: number }>>()
    for (const [staff, m] of agg.entries()) {
      out.set(
        staff,
        Array.from(m.entries())
          .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
          .sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name)),
      )
    }
    return out
  }, [reportDetails, reportEffectiveDetails?.tabs, reportItemsByTabId, reportOpen])

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

  const mesaTableIds = React.useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => `mesa-${String(i + 1).padStart(2, '0')}`)
  }, [])

  const tableLabel = React.useCallback((id: string) => {
    if (id.startsWith('mesa-')) {
      const raw = id.replace('mesa-', '').trim()
      const n = Number(raw)
      return Number.isFinite(n) && n > 0 ? `Mesa ${n}` : 'Mesa'
    }
    if (id.startsWith('togo-')) {
      const raw = id.replace('togo-', '').trim()
      const n = Number(raw)
      return Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
    }
    return id
  }, [])

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

  React.useEffect(() => {
    const tabId = String(selectedOpenTab?.id ?? '')
    if (!tabId) {
      setOrderVoids([])
      return
    }
    const q = query(collection(db, 'orderVoids'), where('tabId', '==', tabId), orderBy('createdAt', 'desc'), limit(100))
    return onSnapshot(
      q,
      (snap) => {
        setOrderVoids(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
      },
      () => {
        setOrderVoids([])
      },
    )
  }, [selectedOpenTab?.id])

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

        const afterQty = Math.max(0, curQty - 1)
        const voidRef = doc(collection(db, 'orderVoids'))
        tx.set(voidRef, {
          tabId,
          orderId,
          tableId: String(tab?.tableId ?? ''),
          itemId,
          itemName: String(cur?.name ?? ''),
          orderArea: String(order?.area ?? ''),
          wasPrinted: Boolean(order?.printedAt?.toMillis ? order.printedAt.toMillis() : order?.printedAt),
          beforeQty: curQty,
          afterQty,
          qtyRemoved: 1,
          unitPrice: Number.isFinite(unit) ? unit : 0,
          delta,
          createdAt: serverTimestamp(),
          createdByUid: user?.uid ?? null,
          createdByName: user?.displayName ?? user?.email ?? null,
        })

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

  return (
    <div className="container">
      <SessionBar
        title="Admin"
        showMenuButton={false}
        autoHideOnScroll={view === 'report'}
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
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="card" style={{ margin: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>Cuentas abiertas</div>
              <div style={{ fontWeight: 950, fontSize: 24 }}>{tabs.filter((t) => String(t?.status ?? '') === 'open').length}</div>
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
                  onClick={async () => {
                    const ok = window.confirm('Esto mandará 2 tickets de prueba (Cocina y Barra). ¿Continuar?')
                    if (!ok) return

                    const testId = `togo-test-${String(Date.now()).slice(-6)}`
                    const byName = user?.displayName ?? user?.email ?? null
                    const byUid = user?.uid ?? null

                    const kitchenOrderRef = doc(collection(db, 'orders'))
                    const barOrderRef = doc(collection(db, 'orders'))

                    const kitchenPayload = {
                      status: 'pending',
                      area: 'kitchen',
                      tableId: testId,
                      tableLabel: `PRUEBA ${testId}`,
                      tabId: null,
                      createdAt: serverTimestamp(),
                      createdByUid: byUid,
                      createdByName: byName,
                      printedAt: null,
                      items: [
                        {
                          itemId: 'test-pizza',
                          name: 'Pepperoni',
                          qty: 1,
                          unitPrice: 0,
                          lineTotal: 0,
                          size: 'cm30',
                          categoryName: 'Pizzas',
                          extras: [{ name: 'Queso de cabra', qty: 1 }],
                          note: 'PRUEBA',
                        },
                      ],
                    }

                    const barPayload = {
                      status: 'pending',
                      area: 'bar',
                      tableId: testId,
                      tableLabel: `PRUEBA ${testId}`,
                      tabId: null,
                      createdAt: serverTimestamp(),
                      createdByUid: byUid,
                      createdByName: byName,
                      printedAt: null,
                      items: [
                        {
                          itemId: 'test-bebida',
                          name: 'Sangría',
                          qty: 1,
                          unitPrice: 0,
                          lineTotal: 0,
                          categoryName: 'Bebidas',
                          extras: [],
                          note: 'PRUEBA',
                        },
                        {
                          itemId: 'test-bebida-2',
                          name: 'Tinto de Verano',
                          qty: 1,
                          unitPrice: 0,
                          lineTotal: 0,
                          categoryName: 'Bebidas',
                          extras: [],
                          note: 'PRUEBA',
                        },
                      ],
                    }

                    const batch = writeBatch(db)
                    batch.set(kitchenOrderRef, kitchenPayload as any)
                    batch.set(barOrderRef, barPayload as any)
                    await batch.commit()
                  }}
                >
                  Impresión de prueba
                </button>

                <div style={{ height: 8 }} />

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
              <div className="muted" style={{ fontSize: 12 }}>Toca una mesa para ver el consumo.</div>
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
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Mesas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {mesaTableIds.map((id) => {
                  const t = openTabByTableId.get(id)
                  const isOpen = Boolean(t)
                  const total = Number(t?.total ?? 0)
                  const openedAtMs = t?.openedAt?.toMillis ? t.openedAt.toMillis() : null
                  const minutes = openedAtMs ? Math.max(0, Math.round((now - openedAtMs) / 60000)) : null
                  return (
                    <button
                      key={id}
                      className="tableCard"
                      style={{ borderColor: isOpen ? 'rgba(245, 158, 11, 0.85)' : undefined, textAlign: 'left' }}
                      onClick={() => setSelectedTableId(id)}
                    >
                      <div style={{ fontWeight: 950 }}>{tableLabel(id)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{isOpen ? `Cuenta abierta · ${money(total)}` : 'Libre'}</div>
                      {isOpen && minutes != null ? <div className="muted" style={{ fontSize: 11 }}>{minutes} min</div> : null}
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

                    <div style={{ height: 14 }} />

                    <div className="card" style={{ margin: 0, padding: 10 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quitar productos (cuenta abierta)</div>
                      {(() => {
                        const tabId = String(selectedOpenTab?.id ?? '')
                        if (!tabId) return <div className="muted" style={{ fontSize: 12 }}>—</div>
                        const tabOrders = orders
                          .filter((o) => String(o?.tabId ?? '') === tabId)
                          .filter((o) => {
                            const its = Array.isArray((o as any)?.items) ? (o as any).items : []
                            return its.length > 0
                          })
                          .sort((a, b) => {
                            const aMs = toMillisMaybe((a as any)?.createdAt) ?? 0
                            const bMs = toMillisMaybe((b as any)?.createdAt) ?? 0
                            return bMs - aMs
                          })

                        if (!tabOrders.length) {
                          return <div className="muted" style={{ fontSize: 12 }}>Sin comandas.</div>
                        }

                        return (
                          <div style={{ display: 'grid', gap: 10 }}>
                            {tabOrders.slice(0, 20).map((o) => (
                              <div key={String(o.id)} className="card" style={{ margin: 0, padding: 10 }}>
                                <div className="row" style={{ justifyContent: 'space-between' }}>
                                  <div style={{ fontWeight: 900 }}>{String((o as any)?.area ?? '') === 'bar' ? 'Barra' : 'Cocina'}</div>
                                  <div className="muted" style={{ fontSize: 12 }}>{formatClock(toMillisMaybe((o as any)?.createdAt) ?? Date.now())}</div>
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
                                            await removeOrderItem({ tabId, orderId: String(o.id), itemId: String(it?.itemId ?? '') })
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

                    <div style={{ height: 10 }} />

                    <details className="card" style={{ margin: 0, padding: 10 }}>
                      <summary style={{ cursor: 'pointer' }}>
                        <span className="muted" style={{ fontSize: 12 }}>Historial de ajustes (solo Admin)</span>
                      </summary>
                      <div style={{ height: 8 }} />
                      {orderVoids.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Sin movimientos.</div> : null}
                      <div style={{ display: 'grid', gap: 8 }}>
                        {orderVoids.slice(0, 60).map((v) => (
                          <div key={String(v.id)} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{String(v?.itemName ?? v?.itemId ?? '')}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                -1 · {String(v?.orderArea ?? '') === 'bar' ? 'Barra' : 'Cocina'}
                                {v?.createdAt?.toMillis ? ` · ${formatClock(v.createdAt.toMillis())}` : ''}
                                {v?.createdByName ? ` · ${String(v.createdByName)}` : ''}
                              </div>
                            </div>
                            <div style={{ fontWeight: 900 }}>{Number(v?.delta ?? 0) ? `-${money(Number(v.delta))}` : '—'}</div>
                          </div>
                        ))}
                      </div>
                    </details>
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
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.propinaTerminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.transferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.day.byMethod.propinaTransferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Masas 30: <strong style={{ color: '#111827' }}>{Number(reportDetails.day.dough.cm30 ?? 0)}</strong> · Masas 20:{' '}
                <strong style={{ color: '#111827' }}>{Number(reportDetails.day.dough.cm20 ?? 0)}</strong>
              </div>
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
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.propinaTerminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.transferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.week.byMethod.propinaTransferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Masas 30: <strong style={{ color: '#111827' }}>{Number(reportDetails.week.dough.cm30 ?? 0)}</strong> · Masas 20:{' '}
                <strong style={{ color: '#111827' }}>{Number(reportDetails.week.dough.cm20 ?? 0)}</strong>
              </div>
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
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.propinaTerminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.transferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.month.byMethod.propinaTransferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Masas 30: <strong style={{ color: '#111827' }}>{Number(reportDetails.month.dough.cm30 ?? 0)}</strong> · Masas 20:{' '}
                <strong style={{ color: '#111827' }}>{Number(reportDetails.month.dough.cm20 ?? 0)}</strong>
              </div>
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
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Efectivo: <strong style={{ color: '#111827' }}>{money(reportDetails.range.byMethod.efectivo)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.range.byMethod.terminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina tarjeta: <strong style={{ color: '#111827' }}>{money(reportDetails.range.byMethod.propinaTerminal)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.range.byMethod.transferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Propina transferencia: <strong style={{ color: '#111827' }}>{money(reportDetails.range.byMethod.propinaTransferencia)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Masas 30: <strong style={{ color: '#111827' }}>{Number(reportDetails.range.dough.cm30 ?? 0)}</strong> · Masas 20:{' '}
                <strong style={{ color: '#111827' }}>{Number(reportDetails.range.dough.cm20 ?? 0)}</strong>
              </div>
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
                  <div style={{ fontWeight: 900 }}>
                    Detalle · {reportEffective?.label ?? (reportOpen === 'day' ? 'Hoy' : reportOpen === 'week' ? 'Semana' : reportOpen === 'month' ? 'Mes' : 'Rango')}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {(reportEffectiveDetails?.tabs?.length ?? reportDetails[reportOpen].tabs.length)} venta(s) · Top productos:{' '}
                    {(reportEffectiveDetails?.topItems?.length ?? reportDetails[reportOpen].topItems.length)
                      ? (reportEffectiveDetails?.topItems ?? reportDetails[reportOpen].topItems).map((x) => `${x.name} (${x.qty})`).join(' · ')
                      : '—'}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className={reportSubView === 'summary' ? 'button' : 'button secondary'}
                    onClick={() => setReportSubView('summary')}
                  >
                    Resumen
                  </button>
                  <button
                    type="button"
                    className={reportSubView === 'top' ? 'button' : 'button secondary'}
                    onClick={() => setReportSubView('top')}
                  >
                    Top productos
                  </button>
                  <button
                    type="button"
                    className={reportSubView === 'waiters' ? 'button' : 'button secondary'}
                    onClick={() => setReportSubView('waiters')}
                  >
                    Meseros
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => downloadCsv((reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs) as any[], `reporte_${reportOpen}_${new Date(now).toISOString().slice(0, 10)}.csv`)}
                  >
                    Descargar CSV
                  </button>
                </div>
              </div>

              {reportOpen === 'week' || reportOpen === 'month' ? (
                <>
                  <div style={{ height: 10 }} />
                  <div className="card" style={{ margin: 0, padding: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                      {reportOpen === 'week' ? 'Selecciona un día (últimos 7 días)' : 'Selecciona un día (últimos 30 días)'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                      {(reportOpen === 'week' ? reportDayOptions.week : reportDayOptions.month).map((ms) => {
                        const active = reportDayMs === ms
                        return (
                          <button
                            key={ms}
                            className="button secondary"
                            style={{ borderColor: active ? '#111827' : '#e5e7eb', justifyContent: 'space-between', display: 'flex' }}
                            onClick={() => setReportDayMs(ms)}
                          >
                            <span>{new Date(ms).toLocaleDateString('es-MX', { weekday: reportOpen === 'week' ? 'short' : undefined, day: '2-digit', month: '2-digit' })}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              <div style={{ height: 12 }} />

              {reportSubView === 'summary' ? (
                <>
                  <div className="card" style={{ margin: 0 }}>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, background: 'rgba(17,24,39,0.03)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>Efectivo</div>
                      <div style={{ fontWeight: 950 }}>{money((reportEffectiveDetails?.byMethod ?? reportDetails[reportOpen].byMethod).efectivo)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Tarjeta</div>
                      <div style={{ fontWeight: 950 }}>{money((reportEffectiveDetails?.byMethod ?? reportDetails[reportOpen].byMethod).terminal)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, background: 'rgba(17,24,39,0.03)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>Propina tarjeta</div>
                      <div style={{ fontWeight: 950 }}>{money((reportEffectiveDetails?.byMethod ?? reportDetails[reportOpen].byMethod).propinaTerminal)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Transferencia</div>
                      <div style={{ fontWeight: 950 }}>{money((reportEffectiveDetails?.byMethod ?? reportDetails[reportOpen].byMethod).transferencia)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, background: 'rgba(17,24,39,0.03)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>Propina transferencia</div>
                      <div style={{ fontWeight: 950 }}>{money((reportEffectiveDetails?.byMethod ?? reportDetails[reportOpen].byMethod).propinaTransferencia)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Masas 30</div>
                      <div style={{ fontWeight: 950 }}>{Number((reportEffectiveDetails as any)?.dough?.cm30 ?? reportDetails[reportOpen].dough.cm30 ?? 0)}</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, background: 'rgba(17,24,39,0.03)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>Masas 20</div>
                      <div style={{ fontWeight: 950 }}>{Number((reportEffectiveDetails as any)?.dough?.cm20 ?? reportDetails[reportOpen].dough.cm20 ?? 0)}</div>
                    </div>
                  </div>

                  <div style={{ height: 12 }} />

                  <div style={{ display: 'grid', gap: 8 }}>
                    {(reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs).length === 0 ? <div className="muted">Sin ventas en este rango.</div> : null}
                    {(reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs).slice(0, 200).map((t) => (
                      <div key={t.id} className="card" style={{ margin: 0, padding: 10, borderColor: reportExpandedTabId === String(t.id ?? '') ? '#111827' : undefined }}>
                        <button
                          type="button"
                          className="row"
                          style={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                          onClick={() => {
                            const id = String(t.id ?? '')
                            setReportExpandedTabId((prev) => (prev === id ? null : id))
                          }}
                        >
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t.tableId ?? '—'}{t.tabName ? ` · ${t.tabName}` : ''} ·{' '}
                            {t?.closedAt?.toDate ? t.closedAt.toDate().toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
                          </div>
                          <div style={{ fontWeight: 900 }}>{money(Number(t.total ?? 0))}</div>
                        </button>

                        {reportExpandedTabId === String(t.id ?? '') ? (
                          <>
                            <div style={{ height: 8 }} />
                            {(() => {
                              const rows = reportItemsByTabId.get(String(t.id ?? '').trim()) ?? []
                              if (!rows.length) return <div className="muted" style={{ fontSize: 12 }}>Sin productos (sin comandas en este rango).</div>
                              return (
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {rows.slice(0, 30).map((x, idx) => (
                                    <div
                                      key={x.name}
                                      className="row"
                                      style={{
                                        justifyContent: 'space-between',
                                        padding: '6px 8px',
                                        borderRadius: 10,
                                        background: idx % 2 === 0 ? 'rgba(17,24,39,0.03)' : 'transparent',
                                      }}
                                    >
                                      <div style={{ fontWeight: 700, fontSize: 12 }}>{x.name}</div>
                                      <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                        <div className="muted" style={{ fontSize: 12 }}>x{x.qty}</div>
                                        <div style={{ fontWeight: 900, fontSize: 12 }}>{x.amount ? money(Number(x.amount ?? 0)) : ''}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : reportSubView === 'top' ? (
                <>
                  <div className="card" style={{ margin: 0 }}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {(
                        [
                          { key: 'pizzas' as const, title: 'Pizzas' },
                          { key: 'calzones' as const, title: 'Calzones' },
                          { key: 'otrosAlimentos' as const, title: 'Otros alimentos' },
                          { key: 'bebidas' as const, title: 'Bebidas' },
                          { key: 'jarras' as const, title: 'Jarras' },
                        ] as const
                      ).map((sec) => {
                        const rows = reportTopByBucket[sec.key] ?? []
                        return (
                          <div key={sec.key}>
                            <div className="row" style={{ justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 900 }}>{sec.title}</div>
                              <div className="muted" style={{ fontSize: 12 }}>Top</div>
                            </div>
                            <div style={{ height: 8 }} />
                            {!rows.length ? <div className="muted" style={{ fontSize: 12 }}>Sin ventas en este rango.</div> : null}
                            <div style={{ display: 'grid', gap: 6 }}>
                              {rows.map((x: any, idx: number) => (
                                <div
                                  key={x.name}
                                  className="row"
                                  style={{
                                    justifyContent: 'space-between',
                                    padding: '6px 8px',
                                    borderRadius: 10,
                                    background: idx % 2 === 0 ? 'rgba(17,24,39,0.03)' : 'transparent',
                                  }}
                                >
                                  <div style={{ fontWeight: 800, fontSize: 12 }}>{x.name}</div>
                                  <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                    <div className="muted" style={{ fontSize: 12 }}>x{x.qty}</div>
                                    <div style={{ fontWeight: 950, fontSize: 12 }}>{x.amount ? money(Number(x.amount ?? 0)) : ''}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="card" style={{ margin: 0 }}>
                    {!reportByWaiter.length ? <div className="muted">Sin ventas en este rango.</div> : null}

                    <div style={{ display: 'grid', gap: 12 }}>
                      <div>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 900 }}>Por mesero (quien abrió)</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {(reportEffectiveDetails?.tabs ?? reportDetails[reportOpen].tabs).length} venta(s) · {reportByWaiter.length} persona(s)
                          </div>
                        </div>
                        <div style={{ height: 8 }} />
                        <div style={{ display: 'grid', gap: 6 }}>
                          {reportByWaiter.map((w, idx) => {
                            const staffKey = `created:${w.name}`
                            const open = reportExpandedStaffKey === staffKey
                            const rows = reportItemsByCreatedBy.get(w.name) ?? []
                            return (
                              <div key={staffKey} className="card" style={{ margin: 0, padding: 10, borderColor: open ? '#111827' : undefined }}>
                                <button
                                  type="button"
                                  className="row"
                                  style={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                                  onClick={() => setReportExpandedStaffKey((p) => (p === staffKey ? null : staffKey))}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 950, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>{w.tabs} venta(s)</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 950 }}>{money(w.total)}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>Propinas: {money(w.tips)}</div>
                                  </div>
                                </button>

                                {open ? (
                                  <>
                                    <div style={{ height: 8 }} />
                                    {!rows.length ? <div className="muted" style={{ fontSize: 12 }}>Sin productos (sin comandas en este rango).</div> : null}
                                    <div style={{ display: 'grid', gap: 6 }}>
                                      {rows.slice(0, 300).map((x, i) => (
                                        <div
                                          key={x.name}
                                          className="row"
                                          style={{
                                            justifyContent: 'space-between',
                                            padding: '6px 8px',
                                            borderRadius: 10,
                                            background: i % 2 === 0 ? 'rgba(17,24,39,0.03)' : 'transparent',
                                          }}
                                        >
                                          <div style={{ fontWeight: 700, fontSize: 12 }}>{x.name}</div>
                                          <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                            <div className="muted" style={{ fontSize: 12 }}>x{x.qty}</div>
                                            <div style={{ fontWeight: 900, fontSize: 12 }}>{x.amount ? money(Number(x.amount ?? 0)) : ''}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 900 }}>Por caja (quien cobró)</div>
                          <div className="muted" style={{ fontSize: 12 }}>Basado en tabs pagados</div>
                        </div>
                        <div style={{ height: 8 }} />
                        <div style={{ display: 'grid', gap: 6 }}>
                          {reportByCashier.map((c, idx) => {
                            const staffKey = `paid:${c.name}`
                            const open = reportExpandedStaffKey === staffKey
                            const rows = reportItemsByPaidBy.get(c.name) ?? []
                            return (
                              <div key={staffKey} className="card" style={{ margin: 0, padding: 10, borderColor: open ? '#111827' : undefined }}>
                                <button
                                  type="button"
                                  className="row"
                                  style={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                                  onClick={() => setReportExpandedStaffKey((p) => (p === staffKey ? null : staffKey))}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 950, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>{c.tabs} cierre(s)</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 950 }}>{money(c.total)}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>Propinas: {money(c.tips)}</div>
                                  </div>
                                </button>

                                {open ? (
                                  <>
                                    <div style={{ height: 8 }} />
                                    {!rows.length ? <div className="muted" style={{ fontSize: 12 }}>Sin productos.</div> : null}
                                    <div style={{ display: 'grid', gap: 6 }}>
                                      {rows.slice(0, 300).map((r, i) => (
                                        <div
                                          key={r.name}
                                          className="row"
                                          style={{
                                            justifyContent: 'space-between',
                                            padding: '6px 8px',
                                            borderRadius: 10,
                                            background: i % 2 === 0 ? 'rgba(17,24,39,0.03)' : 'transparent',
                                          }}
                                        >
                                          <div style={{ fontWeight: 700, fontSize: 12 }}>{r.name}</div>
                                          <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                                            <div className="muted" style={{ fontSize: 12 }}>x{r.qty}</div>
                                            <div style={{ fontWeight: 900, fontSize: 12 }}>{r.amount ? money(Number(r.amount ?? 0)) : ''}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div style={{ height: 12 }} />
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
