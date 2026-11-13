import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, getDocs, initializeFirestore, query, Timestamp, where } from 'firebase/firestore'

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

function env(k, fallback = '') {
  const v = process.env[k]
  return v == null || String(v).trim() === '' ? fallback : String(v)
}

function toMillisMaybe(v) {
  try {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    return null
  } catch {
    return null
  }
}

function fmt(ms) {
  return new Date(ms).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function itemsSignature(items) {
  const its = Array.isArray(items) ? items : []
  return its
    .map((it) => `${String(it?.name ?? it?.itemId ?? '').trim()}x${Number(it?.qty ?? 0)}`)
    .sort()
    .join('|')
}

async function main() {
  loadDotEnvIfPresent()

  const hoursArg = process.argv.find((a) => a.startsWith('--hours='))
  const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 36
  const cutoffMs = Date.now() - (Number.isFinite(hours) && hours > 0 ? hours : 36) * 60 * 60 * 1000

  const firebaseConfig = {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
  }

  const email = env('CLEANUP_EMAIL') || env('PRINT_BRIDGE_EMAIL')
  const password = env('CLEANUP_PASSWORD') || env('PRINT_BRIDGE_PASSWORD')
  if (!email || !password) throw new Error('Missing CLEANUP_EMAIL/CLEANUP_PASSWORD (or PRINT_BRIDGE_EMAIL/PRINT_BRIDGE_PASSWORD)')

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

  await signInWithEmailAndPassword(auth, email, password)
  console.log('[dup] Auth OK:', auth.currentUser?.uid)
  console.log('[dup] Scanning last', hours, 'hours (since', fmt(cutoffMs), ')\n')

  const sinceTs = Timestamp.fromMillis(cutoffMs)

  // ---- Duplicate orders: same tab/table + same items, within 120s ----
  const ordersSnap = await getDocs(query(collection(db, 'orders'), where('createdAt', '>=', sinceTs)))
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  console.log('[dup] Orders scanned:', orders.length)

  const groups = new Map()
  for (const o of orders) {
    const key = [String(o?.tabId ?? ''), String(o?.tableId ?? ''), String(o?.area ?? ''), itemsSignature(o?.items)].join('::')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(o)
  }

  let orderDupGroups = 0
  for (const [, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => (toMillisMaybe(a?.createdAt) ?? 0) - (toMillisMaybe(b?.createdAt) ?? 0))
    for (let i = 1; i < list.length; i++) {
      const prev = toMillisMaybe(list[i - 1]?.createdAt) ?? 0
      const cur = toMillisMaybe(list[i]?.createdAt) ?? 0
      if (cur - prev <= 120_000) {
        orderDupGroups++
        const o = list[i]
        console.log(
          `[dup] ORDER DUP? ${o.id} · ${String(o.tableId ?? '')} · ${String(o.area ?? '')} · ` +
            `${fmt(cur)} · Δ${Math.round((cur - prev) / 1000)}s · items: ${itemsSignature(o.items)}`,
        )
        break
      }
    }
  }
  console.log(`[dup] Suspicious order groups: ${orderDupGroups}\n`)

  // ---- Duplicate tabs: same tableId opened within 5 min ----
  const tabsSnap = await getDocs(query(collection(db, 'tabs'), where('openedAt', '>=', sinceTs)))
  const tabs = tabsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  console.log('[dup] Tabs scanned:', tabs.length)

  const byTable = new Map()
  for (const t of tabs) {
    const k = String(t?.tableId ?? '')
    if (!byTable.has(k)) byTable.set(k, [])
    byTable.get(k).push(t)
  }

  let tabDupGroups = 0
  for (const [tableId, list] of byTable) {
    if (list.length < 2) continue
    list.sort((a, b) => (toMillisMaybe(a?.openedAt) ?? 0) - (toMillisMaybe(b?.openedAt) ?? 0))
    for (let i = 1; i < list.length; i++) {
      const prev = toMillisMaybe(list[i - 1]?.openedAt) ?? 0
      const cur = toMillisMaybe(list[i]?.openedAt) ?? 0
      if (cur - prev <= 5 * 60_000) {
        tabDupGroups++
        const t = list[i]
        console.log(
          `[dup] TAB DUP? ${t.id} · ${tableId} · opened ${fmt(cur)} · Δ${Math.round((cur - prev) / 1000)}s · ` +
            `status=${String(t.status ?? '')} · total=${Number(t.total ?? 0)}`,
        )
        break
      }
    }
  }
  console.log(`[dup] Suspicious tab groups: ${tabDupGroups}`)
}

main().catch((e) => {
  console.error('[dup] Fatal:', e)
  process.exit(1)
})
