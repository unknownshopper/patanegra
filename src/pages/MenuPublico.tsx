import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  getDocs,
  limit,
  where,
  updateDoc,
  doc,
  runTransaction,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth/AuthProvider'

type Category = { id: string; name: string; sortOrder: number; isActive: boolean }

type PizzaSize = 'cm30' | 'cm20'

function itemBasePrice(it: Item) {
  const cm30 = typeof it.prices?.cm30 === 'number' ? Number(it.prices.cm30) : null
  const cm20 = typeof it.prices?.cm20 === 'number' ? Number(it.prices.cm20) : null
  const p = typeof it.price === 'number' ? Number(it.price) : null
  return cm30 ?? p ?? cm20 ?? 0
}

function itemHasSizes(it: Item) {
  return typeof it.prices?.cm30 === 'number' || typeof it.prices?.cm20 === 'number'
}

function priceForSize(it: Item, size: PizzaSize | null) {
  if (!size) return itemBasePrice(it)
  if (size === 'cm30' && typeof it.prices?.cm30 === 'number') return Number(it.prices.cm30)
  if (size === 'cm20' && typeof it.prices?.cm20 === 'number') return Number(it.prices.cm20)
  return itemBasePrice(it)
}
type Item = {
  id: string
  categoryId: string
  name: string
  description?: string
  price?: number
  prices?: { cm20?: number; cm30?: number }
  isActive: boolean
  sortOrder: number
  promoPercent?: number
  promoLabel?: string
}

const demoCategories: Category[] = [
  { id: 'pizzas', name: 'Pizzas', sortOrder: 1, isActive: true },
  { id: 'bebidas', name: 'Bebidas', sortOrder: 2, isActive: true },
]

const demoItems: Item[] = [
  {
    id: 'pepperoni',
    categoryId: 'pizzas',
    name: 'Pepperoni',
    description: 'Mix de quesos, salsa de tomate y pepperoni.',
    prices: { cm30: 145, cm20: 110 },
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'hawaiana',
    categoryId: 'pizzas',
    name: 'Hawaiana',
    description: 'Mix de quesos, salsa de tomate, jamón y piña.',
    prices: { cm30: 145, cm20: 110 },
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'patanegra',
    categoryId: 'pizzas',
    name: 'Pata Negra',
    description: 'Mix de quesos, salsa de tomate, espinacas, tocino, cebolla, champiñones, queso de cabra.',
    prices: { cm30: 180, cm20: 130 },
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'coca',
    categoryId: 'bebidas',
    name: 'Coca Cola / Coca Cola Light',
    description: undefined,
    price: 40,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'agua',
    categoryId: 'bebidas',
    name: 'Agua Natural',
    description: undefined,
    price: 25,
    isActive: true,
    sortOrder: 2,
  },
]

