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
  return new Date(ms).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function itemsSummary(items) {
  const its = Array.isArray(items) ? items : []
  return its.map((it) => `${String(it?.name ?? it?.itemId ?? '').trim()} x${Number(it?.qty ?? 0)}`).join(' | ')
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}

async function main() {
  loadDotEnvIfPresent()

  const table = arg('table', '')
  const hours = Number(arg('hours', '36'))
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
  console.log('[tabs] Auth OK')
  console.log('[tabs] Since:', fmt(cutoffMs), table ? `· table=${table}` : '', '\n')

  const snap = await getDocs(query(collection(db, 'tabs'), where('openedAt', '>=', Timestamp.fromMillis(cutoffMs))))
  const tabs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => !table || String(t?.tableId ?? '') === table)
    .sort((a, b) => (toMillisMaybe(a?.openedAt) ?? 0) - (toMillisMaybe(b?.openedAt) ?? 0))

  console.log('[tabs] Matching tabs:', tabs.length)
  for (const t of tabs) {
    const opened = toMillisMaybe(t?.openedAt)
    const paid = toMillisMaybe(t?.paidAt)
    console.log(`\n== ${t.id} · ${String(t.tableId ?? '')} · opened ${opened ? fmt(opened) : '?'} · status=${String(t.status ?? '')}`)
    console.log(
      `   payment=${String(t.paymentStatus ?? '')} · total=${Number(t.total ?? 0)} · paidTotal=${Number(t.paidTotal ?? 0)}` +
        `${paid ? ` · paidAt ${fmt(paid)}` : ''}${t.isVoided ? ' · VOIDED' : ''}`,
    )
    console.log(`   items: ${itemsSummary(t.items)}`)
  }
}

main().catch((e) => {
  console.error('[tabs] Fatal:', e)
  process.exit(1)
})
