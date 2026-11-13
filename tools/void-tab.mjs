import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  query,
  serverTimestamp,
  updateDoc,
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

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}

async function main() {
  loadDotEnvIfPresent()

  const idArg = arg('id', '')
  const nameArg = arg('name', '')
  const tableArg = arg('table', '')
  const apply = process.argv.includes('--apply')
  const keepOrders = process.argv.includes('--keep-orders')

  if (!idArg && !nameArg && !tableArg) {
    console.log('Uso: node tools/void-tab.mjs --name=<tabName|tableId|id> [--apply] [--keep-orders]')
    console.log('  Sin --apply solo muestra lo que haría. --keep-orders no borra las órdenes ligadas.')
    return
  }

  const firebaseConfig = {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
  }

  const saJsonPath = env('PRINT_BRIDGE_SA_JSON')
  const saUid = env('PRINT_BRIDGE_UID')
  const email = env('CLEANUP_EMAIL') || env('PRINT_BRIDGE_EMAIL')
  const password = env('CLEANUP_PASSWORD') || env('PRINT_BRIDGE_PASSWORD')
  if ((!email || !password) && !(saJsonPath && saUid)) {
    throw new Error('Missing CLEANUP_EMAIL/CLEANUP_PASSWORD (or PRINT_BRIDGE_EMAIL/PRINT_BRIDGE_PASSWORD or SA vars)')
  }

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

  if (saJsonPath && saUid) {
    const repoDir = path.dirname(fileURLToPath(import.meta.url))
    const saCandidates = [
      path.resolve(process.cwd(), saJsonPath),
      path.resolve(repoDir, '..', saJsonPath),
      path.resolve(repoDir, saJsonPath),
    ]
    const saFile = saCandidates.find((p) => fs.existsSync(p)) ?? saCandidates[0]
    const sa = JSON.parse(fs.readFileSync(saFile, 'utf8'))
    const now = Math.floor(Date.now() / 1000)
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const unsigned =
      `${b64({ alg: 'RS256', typ: 'JWT' })}.` +
      b64({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid: saUid,
      })
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
    await signInWithCustomToken(auth, `${unsigned}.${sig}`)
  } else {
    await signInWithEmailAndPassword(auth, email, password)
  }
  const uid = auth.currentUser?.uid ?? null
  console.log('[void] Auth OK:', uid)

  const tabsSnap = await getDocs(query(collection(db, 'tabs'), where('status', '==', 'open')))
  const wanted = [idArg, nameArg, tableArg].filter(Boolean).map((s) => String(s).toLowerCase())
  const tabs = tabsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => {
      const hay = [t.id, t.tableId, t.tabName].filter((x) => x != null).map((x) => String(x).toLowerCase())
      return wanted.some((w) => hay.includes(w))
    })

  console.log('[void] Open tabs matched:', tabs.length)
  if (!tabs.length) return

  for (const t of tabs) {
    const ordersSnap = await getDocs(query(collection(db, 'orders'), where('tabId', '==', t.id)))
    const orders = ordersSnap.docs
    console.log(
      `\n== tab ${t.id} · ${String(t.tableId ?? '')} · ${String(t.tabName ?? '')} · total=${Number(t.total ?? 0)} · orders=${orders.length}`,
    )

    if (!apply) continue

    await updateDoc(doc(db, 'tabs', t.id), {
      status: 'closed',
      isVoided: true,
      voidedAt: serverTimestamp(),
      voidedByUid: uid,
      voidReason: 'test-cleanup',
      updatedAt: serverTimestamp(),
    })
    console.log('   tab voided+closed')

    if (!keepOrders) {
      for (const o of orders) {
        await deleteDoc(doc(db, 'orders', o.id))
      }
      console.log(`   deleted ${orders.length} orders`)
    }
  }

  if (!apply) console.log('\n[void] Dry run — agrega --apply para ejecutar.')
}

main().catch((e) => {
  console.error('[void] Fatal:', e)
  process.exit(1)
})
