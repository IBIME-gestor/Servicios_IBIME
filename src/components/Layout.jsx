import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { PERMISO_ADMIN, tienePermiso } from '../lib/permisos'
import RelojCDMX from './RelojCDMX'

const NAV_ITEMS = [
  { to: '/alumnos', label: 'Alumnos', icon: '👥', mod: 'admin', permiso: 'alumnos.ver' },
  { to: '/caja', label: 'Caja', icon: '▣', mod: 'caja', permiso: 'caja.ver' },
  { to: '/cafeteria', label: 'Cafetería', icon: '🍽', mod: 'cafeteria', permiso: 'cafeteria.ver' },
  { to: '/estancia', label: 'Estancia', icon: '◷', mod: 'estancia', permiso: 'estancia.ver' },
  { to: '/admin', label: 'Administración', icon: '⚙', mod: 'admin', permiso: 'admin.usuarios' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const visibles = NAV_ITEMS.filter((item) => tienePermiso(user, item.permiso))
  const esAdmin = user?.permisos?.includes(PERMISO_ADMIN)

  return (
    <div className="app-shell">
      <aside className="app-sidebar ibime-sidebar">
        <div className="ibime-brand">
          <img src="/icons/icon-48.png" alt="IBIME" />
          <div><strong>IBIME</strong><span>Servicios escolares</span></div>
        </div>
        <nav className="ibime-nav" aria-label="Módulos">
          {visibles.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `ibime-nav-link${isActive ? ' active' : ''}`}>
              <span className="ibime-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ibime-sidebar-footer">
          <button className="btn" onClick={toggleTheme}>{theme === 'light' ? '🌙  Modo oscuro' : '☀️  Modo claro'}</button>
          <button className="btn" onClick={async () => { await logout(); navigate('/login') }}>Cerrar sesión</button>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header ibime-topbar">
          <RelojCDMX />
          <div className="ibime-user">
            <span className="ibime-user-name">{user?.nombre}</span>
            <span className="ibime-role">{esAdmin ? 'Administrador' : 'Colaborador'}</span>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}
