import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { Role } from './types'

export function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="container">Cargando...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user.role) return <div className="container">Sin rol asignado.</div>
  if (!allow.includes(user.role)) return <div className="container">Acceso denegado.</div>

  return <>{children}</>
}
