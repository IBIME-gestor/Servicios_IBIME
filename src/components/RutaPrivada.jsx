import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { tienePermiso } from '../lib/permisos'

/**
 * Envuelve una página y exige sesión iniciada y, opcionalmente, un permiso
 * específico (o el permiso "admin", que los tiene todos).
 */
export default function RutaPrivada({ permisoRequerido, children }) {
  const { user, loading } = useAuth()

  if (loading) return <div style={{ padding: '2rem' }}>Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.permisos || user.permisos.length === 0) return <Navigate to="/sin-permisos" replace />

  const requeridos = Array.isArray(permisoRequerido) ? permisoRequerido : permisoRequerido ? [permisoRequerido] : []
  const tieneAlguno = requeridos.length === 0 || requeridos.some((clave) => tienePermiso(user, clave))
  if (!tieneAlguno) return <Navigate to="/alumnos" replace />

  return children
}
