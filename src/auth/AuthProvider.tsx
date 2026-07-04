import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { AuthUser, Role } from './types'

type AuthContextValue = {
  user: AuthUser | null
  firebaseUser: User | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [roleLoading, setRoleLoading] = useState(false)

  const deviceId = useMemo(() => {
    try {
      const key = 'deviceId'
      const existing = String(localStorage.getItem(key) ?? '').trim()
      if (existing) return existing
      const created = `dev_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
      localStorage.setItem(key, created)
      return created
    } catch {
      return `dev_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
    }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u)
      setRole(null)
      setDisplayName(null)
      setStaffId(null)
      setRoleLoading(Boolean(u))
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!authLoading) return
    const t = window.setTimeout(() => {
      setAuthLoading(false)
    }, 6000)
    return () => window.clearTimeout(t)
  }, [authLoading])

  useEffect(() => {
    if (!firebaseUser) {
      setRoleLoading(false)
      return
    }

    const userDocRef = doc(db, 'users', firebaseUser.uid)
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        const data = snap.data() as { role?: Role; displayName?: string; staffId?: string } | undefined
        setRole(data?.role ?? null)
        setDisplayName(typeof data?.displayName === 'string' ? data.displayName : null)
        setStaffId(typeof data?.staffId === 'string' ? data.staffId : null)
        setRoleLoading(false)
      },
      () => {
        setRole(null)
        setDisplayName(null)
        setStaffId(null)
        setRoleLoading(false)
      },
    )

    return () => unsub()
  }, [firebaseUser])

  useEffect(() => {
    const uid = firebaseUser?.uid
    if (!uid) return
    if (!role) return

    const isStaff = role === 'admin' || role === 'gerente' || role === 'piso' || role === 'caja' || role === 'mesero' || role === 'almacen'
    if (!isStaff) return

    const presenceRef = doc(db, 'presence', `${uid}_${deviceId}`)
    let alive = true

    const send = async () => {
      try {
        await setDoc(
          presenceRef,
          {
            uid,
            role,
            displayName: displayName ?? null,
            email: firebaseUser?.email ?? null,
            deviceId,
            page: typeof window !== 'undefined' ? window.location.pathname : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            lastSeenAt: serverTimestamp(),
            lastSeenMs: Date.now(),
          },
          { merge: true },
        )
      } catch (e) {
        console.warn('[presence] write failed', e)
      }
    }

    void send()
    const t = window.setInterval(() => {
      if (!alive) return
      void send()
    }, 30_000)

    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [deviceId, displayName, firebaseUser?.email, firebaseUser?.uid, role])

  useEffect(() => {
    if (!firebaseUser) return
    if (!roleLoading) return
    const t = window.setTimeout(() => {
      setRoleLoading(false)
    }, 6000)
    return () => window.clearTimeout(t)
  }, [firebaseUser, roleLoading])

  const user: AuthUser | null = useMemo(() => {
    if (!firebaseUser) return null
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role,
      displayName,
      staffId,
    }
  }, [firebaseUser, role, displayName, staffId])

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      firebaseUser,
      loading: authLoading || roleLoading,
      logout: async () => {
        await signOut(auth)
      },
    }),
    [user, firebaseUser, authLoading, roleLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
