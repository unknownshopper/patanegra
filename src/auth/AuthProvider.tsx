import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
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
