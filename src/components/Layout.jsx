import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { PERMISO_ADMIN, tienePermiso } from '../lib/permisos'
import { PLANTEL_TODOS } from '../lib/alumnos'
import { ADMIN_SECCIONES } from '../lib/adminSecciones'
import RelojCDMX from './RelojCDMX'

const NAV_ITEMS = [
  { to: '/alumnos', label: 'Alumnos', icon: '👥', permiso: 'alumnos.ver' },
  { to: '/caja', label: 'Caja', icon: '▣', permiso: 'caja.ver' },
  { to: '/cafeteria', label: 'Cafetería', icon: '🍽', permiso: 'cafeteria.ver' },
  { to: '/estancia', label: 'Estancia', icon: '◷', permiso: 'estancia.ver' },
  { to: '/admin', label: 'Administración', icon: '⚙', permiso: 'admin.usuarios' },
]

const SERVICIOS = [
  { to: '/caja', label: 'Caja', icon: '💳', desc: 'Cargos, pagos y mensualidades', permiso: 'caja.ver' },
  { to: '/cafeteria', label: 'Cafetería', icon: '🍽️', desc: 'Desayuno y comida del día', permiso: 'cafeteria.ver' },
  { to: '/estancia', label: 'Estancia', icon: '🏫', desc: 'Entradas, salidas y corte', permiso: 'estancia.ver' },
]

const PREF = 'ibime-menu'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [modo, setModo] = useState(() => localStorage.getItem(PREF) || 'top') // 'top' | 'side'
  const [abierto, setAbierto] = useState(null)
  const barraRef = useRef(null)

  const esAdmin = user?.permisos?.includes(PERMISO_ADMIN)
  const etiquetaPlantel = esAdmin || user?.plantel === PLANTEL_TODOS ? 'Todos los planteles' : user?.plantel || 'Sin plantel asignado'
  const salir = async () => { await logout(); navigate('/login') }
  const cambiarModo = () => setModo((m) => { const n = m === 'top' ? 'side' : 'top'; localStorage.setItem(PREF, n); return n })

  useEffect(() => { setAbierto(null) }, [pathname])
  useEffect(() => {
    const fuera = (e) => { if (barraRef.current && !barraRef.current.contains(e.target)) setAbierto(null) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(null) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [])

  // ---------- Menú lateral (el de siempre) ----------
  if (modo === 'side') {
    const visibles = NAV_ITEMS.filter((item) => tienePermiso(user, item.permiso))
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
            <button className="btn" onClick={cambiarModo}>▤ Probar menú superior</button>
            <button className="btn" onClick={toggleTheme}>{theme === 'light' ? '🌙  Modo oscuro' : '☀️  Modo claro'}</button>
            <button className="btn" onClick={salir}>Cerrar sesión</button>
          </div>
        </aside>
        <div className="app-content">
          <header className="app-header ibime-topbar">
            <RelojCDMX />
            <div className="ibime-user">
              <span className="ibime-user-name">{user?.nombre}</span>
              <span className="ibime-role">{esAdmin ? 'Administrador' : 'Colaborador'} · {etiquetaPlantel}</span>
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </div>
    )
  }

  // ---------- Menú superior con cajones ----------
  const servicios = SERVICIOS.filter((s) => tienePermiso(user, s.permiso))
  const adminItems = ADMIN_SECCIONES.filter((s) => tienePermiso(user, s.permiso))
  const verAlumnos = tienePermiso(user, 'alumnos.ver')
  const tabActual = new URLSearchParams(window.location.search).get('tab')

  return (
    <div className="app-shell-top">
      <header className="topnav" ref={barraRef}>
        <div className="topnav-brand">
          <img src="/icons/icon-48.png" alt="IBIME" />
          <div><strong>IBIME</strong><span>Servicios escolares</span></div>
        </div>

        <nav className="topnav-menu" aria-label="Módulos">
          {verAlumnos && (
            <NavLink to="/alumnos" className={({ isActive }) => `topnav-btn${isActive ? ' active' : ''}`}>
              <span aria-hidden="true">👥</span> Alumnos
            </NavLink>
          )}

          {servicios.length > 0 && (
            <Cajon
              id="servicios" abierto={abierto} setAbierto={setAbierto}
              titulo="Servicios" icono="🧩"
              activo={servicios.some((s) => pathname.startsWith(s.to))}
            >
              {servicios.map((s) => (
                <NavLink key={s.to} to={s.to} className={({ isActive }) => `cajon-item${isActive ? ' active' : ''}`}>
                  <span className="cajon-icon" aria-hidden="true">{s.icon}</span>
                  <span><strong>{s.label}</strong><small>{s.desc}</small></span>
                </NavLink>
              ))}
            </Cajon>
          )}

          {adminItems.length > 0 && (
            <Cajon
              id="admin" abierto={abierto} setAbierto={setAbierto}
              titulo="Administración" icono="⚙️"
              activo={pathname.startsWith('/admin')} ancho
            >
              {adminItems.map((s) => (
                <NavLink
                  key={s.id} to={`/admin?tab=${s.id}`}
                  className={`cajon-item${pathname.startsWith('/admin') && (tabActual || adminItems[0].id) === s.id ? ' active' : ''}`}
                >
                  <span className="cajon-icon" aria-hidden="true">{s.icon}</span>
                  <span><strong>{s.label}</strong></span>
                </NavLink>
              ))}
            </Cajon>
          )}
        </nav>

        <div className="topnav-right">
          <RelojCDMX />
          <Cajon
            id="usuario" abierto={abierto} setAbierto={setAbierto} derecha
            titulo={<span className="topnav-user"><strong>{user?.nombre}</strong><small>{esAdmin ? 'Administrador' : 'Colaborador'} · {etiquetaPlantel}</small></span>}
            icono="👤" sinCaret={false}
          >
            <button className="cajon-item" onClick={toggleTheme}>
              <span className="cajon-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
              <span><strong>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</strong></span>
            </button>
            <button className="cajon-item" onClick={cambiarModo}>
              <span className="cajon-icon">▥</span>
              <span><strong>Volver al menú lateral</strong></span>
            </button>
            <button className="cajon-item" onClick={salir}>
              <span className="cajon-icon">🚪</span>
              <span><strong>Cerrar sesión</strong></span>
            </button>
          </Cajon>
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  )
}

function Cajon({ id, titulo, icono, activo = false, abierto, setAbierto, children, ancho = false, derecha = false }) {
  const esta = abierto === id
  return (
    <div className="cajon">
      <button
        type="button"
        className={`topnav-btn${activo ? ' active' : ''}${esta ? ' open' : ''}`}
        aria-haspopup="true" aria-expanded={esta}
        onClick={() => setAbierto(esta ? null : id)}
      >
        <span aria-hidden="true">{icono}</span>
        <span className="topnav-btn-label">{titulo}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {esta && (
        <div className={`cajon-panel${ancho ? ' ancho' : ''}${derecha ? ' derecha' : ''}`} role="menu">
          {children}
        </div>
      )}
    </div>
  )
}
