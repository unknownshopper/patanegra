import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireRole } from './auth/RequireRole'

const LoginPage = lazy(() => import('./pages/Login'))
const MenuPublicoPage = lazy(() => import('./pages/MenuPublico'))
const MeseroPage = lazy(() => import('./pages/Mesero'))
const CajaPage = lazy(() => import('./pages/Caja'))
const AlmacenPage = lazy(() => import('./pages/Almacen'))
const AdminPage = lazy(() => import('./pages/Admin'))

export default function App() {
  return (
    <Suspense fallback={<div className="container">Cargando…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/menu" element={<MenuPublicoPage />} />

        <Route path="/dashboard" element={<Navigate to="/admin?v=dashboard" replace />} />
        <Route path="/menu-config" element={<Navigate to="/admin?v=editor" replace />} />

        <Route
          path="/mesero"
          element={
            <RequireRole allow={['mesero', 'gerente', 'admin']}>
              <MeseroPage />
            </RequireRole>
          }
        />
        <Route
          path="/caja"
          element={
            <RequireRole allow={['caja', 'gerente', 'admin']}>
              <CajaPage />
            </RequireRole>
          }
        />
        <Route
          path="/almacen"
          element={
            <RequireRole allow={['almacen', 'gerente', 'admin']}>
              <AlmacenPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole allow={['admin']}>
              <AdminPage />
            </RequireRole>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<div className="container">404</div>} />
      </Routes>
    </Suspense>
  )
}
