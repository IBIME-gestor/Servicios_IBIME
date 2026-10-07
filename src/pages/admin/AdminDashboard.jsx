import { useSearchParams } from 'react-router-dom'

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
import { ADMIN_SECCIONES as TABS } from '../../lib/adminSecciones'
import LogTab from './LogTab'

export default function AdminDashboard() {
  const { user } = useAuth()

  const disponibles = TABS.filter((tab) =>
    tienePermiso(user, tab.permiso)
  )

  // La pestaña activa vive en la URL (?tab=...) para poder entrar desde el menú superior.
  const [params, setParams] = useSearchParams()
  const pedida = params.get('tab')
  const tab = disponibles.some((t) => t.id === pedida) ? pedida : disponibles[0]?.id
  const setTab = (id) => setParams({ tab: id })

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

        {tab === 'log' && <LogTab />}

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