function money(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function getPrice30(i: Item) {
  if (typeof i.prices?.cm30 === 'number') return i.prices.cm30
  if (typeof i.price === 'number') return i.price
  return 0
}

function getPrice20(i: Item) {
  if (typeof i.prices?.cm20 === 'number') return i.prices.cm20
  return null
}

function applyPercentOff(price: number, percent: number) {
  const p = Math.max(0, Math.min(100, percent))
  const discounted = price * (1 - p / 100)
  return Math.round(discounted * 100) / 100
}

export default function MenuPublicoPage() {
  const { user, logout } = useAuth()
  const [searchParams] = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'pizzas' | 'calzones' | 'panes' | 'bebidas' | 'otros'>('all')
  const [connected, setConnected] = useState(false)
  const [catsLoaded, setCatsLoaded] = useState(false)
  const [itemsLoaded, setItemsLoaded] = useState(false)
  const [loadTimeout, setLoadTimeout] = useState(false)
  const [catsErr, setCatsErr] = useState<string | null>(null)
  const [itemsErr, setItemsErr] = useState<string | null>(null)
  const [fatalErr, setFatalErr] = useState<string | null>(null)
  const [callBusy, setCallBusy] = useState(false)
  const [callMessage, setCallMessage] = useState<string | null>(null)
  const [openTakeoutTabs, setOpenTakeoutTabs] = useState<any[]>([])
  const [menuExtras, setMenuExtras] = useState<any[]>([])
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({})
  const [selectionCfgByInstanceId, setSelectionCfgByInstanceId] = useState<
    Record<string, { size: PizzaSize | null; halfOtherItemId: string | null; note: string; extras: string[] }>
  >({})
  const [cartLines, setCartLines] = useState<
    Array<{
      lineId: string
      itemId: string
      qty: number
      size: PizzaSize | null
      halfOtherItemId: string | null
      note: string | null
      extras: string[]
    }>
  >([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState<string | null>(null)
  const [cartTableId, setCartTableId] = useState<string>('')
  const [takeoutName, setTakeoutName] = useState<string>('')
  const [confirmAddToExistingTab, setConfirmAddToExistingTab] = useState(false)

  const isStaff = Boolean(user?.role)
  const canTakeOrders =
    user?.role === 'mesero' ||
    user?.role === 'caja' ||
    user?.role === 'gerente' ||
    user?.role === 'piso' ||
    user?.role === 'admin'

  const allowDemo =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  const showDemo = allowDemo && connected && categories.length === 0 && items.length === 0
  const viewCategories = showDemo ? demoCategories : categories
  const viewItems = showDemo ? demoItems : items

  const publicHiddenItem = React.useCallback(
    (it: any) => {
      const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      const name = norm(it?.name)
      if (!name) return false
      if (name.includes('mezcal')) return true
      if (name.includes('tinto de verano')) return true
      if (name.includes('sangria en vaso') || name.includes('sangria vaso')) return true
      return false
    },
    [],
  )

  const publicHiddenCategory = React.useCallback(
    (catName: any) => {
      const n = String(catName ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      if (!n) return false
      if (n.includes('jarra')) return true
      if (n.includes('mezcal')) return true
      return false
    },
    [],
  )

  const menuLoading = !catsLoaded || !itemsLoaded

  useEffect(() => {
    setConfirmAddToExistingTab(false)
  }, [cartTableId])

  useEffect(() => {
    const q = query(collection(db, 'tabs'), where('status', '==', 'open'))
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        const takeouts = data
          .filter((t) => String((t as any)?.tableId ?? '').startsWith('togo-'))
          .sort((a, b) => {
            const aMs = (a as any)?.openedAt?.toMillis ? (a as any).openedAt.toMillis() : 0
            const bMs = (b as any)?.openedAt?.toMillis ? (b as any).openedAt.toMillis() : 0
            return bMs - aMs
          })
        setOpenTakeoutTabs(takeouts)
      },
      () => {
        setOpenTakeoutTabs([])
      },
    )
  }, [])

  const toggleExtraForSelectionInstance = React.useCallback((instanceId: string, extraName: string) => {
    setSelectionCfgByInstanceId((prev) => {
      const cur = prev[instanceId] ?? { size: null, halfOtherItemId: null, note: '', extras: [] }
      const list = Array.isArray(cur.extras) ? cur.extras : []
      const has = list.includes(extraName)
      const extras = has ? list.filter((x) => x !== extraName) : [...list, extraName]
      return { ...prev, [instanceId]: { ...cur, extras } }
    })
  }, [])

  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      const msg = ev?.error?.stack ? String(ev.error.stack) : String(ev?.message ?? 'Unknown error')
      setFatalErr((prev) => prev ?? msg)
    }

    const onRejection = (ev: PromiseRejectionEvent) => {
      const r: any = (ev as any)?.reason
      const msg = r?.stack ? String(r.stack) : r?.code ? `${String(r.code)}: ${String(r.message ?? '')}` : String(r?.message ?? r ?? 'Unhandled rejection')
      setFatalErr((prev) => prev ?? msg)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [catsSnap, itemsSnap, extrasSnap] = await Promise.all([
          getDocs(query(collection(db, 'menuCategories'), orderBy('sortOrder', 'asc'))),
          getDocs(query(collection(db, 'menuItems'), orderBy('sortOrder', 'asc'))),
          getDocs(query(collection(db, 'menuExtras'), orderBy('sortOrder', 'asc'))),
        ])

        if (!alive) return

        const catsData: Category[] = catsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((c) => c.isActive)
        const itemsData: Item[] = itemsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((i) => i.isActive)

        const extrasData = extrasSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((x) => (x as any)?.isActive !== false)

        setCategories(catsData)
        setItems(itemsData)
        setMenuExtras(extrasData)
        setConnected(true)
        setCatsLoaded(true)
        setItemsLoaded(true)
        setCatsErr(null)
        setItemsErr(null)
      } catch (err: any) {
        if (!alive) return
        const msg = err?.code ? `${String(err.code)}: ${String(err.message ?? '')}` : String(err?.message ?? err ?? '')
        setConnected(true)
        setCatsLoaded(true)
        setItemsLoaded(true)
        setCatsErr((prev) => prev ?? msg)
        setItemsErr((prev) => prev ?? msg)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!menuLoading) return
    if (loadTimeout) return
    const t = window.setTimeout(() => {
      setLoadTimeout(true)
    }, 8000)
    return () => window.clearTimeout(t)
  }, [menuLoading, loadTimeout])

  const itemById = useMemo(() => {
    const m = new Map<string, Item>()
    for (const it of viewItems) m.set(it.id, it)
    return m
  }, [viewItems])

  const selectionQty = useMemo(() => {
    let n = 0
    for (const k of Object.keys(qtyByItemId)) n += Number(qtyByItemId[k] ?? 0)
    return n
  }, [qtyByItemId])

  const cartQty = useMemo(() => cartLines.reduce((s, l) => s + Number(l.qty ?? 0), 0), [cartLines])

  const newLineId = React.useCallback(() => {
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    } catch {
      // ignore
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  const clearSelection = React.useCallback(() => {
    setQtyByItemId({})
    setSelectionCfgByInstanceId({})
  }, [])

  const EXTRAS_GROUPS_FOOD: Array<{ label: string; items: Array<{ name: string; unitPrice: number }> }> = React.useMemo(() => {
    const fallback: Array<{ label: string; items: Array<{ name: string; unitPrice: number }> }> = [
      {
        label: 'Carnes y embutidos',
        items: [
          { name: 'Pepperoni', unitPrice: 35 },
          { name: 'Jamón', unitPrice: 35 },
          { name: 'Salchicha', unitPrice: 35 },
          { name: 'Jamón serrano', unitPrice: 80 },
        ],
      },
      { label: 'Mariscos', items: [{ name: 'Ostiones', unitPrice: 60 }] },
      { label: 'Quesos', items: [{ name: 'Extra queso', unitPrice: 35 }, { name: 'Queso parmesano', unitPrice: 35 }, { name: 'Queso de cabra', unitPrice: 35 }] },
      {
        label: 'Verduras',
        items: [
          { name: 'Champiñón', unitPrice: 25 },
          { name: 'Cebolla', unitPrice: 25 },
          { name: 'Pimiento', unitPrice: 25 },
          { name: 'Piña', unitPrice: 25 },
          { name: 'Aceituna', unitPrice: 25 },
          { name: 'Espinaca', unitPrice: 25 },
        ],
      },
    ]

    const rows = Array.isArray(menuExtras) ? menuExtras : []
    if (!rows.length) return fallback

    const byGroup = new Map<string, Array<{ name: string; unitPrice: number; sortOrder: number }>>()
    for (const r of rows) {
      const name = String((r as any)?.name ?? '').trim()
      if (!name) continue
      const appliesTo = String((r as any)?.appliesTo ?? 'food').trim().toLowerCase()
      if (appliesTo && appliesTo !== 'food') continue
      const group = String((r as any)?.group ?? 'Extras').trim() || 'Extras'
      const unitPrice = Number((r as any)?.unitPrice ?? 0)
      const sortOrder = Number((r as any)?.sortOrder ?? 0)
      const arr = byGroup.get(group) ?? []
      arr.push({ name, unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0, sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0 })
      byGroup.set(group, arr)
    }

    return Array.from(byGroup.entries())
      .map(([label, items]) => ({
        label,
        items: items
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((x) => ({ name: x.name, unitPrice: x.unitPrice })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [menuExtras])

  const EXTRAS_GROUPS_DRINK: Array<{ label: string; items: Array<{ name: string; unitPrice: number }> }> = React.useMemo(() => {
    const rows = Array.isArray(menuExtras) ? menuExtras : []
    if (!rows.length) return []

    const byGroup = new Map<string, Array<{ name: string; unitPrice: number; sortOrder: number }>>()
    for (const r of rows) {
      const name = String((r as any)?.name ?? '').trim()
      if (!name) continue
      const appliesTo = String((r as any)?.appliesTo ?? 'food').trim().toLowerCase()
      if (appliesTo !== 'drink') continue
      const group = String((r as any)?.group ?? 'Extras').trim() || 'Extras'
      const unitPrice = Number((r as any)?.unitPrice ?? 0)
      const sortOrder = Number((r as any)?.sortOrder ?? 0)
      const arr = byGroup.get(group) ?? []
      arr.push({ name, unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0, sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0 })
      byGroup.set(group, arr)
    }

    return Array.from(byGroup.entries())
      .map(([label, items]) => ({
        label,
        items: items
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((x) => ({ name: x.name, unitPrice: x.unitPrice })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [menuExtras])

  const extrasGroupsForItem = React.useCallback(
    (item: Item) => {
      return isBarItem(item) ? EXTRAS_GROUPS_DRINK : EXTRAS_GROUPS_FOOD
    },
    [EXTRAS_GROUPS_DRINK, EXTRAS_GROUPS_FOOD],
  )

  const extraPriceByName = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const g of EXTRAS_GROUPS_FOOD) for (const it of g.items) m.set(it.name, Number(it.unitPrice ?? 0))
    for (const g of EXTRAS_GROUPS_DRINK) for (const it of g.items) m.set(it.name, Number(it.unitPrice ?? 0))
    return m
  }, [EXTRAS_GROUPS_DRINK, EXTRAS_GROUPS_FOOD])

  const extraUnitPrice = React.useCallback(
    (name: string) => {
      const n = Number(extraPriceByName.get(String(name)) ?? 0)
      return Number.isFinite(n) && n > 0 ? n : 0
    },
    [extraPriceByName],
  )

  const toggleExtraForCartLine = React.useCallback((lineId: string, extraName: string) => {
    setCartLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l
        const has = l.extras.includes(extraName)
        return { ...l, extras: has ? l.extras.filter((x) => x !== extraName) : [...l.extras, extraName] }
      }),
    )
  }, [])

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of viewCategories) m.set(c.id, c.name)
    return m
  }, [viewCategories])

  const normalizeText = React.useCallback((s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''), [])

  const isPizzaItem = React.useCallback(
    (it: Item) => {
      const catName = String(categoryNameById.get(it.categoryId) ?? it.categoryId)
      const n = normalizeText(catName)
      return n.includes('pizza')
    },
    [categoryNameById, normalizeText],
  )

  const itemType = React.useCallback(
    (it: Item) => {
      const catName = String(categoryNameById.get(it.categoryId) ?? it.categoryId)
      const n = normalizeText(catName)
      if (n.includes('pizza')) return 'pizzas' as const
      if (n.includes('calzone')) return 'calzones' as const
      if (n.includes('pan') || n.includes('focaccia') || n.includes('brioche')) return 'panes' as const
      if (
        n.includes('bebida') ||
        n.includes('refresco') ||
        n.includes('soda') ||
        n.includes('cafe') ||
        n.includes('agua') ||
        n.includes('jarra') ||
        n.includes('mezcalita') ||
        n.includes('italiana')
      )
        return 'bebidas' as const
      return 'otros' as const
    },
    [categoryNameById, normalizeText],
  )

  const TAKEOUT_VALUE = '__togo__'

  const filteredItems = React.useMemo(() => {
    const q = normalizeText(productQuery.trim())
    const visibleItems = viewItems.filter((it) => {
      if (typeFilter !== 'all' && itemType(it) !== typeFilter) return false
      if (!q) return true
      const hay = normalizeText(`${it.name ?? ''} ${it.description ?? ''}`)
      return hay.includes(q)
    })
    const categoryNameByIdLocal = new Map<string, string>()
    for (const c of viewCategories) categoryNameByIdLocal.set(String((c as any)?.id ?? ''), String((c as any)?.name ?? ''))

    return visibleItems.filter((it) => {
      const catName = categoryNameByIdLocal.get(String((it as any)?.categoryId ?? '')) ?? ''
      if (publicHiddenCategory(catName)) return false
      if (publicHiddenItem(it)) return false
      return true
    })
  }, [itemType, normalizeText, productQuery, publicHiddenCategory, publicHiddenItem, typeFilter, viewCategories, viewItems])

  const filteredCategories = React.useMemo(() => {
    const q = productQuery.trim()
    if (!q && typeFilter === 'all') return viewCategories.filter((c) => !publicHiddenCategory((c as any)?.name))
    const idsWithItems = new Set(filteredItems.map((it) => it.categoryId))
    return viewCategories.filter((c) => idsWithItems.has(c.id) && !publicHiddenCategory((c as any)?.name))
  }, [filteredItems, productQuery, publicHiddenCategory, typeFilter, viewCategories])

  const navCategories = React.useMemo(() => {
    const q = productQuery.trim()
    if (!q && typeFilter === 'all') return viewCategories.filter((c) => !publicHiddenCategory((c as any)?.name))
    return filteredCategories
  }, [filteredCategories, productQuery, publicHiddenCategory, typeFilter, viewCategories])

  function isBarItem(it: Item) {
    return itemType(it) === 'bebidas'
  }

  const selectionInstances = useMemo(() => {
    const out: Array<{ instanceId: string; item: Item; cfg: { size: PizzaSize | null; halfOtherItemId: string | null; note: string; extras: string[] } }> = []
    for (const [itemId, qty] of Object.entries(qtyByItemId)) {
      const it = itemById.get(itemId)
      if (!it) continue
      const q = Number(qty ?? 0)
      if (!q) continue
      for (let idx = 0; idx < q; idx++) {
        const instanceId = `${itemId}__${idx}`
        const cur = selectionCfgByInstanceId[instanceId]
        const cfg = {
          size: itemHasSizes(it) ? (cur?.size ?? 'cm30') : null,
          halfOtherItemId: itemHasSizes(it) ? (cur?.halfOtherItemId ?? null) : null,
          note: String(cur?.note ?? ''),
          extras: Array.isArray(cur?.extras) ? cur.extras : [],
        }
        out.push({ instanceId, item: it, cfg })
      }
    }
    out.sort((a, b) => a.item.categoryId.localeCompare(b.item.categoryId) || a.item.sortOrder - b.item.sortOrder)
    return out
  }, [itemById, qtyByItemId, selectionCfgByInstanceId])

  const addSelectionToCart = React.useCallback(() => {
    if (selectionInstances.length === 0) return
    setCartLines((prev) => {
      const next = [...prev]
      for (const s of selectionInstances) {
        const note = String(s.cfg.note ?? '').trim() || null
        next.push({
          lineId: newLineId(),
          itemId: s.item.id,
          qty: 1,
          size: s.cfg.size,
          halfOtherItemId: s.cfg.halfOtherItemId,
          note,
          extras: s.cfg.extras,
        })
      }
      return next
    })
    clearSelection()
  }, [clearSelection, newLineId, selectionInstances])

  const pizzaOptions = useMemo(() => {
    return viewItems.filter((it) => itemHasSizes(it) && it.isActive)
  }, [viewItems])

  const lineLabel = React.useCallback(
    (item: Item, halfOtherItemId: string | null) => {
      const otherId = String(halfOtherItemId ?? '')
      const other = otherId ? itemById.get(otherId) : null
      if (other) return `${item.name} / ${other.name}`
      return item.name
    },
    [itemById],
  )

  const lineUnitPrice = React.useCallback(
    (item: Item, size: PizzaSize | null, halfOtherItemId: string | null) => {
      const effectiveSize = itemHasSizes(item) ? (size ?? 'cm30') : null
      const p1 = priceForSize(item, effectiveSize)
      const otherId = String(halfOtherItemId ?? '')
      const other = otherId ? itemById.get(otherId) : null
      const p2 = other ? priceForSize(other, effectiveSize) : null
      return p2 != null ? Math.max(p1, p2) : p1
    },
    [itemById],
  )

  const tableLabelById: Record<string, string> = {
    'mesa-01': 'Mesa 1',
    'mesa-02': 'Mesa 2',
    'mesa-03': 'Mesa 3',
    'mesa-04': 'Mesa 4',
    'mesa-05': 'Mesa 5',
    'mesa-06': 'Mesa 6',
    'mesa-07': 'Mesa 7',
    'mesa-08': 'Mesa 8',
    'mesa-09': 'Mesa 9',
    'mesa-10': 'Mesa 10',
  }

  const allowedTables = Object.keys(tableLabelById)
  const takeoutLabelById = React.useMemo(() => {
    const out: Record<string, string> = {}
    for (const t of openTakeoutTabs) {
      const id = String((t as any)?.tableId ?? '').trim()
      if (!id) continue
      const n = Number(String(id).replace('togo-', ''))
      const base = Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
      const name = String((t as any)?.tabName ?? '').trim()
      out[id] = name ? `${base} · ${name}` : base
    }
    return out
  }, [openTakeoutTabs])
  const openTakeoutTableIds = React.useMemo(() => new Set(Object.keys(takeoutLabelById)), [takeoutLabelById])
  const rawTableId = (searchParams.get('mesa') ?? '').trim()
  const wantsTakeout = String(searchParams.get('togo') ?? '').trim() === '1' || rawTableId === TAKEOUT_VALUE
  const tableId = wantsTakeout
    ? TAKEOUT_VALUE
    : allowedTables.includes(rawTableId)
      ? rawTableId
      : openTakeoutTableIds.has(rawTableId)
        ? rawTableId
        : null
  const tableLabel = tableId
    ? tableId === TAKEOUT_VALUE
      ? 'Para llevar'
      : tableLabelById[tableId] ?? takeoutLabelById[tableId] ?? tableId
    : null

  useEffect(() => {
    const title = tableLabel ? `Patanegra · ${tableLabel}` : 'Patanegra · Menú'
    document.title = title

    const desc = tableLabel
      ? `Menú digital Patanegra. Mesa: ${tableLabel}. Pizzas, bebidas y más.`
      : 'Menú digital Patanegra. Pizzas, bebidas y más.'

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
    ensureMeta('property', 'og:title').setAttribute('content', title)
    ensureMeta('property', 'og:description').setAttribute('content', desc)
    ensureMeta('property', 'og:image').setAttribute('content', '/logo1.png')
    ensureMeta('name', 'twitter:title').setAttribute('content', title)
    ensureMeta('name', 'twitter:description').setAttribute('content', desc)
    ensureMeta('name', 'twitter:image').setAttribute('content', '/logo1.png')

    const categoriesJson = viewCategories.map((c) => ({
      '@type': 'MenuSection',
      name: c.name,
      hasMenuItem: viewItems
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          '@type': 'MenuItem',
          name: i.name,
          description: i.description ?? undefined,
        })),
    }))

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Patanegra',
      image: '/logo1.png',
      servesCuisine: ['Pizza', 'Italiana', 'Mexicana'],
      hasMenu: {
        '@type': 'Menu',
        name: 'Menú',
        hasMenuSection: categoriesJson,
      },
    }

    const scriptId = 'ld-patanegra-menu'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.id = scriptId
      document.head.appendChild(script)
    }
    script.text = JSON.stringify(ld)
  }, [tableLabel])

  useEffect(() => {
    const q = query(collection(db, 'menuCategories'), orderBy('sortOrder', 'asc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: Category[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((c) => c.isActive)
        setCategories(data)
        setConnected(true)
        setCatsLoaded(true)
        setCatsErr(null)
      },
      (err) => {
        setCategories([])
        setConnected(true)
        setCatsLoaded(true)
        setCatsErr(err?.code ? `${String(err.code)}: ${String(err.message ?? '')}` : String(err?.message ?? err ?? ''))
      },
    )
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('sortOrder', 'asc'))
    return onSnapshot(
      q,
      (snap) => {
        const data: Item[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((i) => i.isActive)
        setItems(data)
        setConnected(true)
        setItemsLoaded(true)
        setItemsErr(null)
      },
      (err) => {
        setItems([])
        setConnected(true)
        setItemsLoaded(true)
        setItemsErr(err?.code ? `${String(err.code)}: ${String(err.message ?? '')}` : String(err?.message ?? err ?? ''))
      },
    )
  }, [])

  const staffHomePath =
    user?.role === 'mesero'
      ? '/mesero'
      : user?.role === 'almacen'
        ? '/almacen'
        : user?.role === 'caja'
          ? '/caja'
          : user?.role === 'gerente'
            ? '/caja'
            : user?.role === 'admin' || user?.role === 'piso'
              ? '/admin'
              : null

  const sectionPalette = (categoryId: string, idx: number) => {
    const byId: Record<string, { bg: string; band: string; ink: string }> = {
      pizzas: { bg: '#064e3b', band: '#dc2626', ink: '#ffffff' },
      calzones: { bg: '#7c2d12', band: '#16a34a', ink: '#ffffff' },
      bebidas: { bg: '#1d4ed8', band: '#f59e0b', ink: '#ffffff' },
    }
    const fallback = [
      { bg: '#064e3b', band: '#dc2626', ink: '#ffffff' },
      { bg: '#b91c1c', band: '#16a34a', ink: '#ffffff' },
      { bg: '#1d4ed8', band: '#dc2626', ink: '#ffffff' },
      { bg: '#a21caf', band: '#16a34a', ink: '#ffffff' },
    ]
    return byId[categoryId] ?? fallback[idx % fallback.length]
  }

  return (
    <div className="container menuPublicoRoot" style={{ position: 'relative', paddingTop: 12 }}>
      <div
        className="menuPublicoBg"
        aria-hidden="true"
        style={{ backgroundImage: 'url(/backpat.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
      />

      {fatalErr ? (
        <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: 'rgba(185, 28, 28, 0.35)' }}>
          <strong style={{ color: '#991b1b' }}>Error en el menú</strong>
          <div className="muted" style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{fatalErr}</div>
          <div className="muted" style={{ fontSize: 10, marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {typeof navigator !== 'undefined' ? `UA: ${navigator.userAgent}` : ''}
          </div>
          <div style={{ height: 10 }} />
          <button className="button secondary" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      ) : null}

      {menuLoading ? (
        <div className="card" style={{ marginBottom: 12, padding: 12 }}>
          <strong style={{ color: '#111827' }}>Cargando menú…</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Si estás en iPhone y tarda, revisa tu conexión WiFi.
          </div>
        </div>
      ) : null}

      {loadTimeout && menuLoading && !allowDemo ? (
        <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: 'rgba(185, 28, 28, 0.35)' }}>
          <strong style={{ color: '#991b1b' }}>No se pudo cargar el menú</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Revisa tu conexión e intenta de nuevo. Si estás abriendo desde WhatsApp/Instagram, prueba en Safari.
          </div>
          {catsErr || itemsErr ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {catsErr ? `menuCategories: ${catsErr}` : ''}
              {catsErr && itemsErr ? '\n' : ''}
              {itemsErr ? `menuItems: ${itemsErr}` : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      {!menuLoading && (catsErr || itemsErr) && !allowDemo ? (
        <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: 'rgba(185, 28, 28, 0.35)' }}>
          <strong style={{ color: '#991b1b' }}>Error cargando menú</strong>
          <div className="muted" style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {catsErr ? `menuCategories: ${catsErr}` : ''}
            {catsErr && itemsErr ? '\n' : ''}
            {itemsErr ? `menuItems: ${itemsErr}` : ''}
          </div>
        </div>
      ) : null}

      {user ? (
        <div className="card" style={{ marginBottom: 10, padding: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Sesión activa:{' '}
              <strong style={{ color: 'inherit' }}>{(user.displayName ?? user.email ?? '—').toUpperCase()}</strong>
              {tableLabel ? <span style={{ marginLeft: 10 }}>· Estás en <strong style={{ color: 'inherit' }}>{tableLabel}</strong></span> : null}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {staffHomePath ? (
                <Link className="button secondary" to={staffHomePath}>
                  Ir a panel
                </Link>
              ) : null}
              <button className="button secondary" onClick={logout}>
                Salir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ height: 140 }} />

      <div className="card" style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            className="input"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Buscar producto…"
          />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              className="button secondary"
              style={{ borderColor: typeFilter === 'all' ? '#111827' : '#e5e7eb' }}
              onClick={() => setTypeFilter('all')}
            >
              Todo
            </button>

            {productQuery.trim() || typeFilter !== 'all' ? (
              <button
                className="button secondary"
                style={{ borderColor: '#e5e7eb' }}
                onClick={() => {
                  setProductQuery('')
                  setTypeFilter('all')
                }}
              >
                Limpiar
              </button>
            ) : null}
          </div>

          {productQuery.trim() || typeFilter !== 'all' ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Mostrando <strong style={{ color: 'inherit' }}>{filteredItems.length}</strong> producto(s).
            </div>
          ) : null}
        </div>
      </div>

      <div className="menuPublicoStickyNav">
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <button
            className="button secondary"
            style={{ borderColor: '#e5e7eb' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            Inicio
          </button>

          {navCategories.map((c) => (
            <button
              key={c.id}
              className="button secondary"
              style={{ borderColor: '#e5e7eb' }}
              onClick={() => {
                const el = document.getElementById(`cat-${c.id}`)
                if (!el) return
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {String(c.name).toLowerCase().includes('bebid') ? 'Bebidas' : String(c.name).toLowerCase().includes('soda') ? 'Sodas' : c.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {filteredCategories.map((c, idx) => {
          const p = sectionPalette(c.id, idx)
          return (
          <div
            key={c.id}
            id={`cat-${c.id}`}
            className="menuSection"
            style={{ ['--section-bg' as any]: p.bg, ['--section-band' as any]: p.band, ['--section-ink' as any]: p.ink }}
          >
            <div className="menuSectionHeader">
              <strong className="menuSectionTitle">{c.name}</strong>
              <span className="menuSectionBand" />
            </div>

            <div className="card" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <div style={{ height: 10 }} />

              <div style={{ display: 'grid', gap: 10 }}>
                {filteredItems
                  .filter((i) => i.categoryId === c.id)
                  .map((i, itemIdx) => (
                    <div
                      key={i.id}
                      style={{
                        background:
                          itemIdx % 4 === 0
                            ? 'rgba(22,163,74,0.04)'
                            : itemIdx % 4 === 2
                              ? 'rgba(220,38,38,0.05)'
                              : 'rgba(255,255,255,0.05)',
                        display: 'grid',
                        gap: 4,
                        padding: '10px 10px',
                        borderRadius: 12,
                      }}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <strong className={`menuItemName${typeof i.promoPercent === 'number' && i.promoPercent > 0 ? ' promo' : ''}`}>{i.name}</strong>
                        {getPrice20(i) != null ? (
                          <div style={{ display: 'grid', gap: 2, textAlign: 'right' }}>
                            <div className="muted" style={{ fontSize: 12 }}>
                              <span style={{ marginRight: 10 }}>30 cm</span>
                              {typeof i.promoPercent === 'number' && i.promoPercent > 0 ? (
                                <span className="pricePromo">
                                  <span className="priceOld">{money(getPrice30(i))}</span>
                                  <strong className="priceNew">{money(applyPercentOff(getPrice30(i), i.promoPercent))}</strong>
                                </span>
                              ) : (
                                <strong className="menuItemPrice">{money(getPrice30(i))}</strong>
                              )}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              <span style={{ marginRight: 10 }}>20 cm</span>
                              {typeof i.promoPercent === 'number' && i.promoPercent > 0 ? (
                                <span className="pricePromo">
                                  <span className="priceOld">{money(Number(getPrice20(i) ?? 0))}</span>
                                  <strong className="priceNew">{money(applyPercentOff(Number(getPrice20(i) ?? 0), i.promoPercent))}</strong>
                                </span>
                              ) : (
                                <strong className="menuItemPrice">{money(Number(getPrice20(i) ?? 0))}</strong>
                              )}
                            </div>
                          </div>
                        ) : (
                          typeof i.promoPercent === 'number' && i.promoPercent > 0 ? (
                            <span className="menuItemPrice pricePromo">
                              <span className="priceOld">{money(getPrice30(i))}</span>
                              <strong className="priceNew">{money(applyPercentOff(getPrice30(i), i.promoPercent))}</strong>
                            </span>
                          ) : (
                            <strong className="menuItemPrice">{money(getPrice30(i))}</strong>
                          )
                        )}
                      </div>

                      {canTakeOrders ? (
                        <div className="qtyRow">
                          <button
                            className="qtyBtn"
                            onClick={() => {
                              setQtyByItemId((prev) => {
                                const cur = Number(prev[i.id] ?? 0)
                                const next = Math.max(0, cur - 1)
                                const out = { ...prev }
                                if (next === 0) delete out[i.id]
                                else out[i.id] = next
                                return out
                              })
                            }}
                          >
                            −
                          </button>
                          <div className="qtyValue">{Number(qtyByItemId[i.id] ?? 0)}</div>
                          <button
                            className="qtyBtn"
                            onClick={() => {
                              setQtyByItemId((prev) => ({ ...prev, [i.id]: Number(prev[i.id] ?? 0) + 1 }))
                            }}
                          >
                            +
                          </button>
                        </div>
                      ) : null}
                      {typeof i.promoPercent === 'number' && i.promoPercent > 0 ? (
                        <div className="promoLine">
                          <span className="promoBadge">-{Math.round(i.promoPercent)}%</span>
                          <span className="muted">{(i.promoLabel ?? 'Descuento')}</span>
                        </div>
                      ) : null}
                      {i.description ? <div className="muted">{i.description}</div> : null}
                    </div>
                  ))}

                {filteredItems.filter((i) => i.categoryId === c.id).length === 0 ? (
                  <div className="muted">Sin productos.</div>
                ) : null}
              </div>
            </div>
          </div>
          )
        })}

        {connected && !menuLoading && !catsErr && !itemsErr && viewCategories.length === 0 ? (
          <div className="muted">Menú no configurado.</div>
        ) : null}
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 12,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 8, justifyItems: 'center' }}>
          {callMessage ? <div className="callMessage">{callMessage}</div> : null}
          {!isStaff ? (
            <button
              className="callWaiterFab"
              disabled={callBusy}
              style={{ pointerEvents: 'auto' }}
              onClick={async () => {
                setCallMessage(null)
                if (!tableId) {
                  setCallMessage('Selecciona una mesa válida (NFC).')
                  return
                }

                const key = `waiterCallCooldown:${tableId}`
                const last = Number(localStorage.getItem(key) ?? '0')
                const now = Date.now()
                const cooldownMs = 60_000
                if (now - last < cooldownMs) {
                  const s = Math.ceil((cooldownMs - (now - last)) / 1000)
                  setCallMessage(`Ya avisamos. Intenta de nuevo en ${s}s.`)
                  return
                }

                setCallBusy(true)
                try {
                  await addDoc(collection(db, 'waiterCalls'), {
                    tableId,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                  })
                  localStorage.setItem(key, String(Date.now()))
                  setCallMessage('Listo. Un mesero va en camino.')
                } catch {
                  setCallMessage('No se pudo enviar el llamado. Intenta de nuevo.')
                } finally {
                  setCallBusy(false)
                }
              }}
            >
              Llamar al mesero
            </button>
          ) : null}
        </div>
      </div>

      {canTakeOrders && (cartQty > 0 || selectionQty > 0) ? (
        <button
          className="orderBubble"
          role="status"
          aria-live="polite"
          onClick={() => {
            setCartTableId((prev) => {
              if (String(prev ?? '').trim()) return prev
              if (tableId) return String(tableId)
              const firstOpenTakeout = Object.keys(takeoutLabelById)[0]
              return firstOpenTakeout ? String(firstOpenTakeout) : TAKEOUT_VALUE
            })
            setCartOpen(true)
          }}
        >
          <span>Pedido</span>
          <span className="orderBubbleCount">
            {cartQty + selectionQty}
          </span>
        </button>
      ) : null}

      {canTakeOrders && cartOpen ? (
        <div className="cartOverlay" onClick={() => setCartOpen(false)}>
          <div className="cartPanel" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Pedido</strong>
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>Mesa</div>
              <select
                className="input"
                value={cartTableId}
                onChange={(e) => {
                  const v = e.target.value
                  setCartTableId(v)
                  if (v !== TAKEOUT_VALUE) {
                    setTakeoutName('')
                  }
                }}
              >
                <option value="">Selecciona mesa…</option>
                <option value={TAKEOUT_VALUE}>Para llevar</option>
                {Object.keys(takeoutLabelById).length ? (
                  <optgroup label="Para llevar (abiertos)">
                    {Object.keys(takeoutLabelById).map((t) => (
                      <option key={t} value={t}>
                        {takeoutLabelById[t] ?? t}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Mesas">
                {allowedTables.map((t) => (
                  <option key={t} value={t}>
                    {tableLabelById[t] ?? t}
                  </option>
                ))}
                </optgroup>
              </select>
            </div>

            {sendMsg ? <div className="muted" style={{ marginBottom: 10 }}>{sendMsg}</div> : null}

            {selectionInstances.length ? (
              <div className="card" style={{ margin: 0, padding: 10 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Selección actual (aún no agregada)</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectionInstances.map((s) => (
                    <div key={s.instanceId} className="cartLine" style={{ margin: 0 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{lineLabel(s.item, s.cfg.halfOtherItemId)}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{categoryNameById.get(s.item.categoryId) ?? s.item.categoryId}</div>
                        {itemHasSizes(s.item) ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Tamaño: <strong style={{ color: '#111827' }}>{(s.cfg.size ?? 'cm30') === 'cm20' ? '20' : '30'}</strong>
                          </div>
                        ) : null}
                        <div className="muted" style={{ fontSize: 12 }}>
                          Precio:{' '}
                          <strong style={{ color: '#111827' }}>{money(Math.round(lineUnitPrice(s.item, s.cfg.size, s.cfg.halfOtherItemId) * 100) / 100)}</strong>{' '}
                          <span className="muted">({money(lineUnitPrice(s.item, s.cfg.size, s.cfg.halfOtherItemId))} x 1)</span>
                        </div>

                        <div style={{ height: 6 }} />
                        <input
                          className="input"
                          placeholder="Especificaciones (ej. sin jamón, sin cebolla…)"
                          value={String(selectionCfgByInstanceId[s.instanceId]?.note ?? '')}
                          onChange={(e) => {
                            const v = e.target.value
                            setSelectionCfgByInstanceId((p) => {
                              const cur = p[s.instanceId] ?? { size: s.cfg.size, halfOtherItemId: s.cfg.halfOtherItemId, note: '', extras: s.cfg.extras }
                              return { ...p, [s.instanceId]: { ...cur, note: v } }
                            })
                          }}
                          style={{ maxWidth: 420 }}
                        />

                        <div style={{ height: 8 }} />
                        {(() => {
                          const groups = extrasGroupsForItem(s.item)
                          if (!groups.length) return null
                          return (
                            <details>
                              <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                                Extras
                                {Array.isArray(selectionCfgByInstanceId[s.instanceId]?.extras) && (selectionCfgByInstanceId[s.instanceId]?.extras ?? []).length
                                  ? ` · ${(selectionCfgByInstanceId[s.instanceId]?.extras ?? []).length}`
                                  : ''}
                              </summary>
                              <div style={{ height: 6 }} />
                              <div style={{ display: 'grid', gap: 10 }}>
                                {groups.map((g) => (
                                  <div key={g.label}>
                                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.label}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                                      {g.items.map((x) => (
                                        <label key={x.name} className="row" style={{ gap: 8, alignItems: 'center' }}>
                                          <input
                                            type="checkbox"
                                            checked={Boolean((selectionCfgByInstanceId[s.instanceId]?.extras ?? s.cfg.extras).includes(x.name))}
                                            onChange={() => toggleExtraForSelectionInstance(s.instanceId, x.name)}
                                          />
                                          <span style={{ fontSize: 12 }}>{x.name}</span>
                                          <span className="muted" style={{ fontSize: 12 }}>+{money(x.unitPrice)}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )
                        })()}
                      </div>

                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {itemHasSizes(s.item) ? (
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                            <button
                              className="button secondary"
                              style={{ padding: '6px 10px', borderColor: (s.cfg.size ?? 'cm30') === 'cm20' ? '#111827' : '#e5e7eb' }}
                              onClick={() => {
                                setSelectionCfgByInstanceId((p) => {
                                  const cur = p[s.instanceId] ?? { size: s.cfg.size, halfOtherItemId: s.cfg.halfOtherItemId, note: s.cfg.note, extras: s.cfg.extras }
                                  return { ...p, [s.instanceId]: { ...cur, size: 'cm20' } }
                                })
                              }}
                            >
                              20
                            </button>
                            <button
                              className="button secondary"
                              style={{ padding: '6px 10px', borderColor: (s.cfg.size ?? 'cm30') === 'cm30' ? '#111827' : '#e5e7eb' }}
                              onClick={() => {
                                setSelectionCfgByInstanceId((p) => {
                                  const cur = p[s.instanceId] ?? { size: s.cfg.size, halfOtherItemId: s.cfg.halfOtherItemId, note: s.cfg.note, extras: s.cfg.extras }
                                  return { ...p, [s.instanceId]: { ...cur, size: 'cm30' } }
                                })
                              }}
                            >
                              30
                            </button>
                          </div>
                        ) : null}

                        {itemHasSizes(s.item) ? (
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                            <button
                              className="button secondary"
                              style={{ padding: '6px 10px', borderColor: s.cfg.halfOtherItemId ? '#111827' : '#e5e7eb' }}
                              onClick={() => {
                                setSelectionCfgByInstanceId((p) => {
                                  const cur = p[s.instanceId] ?? { size: s.cfg.size, halfOtherItemId: s.cfg.halfOtherItemId, note: s.cfg.note, extras: s.cfg.extras }
                                  return { ...p, [s.instanceId]: { ...cur, halfOtherItemId: cur.halfOtherItemId ? null : '' } }
                                })
                              }}
                            >
                              Mitad y mitad
                            </button>
                            {s.cfg.halfOtherItemId != null ? (
                              <select
                                value={s.cfg.halfOtherItemId ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setSelectionCfgByInstanceId((p) => {
                                    const cur = p[s.instanceId] ?? { size: s.cfg.size, halfOtherItemId: s.cfg.halfOtherItemId, note: s.cfg.note, extras: s.cfg.extras }
                                    return { ...p, [s.instanceId]: { ...cur, halfOtherItemId: v } }
                                  })
                                }}
                                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}
                              >
                                <option value="">Selecciona el otro sabor</option>
                                {pizzaOptions
                                  .filter((x) => x.id !== s.item.id)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.name}
                                    </option>
                                  ))}
                              </select>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {cartLines.length === 0 ? <div className="muted">Aún no hay productos agregados al pedido.</div> : null}
            {cartLines.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {cartLines.map((l) => {
                  const item = itemById.get(l.itemId)
                  if (!item) return null
                  const qty = Number(l.qty ?? 0)
                  const extrasCount = Array.isArray(l.extras) ? l.extras.length : 0
                  const extrasTotal = extrasCount > 0 ? l.extras.reduce((s, nm) => s + extraUnitPrice(String(nm)) * qty, 0) : 0
                  return (
                    <div key={l.lineId} className="cartLine">
                      <div>
                        <div style={{ fontWeight: 900 }}>{lineLabel(item, l.halfOtherItemId)}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{categoryNameById.get(item.categoryId) ?? item.categoryId}</div>
                        {itemHasSizes(item) ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Tamaño: <strong style={{ color: '#111827' }}>{(l.size ?? 'cm30') === 'cm20' ? '20' : '30'}</strong>
                          </div>
                        ) : null}
                        <div className="muted" style={{ fontSize: 12 }}>
                          Precio:{' '}
                          <strong style={{ color: '#111827' }}>{money(Math.round((lineUnitPrice(item, l.size, l.halfOtherItemId) * qty + extrasTotal) * 100) / 100)}</strong>{' '}
                          <span className="muted">({money(lineUnitPrice(item, l.size, l.halfOtherItemId))} x {qty})</span>
                        </div>
                        {l.note ? <div className="muted" style={{ fontSize: 12 }}>* {String(l.note)}</div> : null}
                        {extrasCount ? <div className="muted" style={{ fontSize: 12 }}>+ Extras: {extrasCount} (x{qty})</div> : null}

                        <div style={{ height: 6 }} />
                        <details>
                          <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                            Editar extras
                            {extrasCount ? ` · ${extrasCount}` : ''}
                          </summary>
                          <div style={{ height: 6 }} />
                          {(() => {
                            const groups = extrasGroupsForItem(item)
                            if (!groups.length) return <div className="muted" style={{ fontSize: 12 }}>Sin extras para este producto.</div>
                            return (
                              <div style={{ display: 'grid', gap: 10 }}>
                                {groups.map((g) => (
                                  <div key={g.label}>
                                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.label}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                                      {g.items.map((x) => (
                                        <label key={x.name} className="row" style={{ gap: 8, alignItems: 'center' }}>
                                          <input
                                            type="checkbox"
                                            checked={Boolean((l.extras ?? []).includes(x.name))}
                                            onChange={() => toggleExtraForCartLine(l.lineId, x.name)}
                                          />
                                          <span style={{ fontSize: 12 }}>{x.name}</span>
                                          <span className="muted" style={{ fontSize: 12 }}>+{money(x.unitPrice)}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </details>
                      </div>
                      <div className="row" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className="qtyBtn"
                          onClick={() => {
                            setCartLines((prev) =>
                              prev
                                .map((x) => (x.lineId === l.lineId ? { ...x, qty: Math.max(0, Number(x.qty ?? 0) - 1) } : x))
                                .filter((x) => Number(x.qty ?? 0) > 0),
                            )
                          }}
                        >
                          −
                        </button>
                        <div className="qtyValue">{qty}</div>
                        <button
                          className="qtyBtn"
                          onClick={() => {
                            setCartLines((prev) => prev.map((x) => (x.lineId === l.lineId ? { ...x, qty: Number(x.qty ?? 0) + 1 } : x)))
                          }}
                        >
                          +
                        </button>
                        <button
                          className="button secondary"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            setCartLines((prev) => prev.filter((x) => x.lineId !== l.lineId))
                          }}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div style={{ height: 12 }} />

            <button className="button secondary" disabled={selectionInstances.length === 0} onClick={addSelectionToCart}>
              Agregar selección al pedido ({selectionQty})
            </button>

            <button
              className="button"
              disabled={sendBusy || (cartLines.length === 0 && selectionInstances.length === 0)}
              onClick={async () => {
                setSendMsg(null)
                const chosen = (cartTableId ?? '').trim()
                if (!chosen) {
                  setSendMsg('Selecciona una mesa válida.')
                  return
                }
                if (chosen !== TAKEOUT_VALUE && !allowedTables.includes(chosen) && !openTakeoutTableIds.has(chosen)) {
                  setSendMsg('Selecciona una mesa válida.')
                  return
                }
                const takeoutNameEffective =
                  chosen !== TAKEOUT_VALUE
                    ? ''
                    : takeoutName.trim() || String(window.prompt('¿A nombre de quién va la orden?', '') ?? '').trim()
                if (chosen === TAKEOUT_VALUE && !takeoutNameEffective) {
                  setSendMsg('Falta el nombre para Para llevar.')
                  return
                }
                if (chosen === TAKEOUT_VALUE && takeoutNameEffective && takeoutNameEffective !== takeoutName.trim()) {
                  setTakeoutName(takeoutNameEffective)
                }

                const selectionAsCartLines = selectionInstances.map((s) => ({
                  lineId: newLineId(),
                  itemId: s.item.id,
                  qty: 1,
                  size: s.cfg.size,
                  halfOtherItemId: s.cfg.halfOtherItemId,
                  note: String(s.cfg.note ?? '').trim() || null,
                  extras: s.cfg.extras,
                }))

                const cartResolved = [...cartLines, ...selectionAsCartLines]
                  .map((l) => ({ line: l, item: itemById.get(l.itemId) }))
                  .filter((x) => x.item)
                  .map((x) => ({ line: x.line, item: x.item as Item }))

                const kitchenLines = cartResolved.filter((l) => !isBarItem(l.item))
                const barLines = cartResolved.filter((l) => isBarItem(l.item))

                const isTakeoutOrder = chosen === TAKEOUT_VALUE || String(chosen).startsWith('togo-')
                const pizzasQty = cartResolved.reduce((sum, l) => (isPizzaItem(l.item) ? sum + Number(l.line?.qty ?? 0) : sum), 0)
                const boxQty = isTakeoutOrder ? pizzasQty : 0
                const boxTotal = boxQty > 0 ? Math.round(boxQty * 5 * 100) / 100 : 0
                const extrasTotalAll = cartResolved.reduce((sum, l) => {
                  const extrasCount = Array.isArray((l.line as any)?.extras) ? (l.line as any).extras.length : 0
                  if (!extrasCount) return sum
                  const qty = Number((l.line as any)?.qty ?? 0)
                  const extras = Array.isArray((l.line as any)?.extras) ? (l.line as any).extras : []
                  return sum + extras.reduce((s: number, nm: string) => s + extraUnitPrice(String(nm)) * qty, 0)
                }, 0)

                const orderDelta = cartResolved.reduce((sum, l) => {
                  const unit = lineUnitPrice(l.item, (l.line as any)?.size ?? null, (l.line as any)?.halfOtherItemId ?? null)
                  return sum + unit * Number(l.line?.qty ?? 0)
                }, 0)
                const orderDeltaWithExtras = Math.round((orderDelta + boxTotal + extrasTotalAll) * 100) / 100

                setSendBusy(true)
                try {
                  let effectiveTableId = chosen
                  let effectiveTableLabel = tableLabelById[chosen] ?? takeoutLabelById[chosen] ?? chosen
                  let tabId: string | null = null
                  let prevTotal = 0

                  if (chosen === TAKEOUT_VALUE) {
                    const ref = doc(db, 'ops', 'current')
                    let createdTableId = ''
                    let createdTabId = ''
                    const name = takeoutNameEffective
                    await runTransaction(db, async (tx) => {
                      const snap = await tx.get(ref)
                      const data = snap.exists() ? (snap.data() as any) : {}
                      const prev = Number(data?.takeoutSeq ?? 0)
                      const next = prev + 1
                      tx.set(ref, { takeoutSeq: next }, { merge: true })

                      const tableId = `togo-${String(next)}`
                      createdTableId = tableId
                      const tabRef = doc(collection(db, 'tabs'))
                      createdTabId = tabRef.id
                      tx.set(tabRef, {
                        tableId,
                        kind: 'takeout',
                        takeoutNo: next,
                        tabName: name,
                        status: 'open',
                        total: 0,
                        openedAt: serverTimestamp(),
                        createdByUid: user?.uid ?? null,
                        createdByName: user?.displayName ?? user?.email ?? null,
                        createdByStaffId: (user as any)?.staffId ?? null,
                      })
                    })

                    effectiveTableId = createdTableId
                    effectiveTableLabel = takeoutNameEffective || `Para llevar #${Number(effectiveTableId.replace('togo-', '')) || ''}`.trim()
                    tabId = createdTabId
                    prevTotal = 0
                  } else {
                    const existingTabSnap = await getDocs(
                      query(
                        collection(db, 'tabs'),
                        where('tableId', '==', effectiveTableId),
                        where('status', '==', 'open'),
                        limit(1),
                      ),
                    )

                    if (existingTabSnap.empty) {
                      setConfirmAddToExistingTab(false)
                      const ref = await addDoc(collection(db, 'tabs'), {
                        tableId: effectiveTableId,
                        status: 'open',
                        openedAt: serverTimestamp(),
                        total: 0,
                        createdByUid: user?.uid ?? null,
                        createdByName: user?.displayName ?? user?.email ?? null,
                        createdByStaffId: (user as any)?.staffId ?? null,
                      })
                      tabId = ref.id
                      prevTotal = 0
                    } else {
                      if (!confirmAddToExistingTab) {
                        setConfirmAddToExistingTab(true)
                        setSendMsg('Ya hay una cuenta abierta en esta mesa. Este pedido se agregará a la cuenta existente. Presiona "Enviar pedido" otra vez para confirmar.')
                        return
                      }
                      const d = existingTabSnap.docs[0]
                      tabId = d.id
                      prevTotal = Number((d.data() as any)?.total ?? 0)
                    }
                  }

                  const base = {
                    tabId,
                    tableId: effectiveTableId,
                    tableLabel: effectiveTableLabel,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    createdByUid: user?.uid ?? null,
                    createdByName: user?.displayName ?? user?.email ?? null,
                    createdByStaffId: (user as any)?.staffId ?? null,
                  }

                  if (kitchenLines.length) {
                    await addDoc(collection(db, 'orders'), {
                      ...base,
                      area: 'kitchen',
                      items: [
                        ...kitchenLines.map((l) => ({
                          itemId: l.item.id,
                          name: lineLabel(l.item, (l.line as any)?.halfOtherItemId ?? null),
                          qty: Number(l.line?.qty ?? 0),
                          categoryId: l.item.categoryId,
                          categoryName: String(categoryNameById.get(l.item.categoryId) ?? ''),
                          size: itemHasSizes(l.item) ? (l.line?.size ?? 'cm30') : null,
                          halfItemId: itemHasSizes(l.item) ? (l.line?.halfOtherItemId ?? null) : null,
                          halfName: itemHasSizes(l.item)
                            ? l.line?.halfOtherItemId
                              ? itemById.get(String(l.line.halfOtherItemId))?.name ?? null
                              : null
                            : null,
                          note: String(l.line?.note ?? '').trim() || null,
                          extras: (Array.isArray((l.line as any)?.extras) ? (l.line as any).extras : []).map((nm: string) => ({
                            name: String(nm),
                            unitPrice: extraUnitPrice(String(nm)),
                            qty: Number(l.line?.qty ?? 0),
                            lineTotal: Math.round(extraUnitPrice(String(nm)) * Number(l.line?.qty ?? 0) * 100) / 100,
                          })),
                          unitPrice: lineUnitPrice(l.item, (l.line as any)?.size ?? null, (l.line as any)?.halfOtherItemId ?? null),
                          lineTotal: Math.round((lineUnitPrice(l.item, (l.line as any)?.size ?? null, (l.line as any)?.halfOtherItemId ?? null) * Number(l.line?.qty ?? 0) + (Array.isArray((l.line as any)?.extras) ? (l.line as any).extras.reduce((s: number, nm: string) => s + extraUnitPrice(String(nm)) * Number(l.line?.qty ?? 0), 0) : 0)) * 100) / 100,
                        })),
                        ...(boxQty > 0
                          ? [
                              {
                                itemId: '__pizza_box__',
                                name: 'Caja para pizza',
                                qty: boxQty,
                                categoryId: '__extra__',
                                categoryName: 'Extras',
                                size: null,
                                halfItemId: null,
                                halfName: null,
                                note: null,
                                unitPrice: 5,
                                lineTotal: boxTotal,
                              },
                            ]
                          : []),
                      ],
                    })
                  }
                  if (barLines.length) {
                    await addDoc(collection(db, 'orders'), {
                      ...base,
                      area: 'bar',
                      items: barLines.map((l) => ({
                        itemId: l.item.id,
                        name: lineLabel(l.item, (l.line as any)?.halfOtherItemId ?? null),
                        qty: Number(l.line?.qty ?? 0),
                        categoryId: l.item.categoryId,
                        categoryName: String(categoryNameById.get(l.item.categoryId) ?? ''),
                        size: itemHasSizes(l.item) ? (l.line?.size ?? 'cm30') : null,
                        halfItemId: itemHasSizes(l.item) ? (l.line?.halfOtherItemId ?? null) : null,
                        halfName: itemHasSizes(l.item)
                          ? l.line?.halfOtherItemId
                            ? itemById.get(String(l.line.halfOtherItemId))?.name ?? null
                            : null
                          : null,
                        note: String(l.line?.note ?? '').trim() || null,
                        extras: (Array.isArray((l.line as any)?.extras) ? (l.line as any).extras : []).map((nm: string) => ({
                          name: String(nm),
                          unitPrice: extraUnitPrice(String(nm)),
                          qty: Number(l.line?.qty ?? 0),
                          lineTotal: Math.round(extraUnitPrice(String(nm)) * Number(l.line?.qty ?? 0) * 100) / 100,
                        })),
                        unitPrice: lineUnitPrice(l.item, (l.line as any)?.size ?? null, (l.line as any)?.halfOtherItemId ?? null),
                        lineTotal: Math.round((lineUnitPrice(l.item, (l.line as any)?.size ?? null, (l.line as any)?.halfOtherItemId ?? null) * Number(l.line?.qty ?? 0) + (Array.isArray((l.line as any)?.extras) ? (l.line as any).extras.reduce((s: number, nm: string) => s + extraUnitPrice(String(nm)) * Number(l.line?.qty ?? 0), 0) : 0)) * 100) / 100,
                      })),
                    })
                  }

                  if (tabId) {
                    const nextTotal = Math.max(0, Math.round((prevTotal + orderDeltaWithExtras) * 100) / 100)
                    await updateDoc(doc(db, 'tabs', tabId), { total: nextTotal, updatedAt: serverTimestamp() })
                  }

                  setCartLines([])
                  clearSelection()
                  setCartOpen(false)
                  setCallMessage('Orden agregada con éxito.')
                  window.setTimeout(() => setCallMessage(null), 2500)
                } catch (e: any) {
                  const msg = String(e?.message ?? '')
                  if (msg.toLowerCase().includes('index')) {
                    setSendMsg('Falta un índice en Firestore para tabs. Avísame y lo generamos, o reintenta en 1 minuto.')
                  } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
                    setSendMsg('Permisos insuficientes para enviar el pedido (rules).')
                  } else {
                    setSendMsg('No se pudo enviar el pedido. Revisa permisos o conexión.')
                  }
                } finally {
                  setSendBusy(false)
                }
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
