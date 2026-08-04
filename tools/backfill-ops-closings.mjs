import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'

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
      candidates.push(path.join(here, '..', '.env'))
    } catch {
      // ignore
    }

    const envPath = candidates.find((p) => p && fs.existsSync(p))
    if (!envPath) return

    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const idx = s.indexOf('=')
      if (idx < 0) continue
      const k = s.slice(0, idx).trim()
      const v = s.slice(idx + 1).trim()
      if (!k) continue
      if (process.env[k] == null) process.env[k] = v
    }
  } catch {
    // ignore
  }
}

function env(k) {
  return String(process.env[k] ?? '').trim()
}

const OP_DAY_START_HOUR = 11
const OP_DAY_END_HOUR = 4

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymdKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function operationalDayKeyForMs(ms) {
  const d = new Date(ms)
  const h = d.getHours()
  if (h >= OP_DAY_START_HOUR) return ymdKeyFromDate(d)
  if (h < OP_DAY_END_HOUR) {
    const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 0, 0, 0, 0)
    return ymdKeyFromDate(prev)
  }
  return null
}

function rangeForDayKey(dayKey) {
  const start = new Date(`${dayKey}T00:00:00`)
  start.setHours(OP_DAY_START_HOUR, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(OP_DAY_END_HOUR, 0, 0, 0)
  return { startMs: start.getTime(), endMs: end.getTime() }
}

function isWednesdayDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00`)
  return d.getDay() === 3
}

function num(x) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function truncInt(x) {
  const n = Number(x)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.trunc(n)
}

function parseArgs(argv) {
  const out = { apply: false, days: 15 }
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true
    if (a.startsWith('--days=')) out.days = Math.max(1, Number(a.split('=')[1] || 15))
  }
  return out
}

async function main() {
  loadDotEnvIfPresent()

  const { apply, days } = parseArgs(process.argv)

  const firebaseConfig = {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
  }

  if (!firebaseConfig.projectId) throw new Error('Missing VITE_FIREBASE_PROJECT_ID')
  if (!firebaseConfig.apiKey) throw new Error('Missing VITE_FIREBASE_API_KEY')

  const email = env('BACKFILL_EMAIL')
  const password = env('BACKFILL_PASSWORD')
  if (!email || !password) {
    console.error('Missing BACKFILL_EMAIL / BACKFILL_PASSWORD env vars')
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  try {
    const auth = getAuth(app)
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

    const cred = await signInWithEmailAndPassword(auth, email, password)
    const uid = cred?.user?.uid
    console.log('[backfill] Auth OK:', uid)

    const keys = []
    let cursor = Date.now()
    while (keys.length < days) {
      const k = operationalDayKeyForMs(cursor)
      if (k && !keys.includes(k) && !isWednesdayDayKey(k)) keys.push(k)
      cursor -= 24 * 60 * 60 * 1000
    }

    console.log('[backfill] Target dayKeys:', keys.join(', '))

    for (const dayKey of keys) {
      const ref = doc(db, 'opsClosings', dayKey)
      const exists = (await getDoc(ref)).exists()
      if (exists) {
        console.log('[backfill]', dayKey, 'skip (exists)')
        continue
      }

      const { startMs, endMs } = rangeForDayKey(dayKey)

      const tabsQ = query(
        collection(db, 'tabs'),
        where('paidAt', '>=', new Date(startMs)),
        where('paidAt', '<', new Date(endMs)),
        orderBy('paidAt', 'desc'),
      )

      const tabsSnap = await getDocs(tabsQ)
      const tabs = tabsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))

      const tabIds = new Set(tabs.map((t) => String(t.id)))

      const ordersQ = query(
        collection(db, 'orders'),
        where('createdAt', '>=', new Date(startMs)),
        where('createdAt', '<', new Date(endMs)),
        orderBy('createdAt', 'desc'),
      )
      const ordersSnap = await getDocs(ordersQ)
      const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))

      let sum = 0
      const byMethod = {
        efectivo: 0,
        propinaEfectivo: 0,
        terminal: 0,
        propinaTerminal: 0,
        transferencia: 0,
        propinaTransferencia: 0,
        cortesia: 0,
        legacy: 0,
      }

      let discountTotal = 0
      const dough = { cm30: 0, cm20: 0 }

      for (const t of tabs) {
        const total = num(t.paidTotal ?? t.total ?? 0)
        const tip = num(t.tipAmount ?? 0)
        const m = String(t.paymentMethod ?? '').trim()
        const paidBy = t.paidByMethod && typeof t.paidByMethod === 'object' ? t.paidByMethod : null
        const tipBy = t.tipByMethod && typeof t.tipByMethod === 'object' ? t.tipByMethod : null

        if (m === 'mixed' && paidBy) {
          const e = num(paidBy.efectivo ?? 0)
          const te = num(tipBy?.efectivo ?? 0)
          const tt = num(paidBy.terminal ?? 0)
          const ttt = num(tipBy?.terminal ?? 0)
          const tr = num(paidBy.transferencia ?? 0)
          const ttr = num(tipBy?.transferencia ?? 0)
          const c = num(paidBy.cortesia ?? 0)
          byMethod.efectivo += e
          byMethod.propinaEfectivo += te
          byMethod.terminal += tt
          byMethod.propinaTerminal += ttt
          byMethod.transferencia += tr
          byMethod.propinaTransferencia += ttr
          byMethod.cortesia += c
        } else if (m === 'terminal') {
          byMethod.terminal += total
          byMethod.propinaTerminal += tip
        } else if (m === 'transferencia') {
          byMethod.transferencia += total
          byMethod.propinaTransferencia += tip
        } else if (m === 'efectivo') {
          byMethod.efectivo += total
          byMethod.propinaEfectivo += tip
        } else if (m) {
          byMethod[m] = num(byMethod[m]) + total
        } else {
          byMethod.legacy += total
        }

        sum += total
        discountTotal += num(t.courtesyAmount ?? 0)
      }

      for (const o of orders) {
        const tabId = String(o.tabId ?? '')
        if (!tabIds.has(tabId)) continue
        const its = Array.isArray(o.items) ? o.items : []
        for (const it of its) {
          const q = truncInt(it?.qty ?? 0)
          if (!q) continue
          const s = String(it?.size ?? '').trim()
          const n = String(it?.name ?? '').trim()
          if (s === 'cm20' || /\(\s*20\s*\)/.test(n)) dough.cm20 += q
          if (s === 'cm30' || /\(\s*30\s*\)/.test(n)) dough.cm30 += q
        }
      }

      const summary = {
        salesCount: tabs.length,
        sum: Math.round(sum * 100) / 100,
        discountTotal: Math.round(discountTotal * 100) / 100,
        byMethod: {
          efectivo: Math.round(byMethod.efectivo * 100) / 100,
          propinaEfectivo: Math.round(byMethod.propinaEfectivo * 100) / 100,
          terminal: Math.round(byMethod.terminal * 100) / 100,
          propinaTerminal: Math.round(byMethod.propinaTerminal * 100) / 100,
          transferencia: Math.round(byMethod.transferencia * 100) / 100,
          propinaTransferencia: Math.round(byMethod.propinaTransferencia * 100) / 100,
          cortesia: Math.round(byMethod.cortesia * 100) / 100,
          legacy: Math.round(byMethod.legacy * 100) / 100,
        },
        dough,
      }

      console.log('[backfill]', dayKey, 'tabs:', tabs.length, 'sum:', summary.sum)

      if (!apply) continue

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (snap.exists()) return
        tx.set(ref, {
          dayKey,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          createdByUid: uid ?? null,
          createdByName: email,
          summary,
        })
      })
    }

    console.log(apply ? '[backfill] Done.' : '[backfill] Dry run. Re-run with --apply to write.')
  } finally {
    await deleteApp(app)
  }
}

main().catch((e) => {
  console.error('[backfill] Fatal:', e)
  process.exit(1)
})
