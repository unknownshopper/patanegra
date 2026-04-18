import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { initializeFirestore } from 'firebase/firestore'

const execFileAsync = promisify(execFile)

const printerDeviceCache = new Map()
const tabFolioCache = new Map()

async function resolvePrinterDevice(printerName) {
  const key = String(printerName ?? '').trim()
  if (!key) return null
  if (printerDeviceCache.has(key)) return printerDeviceCache.get(key)
  try {
    const { stdout } = await execFileAsync('lpstat', ['-v', key], { timeout: 5000, maxBuffer: 1024 * 1024 })
    const s = String(stdout ?? '')
    // Examples:
    //   "device for POS8370_COCINA: socket://192.168.1.101/"
    //   "dispositivo para POS8370_COCINA: socket://192.168.1.101/"
    const m = s.match(/(?:device\s+for|dispositivo\s+para)\s+[^:]+:\s*([^\s]+)\s*/i)
    const uri = m?.[1] ? String(m[1]).trim() : null
    console.log(`[print-bridge] Printer device URI (${key}):`, uri ?? 'null')
    printerDeviceCache.set(key, uri)
    return uri
  } catch {
    printerDeviceCache.set(key, null)
    return null
  }
}

function parseSocketUri(uri) {
  try {
    if (!uri) return null
    if (!String(uri).toLowerCase().startsWith('socket://')) return null
    // socket://host[:port]/...
    const noProto = String(uri).slice('socket://'.length)
    const hostPort = noProto.split('/')[0]
    if (!hostPort) return null
    const [host, portRaw] = hostPort.split(':')
    const port = portRaw ? Number(portRaw) : 9100
    if (!host) return null
    return { host, port: Number.isFinite(port) ? port : 9100 }
  } catch {
    return null
  }
}

async function printViaSocket({ host, port, payload }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(payload)
      socket.end()
    })
    socket.setTimeout(5000)
    socket.on('timeout', () => {
      socket.destroy(new Error('socket timeout'))
    })
    socket.on('error', (err) => reject(err))
    socket.on('close', (hadError) => {
      if (!hadError) resolve()
    })
  })
}

function loadDotEnvIfPresent() {
  try {
    const candidates = []
    try {
      candidates.push(path.join(process.cwd(), '.env'))
    } catch {
      // ignore
    }
    try {
      const here = path.dirname(fileURLToPath(import.meta.url))
      candidates.push(path.join(here, '.env'))
    } catch {
      // ignore
    }

    const envPath = candidates.find((p) => p && fs.existsSync(p))
    if (!envPath) return

    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const eq = s.indexOf('=')
      if (eq <= 0) continue
      const key = s.slice(0, eq).trim()
      let value = s.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] == null) process.env[key] = value
    }
  } catch {
    // ignore
  }
}

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function toMillisMaybe(ts) {
  try {
    if (!ts) return null
    if (typeof ts.toMillis === 'function') return ts.toMillis()
    if (typeof ts === 'number') return ts
    return null
  } catch {
    return null
  }
}

function money(n) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n ?? 0))
  } catch {
    return `$${Number(n ?? 0).toFixed(2)}`
  }
}

function tableLabel(id) {
  const s = String(id)
  if (s.startsWith('mesa-')) {
    const raw = s.replace('mesa-', '').trim()
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return `Mesa ${n}`
  }
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) return `Mesa ${n}`
  if (String(id).startsWith('togo-')) {
    const raw = String(id).replace('togo-', '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? `Para llevar #${n}` : 'Para llevar'
  }
  return String(id)
}

