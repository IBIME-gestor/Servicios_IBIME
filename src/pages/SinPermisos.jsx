import { useAuth } from '../contexts/AuthContext'

export default function SinPermisos() {
  const { logout } = useAuth()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center' }}>
      <div>
        <img src="/icons/icon-96.png" alt="IBIME" width={56} height={56} style={{ marginBottom: '1rem' }} />
        <h2>Tu cuenta no tiene permisos activos</h2>
        <p style={{ color: 'var(--ink-muted)', maxWidth: 380 }}>
          Pídele al administrador que active tus permisos desde Administración → Usuarios.
        </p>
        <button className="btn btn-outline" onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  )
}
