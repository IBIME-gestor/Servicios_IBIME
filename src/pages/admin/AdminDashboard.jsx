import { useState } from 'react'
import UsuariosTab from './UsuariosTab'
import ImportarAlumnosTab from './ImportarAlumnosTab'
import ConfigEstanciaTab from './ConfigEstanciaTab'
import ConfigComedorTab from './ConfigComedorTab'
import DashboardPagos from './DashboardPagos'
import { useAuth } from '../../contexts/AuthContext'
import { tienePermiso } from '../../lib/permisos'

const TABS = [
  { id: 'usuarios', label: 'Usuarios y permisos', permiso: 'admin.usuarios' },
  { id: 'importar', label: 'Importar alumnos', permiso: 'admin.importar' },
  { id: 'estancia', label: 'Configurar estancia', permiso: 'admin.config_estancia' },
  { id: 'comedor', label: 'Configurar comedor', permiso: 'admin.config_comedor' },
  { id: 'pagos', label: 'Pagos', permiso: 'admin.pagos' },
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const disponibles = TABS.filter((t) => tienePermiso(user, t.permiso))
  const [tab, setTab] = useState(disponibles[0]?.id)

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Administración</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {disponibles.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.6rem 0.9rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--red-600)' : 'var(--ink-muted)',
              borderBottom: tab === t.id ? '2px solid var(--red-600)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'importar' && <ImportarAlumnosTab />}
      {tab === 'estancia' && <ConfigEstanciaTab />}
      {tab === 'comedor' && <ConfigComedorTab />}
      {tab === 'pagos' && <DashboardPagos />}
    </div>
  )
}
