import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { loginConGoogle, errorDominio, setErrorDominio } = useAuth()
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function entrarConGoogle() {
    setError('')
    setErrorDominio('')
    setCargando(true)
    try {
      await loginConGoogle()
      navigate('/')
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('No se pudo iniciar sesión. Intenta de nuevo.')
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--navy-900)',
        padding: '1rem',
      }}
    >
      <div className="card" style={{ width: 360, padding: '2rem', textAlign: 'center' }}>
        <img src="/icons/icon-96.png" alt="IBIME" width={56} height={56} />
        <h1 style={{ fontSize: '1.2rem', margin: '0.75rem 0 0.1rem' }}>Sistema IBIME</h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
          Caja · Cafetería · Estancia
        </p>

        <button
          className="btn btn-primary"
          onClick={entrarConGoogle}
          disabled={cargando}
          style={{ width: '100%', justifyContent: 'center', gap: '0.6rem' }}
        >
          <GoogleIcon />
          {cargando ? 'Entrando…' : 'Continuar con Google'}
        </button>

        <p style={{ color: 'var(--ink-muted)', fontSize: '0.78rem', marginTop: '0.9rem' }}>
          Usa tu cuenta institucional de Google del colegio.
        </p>

        {(error || errorDominio) && (
          <p style={{ color: 'var(--red-600)', fontSize: '0.85rem', marginTop: '0.9rem' }}>
            {error || errorDominio}
          </p>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 7 29.6 5 24 5c-7.8 0-14.5 4.4-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.4C29.6 34.6 27 35.5 24 35.5c-5.3 0-9.8-3.4-11.4-8.1l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.4C41.8 36 44 30.6 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  )
}