function formatFolioDate(ms) {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${yy}/${mm}/${dd}`
}

function formatFolioKey(ms) {
  const d = new Date(ms)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

async function nextDailyFolio({ db }) {
  const nowMs = Date.now()
  const key = formatFolioKey(nowMs)
  const labelDate = formatFolioDate(nowMs)
  const ref = doc(db, 'ops', 'current')
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists() ? snap.data() : {}
    const prevKey = String(data?.billSeqKey ?? '')
    const prevSeq = Number(data?.billSeq ?? 0)
    const next = prevKey === key ? prevSeq + 1 : 1
    tx.set(ref, { billSeqKey: key, billSeq: next }, { merge: true })
    return next
  })
  const seqStr = String(seq).padStart(3, '0')
  return `${labelDate}-${seqStr}`
}

async function ensureTabFolio({ db, tabId }) {
  const id = String(tabId ?? '').trim()
  if (!id) return ''

  const cached = tabFolioCache.get(id)
  if (typeof cached === 'string' && cached) return cached

  const tabRef = doc(db, 'tabs', id)
  const opsRef = doc(db, 'ops', 'current')

  const folio = await runTransaction(db, async (tx) => {
    const tabSnap = await tx.get(tabRef)
    const existing = String((tabSnap.data() ?? {})?.billFolio ?? '').trim()
    if (existing) return existing

    const nowMs = Date.now()
    const key = formatFolioKey(nowMs)
    const labelDate = formatFolioDate(nowMs)

    const opsSnap = await tx.get(opsRef)
    const ops = opsSnap.exists() ? opsSnap.data() : {}
    const prevKey = String(ops?.billSeqKey ?? '')
    const prevSeq = Number(ops?.billSeq ?? 0)
    const next = prevKey === key ? prevSeq + 1 : 1
    tx.set(opsRef, { billSeqKey: key, billSeq: next }, { merge: true })

    const nextStr = String(next).padStart(3, '0')
    const generated = `${labelDate}-${nextStr}`
    tx.set(tabRef, { billFolio: generated }, { merge: true })
    return generated
  })

  tabFolioCache.set(id, folio)
  return folio
}

function consumptionTicketText({ tab, orders, folio }) {
  const tableId = String(tab?.tableId ?? '')
  const mesa = tableLabel(tableId)
  const name = String(tab?.tabName ?? '').trim()

  const lines = []
  lines.push('EL PATA NEGRA VILLA')
  lines.push('TEL: 9935140855')
  lines.push('Atletismo 114 Velódromo Deportiva')
  lines.push('Vhsa Tabasco CP 86189')
  lines.push('CUENTA / CONSUMO')
  if (folio) lines.push(`FOLIO: ${folio}`)
  lines.push('--------------------------------')
  lines.push(mesa)
  if (name) lines.push(name)
  lines.push('--------------------------------')

  const qtyByLabel = new Map()
  const amtByLabel = new Map()
  for (const o of orders) {
    if (!o || String(o.tableId ?? '') !== tableId) continue
    if (String(o.tabId ?? '') !== String(tab?.id ?? '')) continue
    const its = Array.isArray(o.items) ? o.items : []
    for (const it of its) {
      const nm = String(it?.name ?? '').trim()
      const qty = Number(it?.qty ?? 0)
      if (!nm || !Number.isFinite(qty) || qty <= 0) continue
      const size = it?.size === 'cm20' ? '20' : it?.size === 'cm30' ? '30' : null
      const label = size ? `${nm} (${size})` : nm
      const unit = Number(it?.unitPrice ?? 0)
      qtyByLabel.set(label, (qtyByLabel.get(label) ?? 0) + qty)
      if (Number.isFinite(unit) && unit > 0) {
        amtByLabel.set(label, Math.round(((amtByLabel.get(label) ?? 0) + unit * qty) * 100) / 100)
      }
    }
  }
  const rows = Array.from(qtyByLabel.entries())
    .map(([label, qty]) => ({ label, qty: Number(qty), amount: Number(amtByLabel.get(label) ?? 0) }))
    .sort((a, b) => b.amount - a.amount || b.qty - a.qty || a.label.localeCompare(b.label))

  for (const r of rows) {
    lines.push(`${padRight(`x${r.qty}`, 4)} ${r.label}`.slice(0, 32))
    if (Number.isFinite(r.amount) && r.amount > 0) {
      lines.push(`     ${money(r.amount)}`.slice(0, 32))
    }
  }

  const subtotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  lines.push('--------------------------------')
  lines.push(`TOTAL: ${money(Math.round(subtotal * 100) / 100)}`)
  lines.push('')
  lines.push('')
  return lines.join('\n')
}

function formatClock(ms) {
  try {
    return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDateTime(ms) {
  try {
    return new Date(ms).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function padRight(s, n) {
  const str = String(s)
  if (str.length >= n) return str
  return str + ' '.repeat(n - str.length)
}

function cuentaShort(id) {
  const s = String(id ?? '').trim()
  if (!s) return ''
  return s.slice(0, 8)
}

async function tabFolioMaybe({ db, tabId }) {
  const id = String(tabId ?? '').trim()
  if (!id) return ''
  const cached = tabFolioCache.get(id)
  if (typeof cached === 'string') return cached
  try {
    const snap = await getDoc(doc(db, 'tabs', id))
    const folio = String((snap.data() ?? {})?.billFolio ?? '').trim()
    tabFolioCache.set(id, folio)
    return folio
  } catch {
    return ''
  }
}

async function ticketText(order, { db }) {
  const area = String(order?.area ?? '').toLowerCase() === 'bar' ? 'BARRA' : 'COCINA'
  const createdAtMs = order?.createdAt?.toMillis ? order.createdAt.toMillis() : Date.now()
  const time = formatClock(createdAtMs)
  const mesa = tableLabel(String(order?.tableId ?? ''))
  const tableId = String(order?.tableId ?? '')
  const tabId = String(order?.tabId ?? '')
  const cuenta = cuentaShort(tabId)
  const folio = tabId ? await ensureTabFolio({ db, tabId }) : await tabFolioMaybe({ db, tabId })
  const by = String(order?.createdByName ?? '').trim()

  const lines = []
  lines.push('PATANEGRA')
  lines.push(area)
  lines.push('--------------------------------')
  lines.push(`${mesa}${time ? ` · ${time}` : ''}`)
  if (String(tableId).startsWith('togo-')) {
    const label = String(order?.tableLabel ?? '').trim()
    if (label && label !== tableId) lines.push(label)
  }
  if (by) lines.push(`Mesero: ${by}`)
  if (folio) lines.push(`Folio: ${folio}`)
  else if (cuenta) lines.push(`Cuenta: ${cuenta}`)
  lines.push('--------------------------------')

  const items = Array.isArray(order?.items) ? order.items : []
  for (const it of items) {
    const name = String(it?.name ?? '').trim() || String(it?.itemId ?? '').trim() || 'Item'
    const qty = Number(it?.qty ?? 0)
    const qtyStr = qty ? `x${qty}` : ''
    lines.push(`${padRight(qtyStr, 4)} ${name}`.slice(0, 32))
    const size = it?.size ? String(it.size) : ''
    const half = it?.halfName ? String(it.halfName) : ''
    if (size) lines.push(`     ${size}`.slice(0, 32))
    if (half) lines.push(`     1/2 + ${half}`.slice(0, 32))
  }

  lines.push('')
  lines.push('')
  return lines.join('\n')
}

function withEscPos(text) {
  const useEscPos = env('ESCPOS', '1') === '1'
  const stripDiacritics = env('PRINT_STRIP_DIACRITICS', '0') === '1'
  const encoding = env('PRINT_ENCODING', useEscPos ? 'latin1' : 'utf8')
  const raw = String(text ?? '')
  const normalized = stripDiacritics
    ? raw
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/“|”/g, '"')
        .replace(/‘|’/g, "'")
    : raw
  if (!useEscPos) return Buffer.from(normalized, encoding)
  const cut = env('ESCPOS_CUT', '1') === '1'
  const charSizeRaw = env('ESCPOS_CHAR_SIZE', '1')
  const charSizeN = Number(charSizeRaw)
  const charSize = Number.isFinite(charSizeN) ? Math.min(8, Math.max(1, Math.trunc(charSizeN))) : 1
  const init = Buffer.from([0x1b, 0x40])

  const escposCodepageRaw = String(env('ESCPOS_CODEPAGE', '') ?? '').trim()
  const escposCodepage = escposCodepageRaw ? Number(escposCodepageRaw) : null
  const codepageCmd = Number.isFinite(escposCodepage)
    ? Buffer.from([0x1b, 0x74, Number(escposCodepage) & 0xff])
    : Buffer.alloc(0)

  const sizeCmd = charSize === 1 ? Buffer.alloc(0) : Buffer.from([0x1d, 0x21, ((charSize - 1) << 4) | (charSize - 1)])

  const body = Buffer.from(normalized, encoding)
  const feeds = Buffer.from('\n\n\n', encoding)
  // Use a cut command variant without NUL bytes to avoid issues with some pipelines.
  // GS V 1  (partial cut) is commonly supported.
  const cutCmd = cut ? Buffer.from([0x1d, 0x56, 0x01]) : Buffer.alloc(0)
  return Buffer.concat([init, codepageCmd, sizeCmd, Buffer.from('\n', encoding), body, feeds, cutCmd])
}

function receiptText(tab) {
  const tableId = String(tab?.tableId ?? '')
  const mesa = tableLabel(tableId)
  const name = String(tab?.tabName ?? '').trim()
  const subtotal = Number(tab?.total ?? 0)
  const method = String(tab?.paymentMethod ?? '').trim() || '—'
  const tip = Number(tab?.tipAmount ?? 0)
  const total = Number(tab?.paidTotal ?? subtotal)
  const paidAtMs = tab?.paidAt?.toMillis ? tab.paidAt.toMillis() : tab?.closedAt?.toMillis ? tab.closedAt.toMillis() : Date.now()
  const paidAtStr = formatDateTime(paidAtMs)

  const lines = []
  lines.push('EL PATA NEGRA VILLA')
  lines.push('TEL: 9935140855')
  lines.push('Atletismo 114 Velódromo Deportiva')
  lines.push('Vhsa Tabasco CP 86189')
  lines.push('TICKET DE PAGO')
  lines.push('--------------------------------')
  lines.push(mesa)
  if (name) lines.push(name)
  if (paidAtStr) lines.push(paidAtStr)
  lines.push('--------------------------------')
  lines.push(`Consumo: ${money(subtotal)}`)
  lines.push(`Propina: ${money(tip)}`)
  lines.push(`Total:   ${money(total)}`)
  lines.push(`Pago:    ${method}`)
  lines.push('')
  lines.push('Gracias por su compra')
  lines.push('')
  lines.push('')
  return lines.join('\n')
}

async function printViaLp({ printer, text, dryRun }) {
  if (dryRun) {
    console.log(`\n--- DRY RUN (${printer}) ---\n${text}\n--- END ---\n`)
    return
  }

  const useRaw = env('LP_RAW', '1') === '1'
  const payload = withEscPos(text)

  const preferSocket = env('PRINT_VIA_SOCKET', '1') === '1'
  if (preferSocket) {
    const deviceUri = await resolvePrinterDevice(printer)
    const sock = parseSocketUri(deviceUri)
    if (sock) {
      console.log(`[print-bridge] socket -> ${printer} ${sock.host}:${sock.port} bytes=${payload.length}`)
      await printViaSocket({ host: sock.host, port: sock.port, payload })
      return
    }
  }

  const args = ['-d', printer]
  if (useRaw) args.push('-o', 'raw')
  console.log(`[print-bridge] lp -> ${printer} bytes=${payload.length}`)
  const { stdout, stderr } = await execFileAsync('lp', args, {
    input: payload,
    maxBuffer: 1024 * 1024,
    timeout: 60000,
  })
  const out = String(stdout ?? '').trim()
  const err = String(stderr ?? '').trim()
  if (out) console.log(`[print-bridge] lp stdout (${printer}):`, out)
  if (err) console.log(`[print-bridge] lp stderr (${printer}):`, err)
}

async function main() {
  loadDotEnvIfPresent()

  const firebaseConfig = {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
  }

  const email = env('PRINT_BRIDGE_EMAIL')
  const password = env('PRINT_BRIDGE_PASSWORD')

  const printerDefault = env('PRINTER_DEFAULT')
  const printerKitchen = env('PRINTER_KITCHEN')
  const printerBar = env('PRINTER_BAR')
  const printerReceipt = env('PRINTER_RECEIPT')
  const dryRun = env('DRY_RUN', '0') === '1'
  const processBacklog = env('PROCESS_BACKLOG', '0') === '1'
  const printReceiptOnPaid = env('PRINT_RECEIPT_ON_PAID', '0') === '1'
  const lpRaw = env('LP_RAW', '1') === '1'
  const escpos = env('ESCPOS', '1') === '1'
  const escposCut = env('ESCPOS_CUT', '1') === '1'
  const deviceName = env('PRINT_BRIDGE_DEVICE', 'macbook-caja')

  if (!firebaseConfig.projectId) throw new Error('Falta VITE_FIREBASE_PROJECT_ID en env / .env')
  if (!firebaseConfig.apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY en env / .env')
  if (!email || !password) throw new Error('Falta PRINT_BRIDGE_EMAIL o PRINT_BRIDGE_PASSWORD (usuario de Firebase)')

  const outPrinters = {
    kitchen: printerKitchen || printerDefault,
    bar: printerBar || printerDefault,
    receipt: printerReceipt || printerDefault,
  }
  if (!outPrinters.kitchen || !outPrinters.bar || !outPrinters.receipt) {
    throw new Error('Falta PRINTER_DEFAULT o PRINTER_KITCHEN/PRINTER_BAR/PRINTER_RECEIPT (nombre de impresora tal como aparece en macOS)')
  }

  console.log('[print-bridge] Iniciando…')
  console.log('[print-bridge] Project:', firebaseConfig.projectId)
  console.log('[print-bridge] Printers:', outPrinters)
  console.log('[print-bridge] Dry run:', dryRun)
  console.log('[print-bridge] Process backlog:', processBacklog)
  console.log('[print-bridge] LP raw:', lpRaw)
  console.log('[print-bridge] ESCPOS:', escpos)
  console.log('[print-bridge] ESCPOS cut:', escposCut)
  console.log('[print-bridge] Device:', deviceName)

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

  await signInWithEmailAndPassword(auth, email, password)
  console.log('[print-bridge] Auth OK:', auth.currentUser?.uid)

  const inFlightOrders = new Set()
  const inFlightReceipts = new Set()
  const inFlightBills = new Set()
  const recentlyPrintedOrders = new Map()
  const recentlyPrintedBills = new Map()
  const recentlyFailedOrders = new Map()
  let unsubOrders = null
  let unsubReceipts = null
  let unsubBills = null

  let ordersBootstrapped = false
  let receiptsBootstrapped = false

  const qOrders = query(collection(db, 'orders'), where('status', '==', 'pending'))

  console.log('[print-bridge] Subscribing orders (status==pending)…')

  unsubOrders = onSnapshot(
    qOrders,
    async (snap) => {
      console.log(
        `[print-bridge] Orders snapshot: size=${snap.size} pendingChanges=${snap.docChanges().length} fromCache=${snap.metadata.fromCache}`,
      )

      if (!ordersBootstrapped) {
        ordersBootstrapped = true
        console.log('[print-bridge] Orders bootstrapped')
        if (!processBacklog) return
      }

      const changes = snap.docChanges()
      if (changes.length) {
        console.log(
          '[print-bridge] Order changes:',
          changes.map((c) => `${c.type}:${c.doc.id}`).join(', '),
        )
      }

      const byId = new Map()
      for (const c of changes) {
        if (c.type !== 'added' && c.type !== 'modified') continue
        byId.set(String(c.doc.id), { id: c.doc.id, ...(c.doc.data() ?? {}) })
      }
      const docs = Array.from(byId.values()).sort(
        (a, b) => (toMillisMaybe(a?.createdAt) ?? 0) - (toMillisMaybe(b?.createdAt) ?? 0),
      )

      for (const o of docs) {
        const id = String(o?.id ?? '')
        if (!id) continue
        if (o?.printedAt?.toMillis || o?.printedAt != null) continue
        const lastPrinted = recentlyPrintedOrders.get(id)
        if (typeof lastPrinted === 'number' && Date.now() - lastPrinted < 20 * 1000) continue
        const lastLocalErr = recentlyFailedOrders.get(id)
        if (typeof lastLocalErr === 'number' && Date.now() - lastLocalErr < 60 * 1000) continue
        if (inFlightOrders.has(id)) continue

        inFlightOrders.add(id)
        try {
          const area = String(o?.area ?? '').toLowerCase() === 'bar' ? 'bar' : 'kitchen'
          const printer = area === 'bar' ? outPrinters.bar : outPrinters.kitchen
          const text = await ticketText(o, { db })

          await printViaLp({ printer, text, dryRun })

          if (!dryRun) {
            await updateDoc(doc(db, 'orders', id), {
              printedAt: serverTimestamp(),
              printedBy: auth.currentUser?.uid ?? null,
              printedDevice: deviceName,
              printedPrinter: printer,
            })
          }

          recentlyPrintedOrders.set(id, Date.now())

          console.log(`[print-bridge] Order printed ${id} -> ${printer}`)
        } catch (e) {
          console.error('[print-bridge] Error printing order', o?.id, e)
          recentlyFailedOrders.set(id, Date.now())
          if (!dryRun) {
            try {
              await updateDoc(doc(db, 'orders', String(o?.id ?? '')), {
                printErrorAt: serverTimestamp(),
                printErrorMsg: String((e && e.message) || e || 'print error'),
                printErrorDevice: deviceName,
              })
            } catch {
              // ignore
            }
          }
        } finally {
          inFlightOrders.delete(id)
        }
      }
    },
    (err) => {
      console.error('[print-bridge] Snapshot error', err)
    },
  )

  if (printReceiptOnPaid) {
    const qTabs = query(collection(db, 'tabs'), where('paymentStatus', '==', 'paid'))

    console.log('[print-bridge] Subscribing receipts (tabs paymentStatus==paid)…')

    unsubReceipts = onSnapshot(
      qTabs,
      async (snap) => {
        console.log(
          `[print-bridge] Receipts snapshot: size=${snap.size} changes=${snap.docChanges().length} fromCache=${snap.metadata.fromCache}`,
        )

        if (!receiptsBootstrapped) {
          receiptsBootstrapped = true
          console.log('[print-bridge] Receipts bootstrapped')
          if (!processBacklog) return
        }

        const changes = snap.docChanges()
        if (changes.length) {
          console.log(
            '[print-bridge] Receipt changes:',
            changes.map((c) => `${c.type}:${c.doc.id}`).join(', '),
          )
        }

        const byId = new Map()
        for (const c of changes) {
          if (c.type !== 'added' && c.type !== 'modified') continue
          byId.set(String(c.doc.id), { id: c.doc.id, ...(c.doc.data() ?? {}) })
        }
        const docs = Array.from(byId.values())

        for (const t of docs) {
          const id = String(t?.id ?? '')
          if (!id) continue
          if (t?.receiptPrintedAt?.toMillis || t?.receiptPrintedAt != null) continue
          if (!t?.paidAt?.toMillis && t?.paidAt == null) continue
          if (inFlightReceipts.has(id)) continue

          inFlightReceipts.add(id)
          try {
            const printer = outPrinters.receipt
            const text = receiptText(t)

            await printViaLp({ printer, text, dryRun })

            if (!dryRun) {
              await updateDoc(doc(db, 'tabs', id), {
                receiptPrintedAt: serverTimestamp(),
                receiptPrintedBy: auth.currentUser?.uid ?? null,
                receiptPrintedDevice: deviceName,
                receiptPrintedPrinter: printer,
              })
            }

            console.log(`[print-bridge] Receipt printed ${id} -> ${printer}`)
          } catch (e) {
            console.error('[print-bridge] Error printing receipt', t?.id, e)
            if (!dryRun) {
              try {
                await updateDoc(doc(db, 'tabs', String(t?.id ?? '')), {
                  receiptPrintErrorAt: serverTimestamp(),
                  receiptPrintErrorMsg: String((e && e.message) || e || 'receipt print error'),
                  receiptPrintErrorDevice: deviceName,
                })
              } catch {
                // ignore
              }
            }
          } finally {
            inFlightReceipts.delete(id)
          }
        }
      },
      (err) => {
        console.error('[print-bridge] Snapshot error (receipts)', err)
      },
    )
  } else {
    console.log('[print-bridge] Receipt printing disabled (PRINT_RECEIPT_ON_PAID=0)')
  }

  const qOpenTabs = query(collection(db, 'tabs'), where('status', '==', 'open'))
  console.log('[print-bridge] Subscribing bills (tabs status==open)…')
  unsubBills = onSnapshot(
    qOpenTabs,
    async (snap) => {
      const changes = snap.docChanges()
      if (changes.length) {
        console.log(
          '[print-bridge] Bill changes:',
          changes.map((c) => `${c.type}:${c.doc.id}`).join(', '),
        )
      }

      const byId = new Map()
      for (const c of changes) {
        if (c.type !== 'added' && c.type !== 'modified') continue
        byId.set(String(c.doc.id), { id: c.doc.id, ...(c.doc.data() ?? {}) })
      }
      const docs = Array.from(byId.values())

      for (const t of docs) {
        const id = String(t?.id ?? '')
        if (!id) continue
        if (!t?.billRequestedAt?.toMillis && t?.billRequestedAt == null) continue
        const reqMs = toMillisMaybe(t?.billRequestedAt)
        const printedMs = toMillisMaybe(t?.billPrintedAt)
        if (reqMs != null && printedMs != null && reqMs <= printedMs) continue
        const lastPrinted = recentlyPrintedBills.get(id)
        if (typeof lastPrinted === 'number' && Date.now() - lastPrinted < 20 * 1000) continue
        if (inFlightBills.has(id)) continue

        inFlightBills.add(id)
        try {
          const printer = outPrinters.receipt
          const folio = await ensureTabFolio({ db, tabId: id })
          const ordersSnap = await getDocs(query(collection(db, 'orders'), where('tabId', '==', id)))
          const tab = t
          const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }))
          const text = consumptionTicketText({ tab, orders, folio })
          await printViaLp({ printer, text, dryRun })
          if (!dryRun) {
            await updateDoc(doc(db, 'tabs', id), {
              billPrintedAt: serverTimestamp(),
              billPrintedBy: auth.currentUser?.uid ?? null,
              billPrintedDevice: deviceName,
              billPrintedPrinter: printer,
              billFolio: folio,
            })
            tabFolioCache.set(id, folio)
          }
          recentlyPrintedBills.set(id, Date.now())
          console.log(`[print-bridge] Bill printed ${id} -> ${printer} folio=${folio}`)
        } catch (e) {
          console.error('[print-bridge] Error printing bill', t?.id, e)
          if (!dryRun) {
            try {
              await updateDoc(doc(db, 'tabs', String(t?.id ?? '')), {
                billPrintErrorAt: serverTimestamp(),
                billPrintErrorMsg: String((e && e.message) || e || 'bill print error'),
                billPrintErrorDevice: deviceName,
              })
            } catch {
              // ignore
            }
          }
          inFlightBills.delete(id)
        }
      }

      // Note: docs are de-duplicated by id above to avoid double-printing when a single snapshot
      // contains multiple changes for the same tab.
    },
    (err) => {
      console.error('[print-bridge] Bills snapshot error', err)
    },
  )

  const shutdown = () => {
    console.log('\n[print-bridge] Cerrando…')
    try {
      if (unsubOrders) unsubOrders()
      if (unsubReceipts) unsubReceipts()
      if (unsubBills) unsubBills()
    } catch {
      // ignore
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('[print-bridge] Fatal:', e)
  process.exit(1)
})
