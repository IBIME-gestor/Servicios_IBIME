import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { PERMISO_ADMIN, tienePermiso } from '../lib/permisos'
import RelojCDMX from './RelojCDMX'

const NAV_ITEMS = [
  { to: '/alumnos', label: 'Alumnos', mod: 'admin', permiso: 'alumnos.ver' },
  { to: '/caja', label: 'Caja', mod: 'caja', permiso: 'caja.ver' },
  { to: '/cafeteria', label: 'Cafetería', mod: 'cafeteria', permiso: 'cafeteria.ver' },
  { to: '/estancia', label: 'Estancia', mod: 'estancia', permiso: 'estancia.ver' },
  { to: '/admin', label: 'Administración', mod: 'admin', permiso: 'admin.usuarios' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const visibles = NAV_ITEMS.filter((item) => tienePermiso(user, item.permiso))
  const esAdmin = user?.permisos?.includes(PERMISO_ADMIN)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '1.25rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.5rem 1.25rem' }}>
          <img src="/icons/icon-48.png" alt="IBIME" width={32} height={32} />
          <strong style={{ color: 'var(--navy-900)', fontSize: '1.05rem' }}>IBIME</strong>
        </div>

        {visibles.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'block',
              padding: '0.6rem 0.75rem',
              borderRadius: 6,
              textDecoration: 'none',
              color: isActive ? 'var(--ink)' : 'var(--ink-muted)',
              fontWeight: isActive ? 700 : 500,
              borderLeft: `3px solid ${isActive ? `var(--mod-${item.mod})` : 'transparent'}`,
              background: isActive ? 'var(--surface-sunken)' : 'transparent',
            })}
          >
            {item.label}
          </NavLink>
        ))}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Oscuro' : '☀️ Claro'}
          </button>
          <button
            className="btn btn-outline"
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            padding: '0.9rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <RelojCDMX />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>{user?.nombre}</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                color: 'var(--navy-700)',
                background: 'var(--surface-sunken)',
                padding: '0.2rem 0.5rem',
                borderRadius: 4,
              }}
            >
              {esAdmin ? 'Administrador' : 'Colaborador'}
            </span>
          </div>
        </header>
        <main style={{ flex: 1, padding: '1.5rem', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
