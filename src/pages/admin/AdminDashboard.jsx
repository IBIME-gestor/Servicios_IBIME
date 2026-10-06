import { useState } from 'react'
import UsuariosTab from './UsuariosTab'
import ImportarAlumnosTab from './ImportarAlumnosTab'
import ConfigEstanciaTab from './ConfigEstanciaTab'
import ConfigComedorTab from './ConfigComedorTab'
import DashboardPagos from './DashboardPagos'
import CargaRetroactivaTab from './CargaRetroactivaTab'
import NotificacionesTab from './NotificacionesTab'
import PlanesComedorTab from './PlanesComedorTab'
import ConfigCalendarioTab from './ConfigCalendarioTab'
import { useAuth } from '../../contexts/AuthContext'
import { tienePermiso } from '../../lib/permisos'

const TABS = [
  { id: 'usuarios', label: 'Usuarios y permisos', permiso: 'admin.usuarios' },
  { id: 'importar', label: 'Importar alumnos', permiso: 'admin.importar' },
  { id: 'estancia', label: 'Configurar estancia', permiso: 'admin.config_estancia' },
  { id: 'comedor', label: 'Configurar comedor', permiso: 'admin.config_comedor' },
  { id: 'planesComedor', label: 'Planes de comedor', permiso: 'admin.planes_comedor' },
  { id: 'calendario', label: 'Calendario / vacaciones', permiso: 'admin.calendario_comedor' },
  { id: 'pagos', label: 'Pagos', permiso: 'admin.pagos' },
  { id: 'retroactiva', label: 'Carga retroactiva', permiso: 'admin.carga_retroactiva' },
  { id: 'notificaciones', label: 'Notificaciones', permiso: 'admin.notificaciones' },
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const disponibles = TABS.filter((t) => tienePermiso(user, t.permiso))
  const [tab, setTab] = useState(disponibles[0]?.id)

  return (
    <div className="admin-page page-shell">
      <div className="page-heading"><div><h1>Administración</h1><p className="page-subtitle">Configura usuarios, servicios, comedor, estancia y operación del sistema.</p></div></div>

      <div className="admin-tabs">
        {disponibles.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`admin-tab${tab === t.id ? ' active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-content">
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'importar' && <ImportarAlumnosTab />}
      {tab === 'estancia' && <ConfigEstanciaTab />}
      {tab === 'comedor' && <ConfigComedorTab />}
      {tab === 'planesComedor' && <PlanesComedorTab />}
      {tab === 'calendario' && <ConfigCalendarioTab />}
      {tab === 'pagos' && <DashboardPagos />}
      {tab === 'retroactiva' && <CargaRetroactivaTab />}
      {tab === 'notificaciones' && <NotificacionesTab />}
      </div>
    </div>
  )
}
