import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  getDocs,
  initializeFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
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

function parseArgs(argv) {
  const args = {
    apply: false,
    olderThanHours: 24,
    limit: 0,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    if (a === '--older-than-hours') {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n >= 0) args.olderThanHours = n
      i++
    }
    if (a === '--limit') {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n >= 0) args.limit = Math.trunc(n)
      i++
    }
  }
  return args
}

async function main() {
  loadDotEnvIfPresent()

  const { apply, olderThanHours, limit } = parseArgs(process.argv)

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

  const email = env('CLEANUP_EMAIL') || env('PRINT_BRIDGE_EMAIL')
  const password = env('CLEANUP_PASSWORD') || env('PRINT_BRIDGE_PASSWORD')
  if (!email || !password) throw new Error('Missing CLEANUP_EMAIL/CLEANUP_PASSWORD (or PRINT_BRIDGE_EMAIL/PRINT_BRIDGE_PASSWORD)')

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

  await signInWithEmailAndPassword(auth, email, password)
  const uid = auth.currentUser?.uid
  console.log('[cleanup] Auth OK:', uid)

  const cutoffMs = Date.now() - Math.max(0, olderThanHours) * 60 * 60 * 1000

  const q = query(collection(db, 'orders'), where('status', '==', 'pending'))
  const snap = await getDocs(q)
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => {
      if (o?.printedAt?.toMillis || o?.printedAt != null) return false
      const createdMs = toMillisMaybe(o?.createdAt) ?? Number(o?.createdAtMs ?? 0) ?? 0
      if (!createdMs) return false
      return createdMs < cutoffMs
    })
    .sort((a, b) => {
      const am = toMillisMaybe(a?.createdAt) ?? Number(a?.createdAtMs ?? 0) ?? 0
      const bm = toMillisMaybe(b?.createdAt) ?? Number(b?.createdAtMs ?? 0) ?? 0
      return am - bm
    })

  const sliced = limit > 0 ? docs.slice(0, limit) : docs

  console.log('[cleanup] Pending orders found:', snap.size)
  console.log('[cleanup] Candidates (pending, not printedAt, older than cutoff):', docs.length)
  console.log('[cleanup] Will process:', sliced.length)

  if (!apply) {
    console.log('[cleanup] Dry run. Re-run with --apply to update printedAt.')
    console.log('[cleanup] Sample ids:', sliced.slice(0, 20).map((d) => d.id).join(', '))
    return
  }

  let ok = 0
  let fail = 0
  for (const o of sliced) {
    try {
      await updateDoc(doc(db, 'orders', String(o.id)), {
        printedAt: serverTimestamp(),
        printedBy: uid ?? null,
        printedDevice: 'cleanup-script',
        printedPrinter: null,
      })
      ok++
    } catch (e) {
      fail++
      console.log('[cleanup] Failed:', o.id, String((e && e.message) || e || 'error'))
    }
  }

  console.log('[cleanup] Done. Updated:', ok, 'Failed:', fail)
}

main().catch((e) => {
  console.error('[cleanup] Fatal:', e)
  process.exit(1)
})
