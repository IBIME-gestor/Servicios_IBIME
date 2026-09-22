import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { tienePermiso } from './lib/permisos'
import Layout from './components/Layout'
import RutaPrivada from './components/RutaPrivada'
import Login from './pages/Login'
import SinPermisos from './pages/SinPermisos'
import Alumnos from './pages/alumnos/Alumnos'
import Cafeteria from './pages/cafeteria/Cafeteria'
import Caja from './pages/caja/Caja'
import Estancia from './pages/estancia/Estancia'
import AdminDashboard from './pages/admin/AdminDashboard'

function InicioSegunPermisos() {
  const { user } = useAuth()
  if (tienePermiso(user, 'caja.ver')) return <Navigate to="/caja" replace />
  if (tienePermiso(user, 'cafeteria.ver')) return <Navigate to="/cafeteria" replace />
  if (tienePermiso(user, 'estancia.ver')) return <Navigate to="/estancia" replace />
  return <Navigate to="/alumnos" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/sin-permisos" element={<SinPermisos />} />

      <Route
        path="/"
        element={
          <RutaPrivada>
            <Layout>
              <InicioSegunPermisos />
            </Layout>
          </RutaPrivada>
        }
      />

      <Route
        path="/alumnos"
        element={
          <RutaPrivada permisoRequerido="alumnos.ver">
            <Layout><Alumnos /></Layout>
          </RutaPrivada>
        }
      />

      <Route
        path="/caja"
        element={
          <RutaPrivada permisoRequerido="caja.ver">
            <Layout><Caja /></Layout>
          </RutaPrivada>
        }
      />

      <Route
        path="/cafeteria"
        element={
          <RutaPrivada permisoRequerido="cafeteria.ver">
            <Layout><Cafeteria /></Layout>
          </RutaPrivada>
        }
      />

      <Route
        path="/estancia"
        element={
          <RutaPrivada permisoRequerido="estancia.ver">
            <Layout><Estancia /></Layout>
          </RutaPrivada>
        }
      />

      <Route
        path="/admin"
        element={
          <RutaPrivada permisoRequerido={['admin.usuarios', 'admin.importar', 'admin.config']}>
            <Layout><AdminDashboard /></Layout>
          </RutaPrivada>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
