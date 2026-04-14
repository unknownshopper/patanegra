import React, { useMemo, useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import { useAuth } from '../auth/AuthProvider'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  React.useEffect(() => {
    const title = 'Patanegra · Login'
    const desc = 'Inicio de sesión para el personal (admin, caja, mesero, almacén).'
    document.title = title

    const ensureMeta = (key: 'name' | 'property', value: string) => {
      const selector = key === 'name' ? `meta[name="${value}"]` : `meta[property="${value}"]`
      let el = document.head.querySelector(selector) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(key, value)
        document.head.appendChild(el)
      }
      return el
    }

    ensureMeta('name', 'description').setAttribute('content', desc)
    ensureMeta('name', 'robots').setAttribute('content', 'noindex, nofollow')
    ensureMeta('property', 'og:title').setAttribute('content', title)
    ensureMeta('property', 'og:description').setAttribute('content', desc)
  }, [])

  const redirectPath = useMemo(() => {
    if (!user?.role) return '/'
    if (user.role === 'mesero') return '/mesero'
    if (user.role === 'gerente') return '/caja'
    if (user.role === 'caja') return '/caja'
    if (user.role === 'almacen') return '/almacen'
    if (user.role === 'piso') return '/admin'
    return '/admin'
  }, [user?.role])

  React.useEffect(() => {
    if (!user?.role) return
    navigate(redirectPath, { replace: true })
  }, [navigate, redirectPath, user?.role])

  if (loading) return <div className="container">Cargando...</div>
  if (user && !user.role) return <div className="container">Cargando rol...</div>
  if (user?.role) return null

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420 }}>
        <h1 className="h1">Patanegra POS</h1>
        <p className="muted">Inicia sesión</p>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label>Correo</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label>Contraseña</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div style={{ color: '#b91c1c' }}>{error}</div>}

          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setError(null)
              setBusy(true)
              try {
                await signInWithEmailAndPassword(auth, email.trim(), password)
              } catch (e) {
                setError('No se pudo iniciar sesión.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  )
}
