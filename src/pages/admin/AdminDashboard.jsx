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

import CargaMasivaServicios from '../../components/CargaMasivaServicios'

import { useAuth } from '../../contexts/AuthContext'
import { tienePermiso } from '../../lib/permisos'

const TABS = [
  {
    id: 'usuarios',
    label: 'Usuarios y permisos',
    permiso: 'admin.usuarios',
  },
  {
    id: 'importar',
    label: 'Importar alumnos',
    permiso: 'admin.importar',
  },
  {
    id: 'estancia',
    label: 'Configurar estancia',
    permiso: 'admin.config_estancia',
  },
  {
    id: 'comedor',
    label: 'Configurar comedor',
    permiso: 'admin.config_comedor',
  },
  {
    id: 'planesComedor',
    label: 'Planes de comedor',
    permiso: 'admin.planes_comedor',
  },
  {
    id: 'calendario',
    label: 'Calendario / vacaciones',
    permiso: 'admin.calendario_comedor',
  },
  {
    id: 'pagos',
    label: 'Pagos',
    permiso: 'admin.pagos',
  },
  {
    id: 'cargasMasivas',
    label: 'Cargas masivas',
    permiso: 'admin.cargas_masivas',
  },
  {
    id: 'retroactiva',
    label: 'Carga retroactiva',
    permiso: 'admin.carga_retroactiva',
  },
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    permiso: 'admin.notificaciones',
  },
]

export default function AdminDashboard() {
  const { user } = useAuth()

  const disponibles = TABS.filter((tab) =>
    tienePermiso(user, tab.permiso)
  )

  const [tab, setTab] = useState(
    disponibles[0]?.id
  )

  return (
    <div className="admin-page page-shell">
      <div className="page-heading">
        <div>
          <h1>Administración</h1>

          <p className="page-subtitle">
            Configura usuarios, servicios, comedor, estancia y
            operación del sistema.
          </p>
        </div>
      </div>

      <div className="admin-tabs">
        {disponibles.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`admin-tab${
              tab === item.id ? ' active' : ''
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {tab === 'usuarios' && <UsuariosTab />}

        {tab === 'importar' && <ImportarAlumnosTab />}

        {tab === 'estancia' && <ConfigEstanciaTab />}

        {tab === 'comedor' && <ConfigComedorTab />}

        {tab === 'planesComedor' && (
          <PlanesComedorTab />
        )}

        {tab === 'calendario' && (
          <ConfigCalendarioTab />
        )}

        {tab === 'pagos' && <DashboardPagos />}

        {tab === 'cargasMasivas' && (
          <div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.6rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.15rem',
                  }}
                >
                  Cargas masivas
                </h2>

                <p
                  style={{
                    margin: '0.25rem 0 0',
                    color: 'var(--ink-muted)',
                    fontSize: '0.82rem',
                  }}
                >
                  Registra varios alumnos de comedor o
                  estancia desde Administración.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(320px,1fr))',
                gap: '1rem',
              }}
            >
              <CargaMasivaServicios tipo="comedor" />

              <CargaMasivaServicios tipo="estancia" />
            </div>
          </div>
        )}

        {tab === 'retroactiva' && (
          <CargaRetroactivaTab />
        )}

        {tab === 'notificaciones' && (
          <NotificacionesTab />
        )}
      </div>
    </div>
  )
}
