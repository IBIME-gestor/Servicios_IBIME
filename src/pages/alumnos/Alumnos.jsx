import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  listarAlumnosActivos,
  filtrarPorPlantel,
  gradoGrupo,
  normalizar,
  plantelesDe,
  puedeVerTodosLosPlanteles,
  sinPlantelAsignado,
} from '../../lib/alumnos'

export default function Alumnos() {
  const { user } = useAuth()
  const [alumnosTodos, setAlumnosTodos] = useState([])
  const [texto, setTexto] = useState('')
  const [plantelFiltro, setPlantelFiltro] = useState('')
  const [nivelFiltro, setNivelFiltro] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarAlumnosActivos().then((lista) => {
      setAlumnosTodos(lista)
      setCargando(false)
    })
  }, [])

  // Cada usuario solo ve los alumnos de su plantel.
  const alumnos = useMemo(() => filtrarPorPlantel(alumnosTodos, user), [alumnosTodos, user])
  const verTodos = puedeVerTodosLosPlanteles(user)
  const planteles = useMemo(() => plantelesDe(alumnos), [alumnos])
  const niveles = useMemo(
    () => Array.from(new Set(alumnos.map((a) => String(a.nivel || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [alumnos]
  )
  const grupos = useMemo(
    () => Array.from(new Set(alumnos.map((a) => gradoGrupo({ grado: a.grado, grupo: a.grupo })).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [alumnos]
  )

  const filtrados = alumnos
    .filter((a) => (plantelFiltro ? normalizar(a.plantel) === normalizar(plantelFiltro) : true))
    .filter((a) => (nivelFiltro ? normalizar(a.nivel) === normalizar(nivelFiltro) : true))
    .filter((a) => (grupoFiltro ? gradoGrupo({ grado: a.grado, grupo: a.grupo }) === grupoFiltro : true))
    .filter((a) => {
      const t = normalizar(texto)
      if (!t) return true
      return normalizar(a.nombre).includes(t) || normalizar(a.matricula).includes(t) || normalizar(a.tutor).includes(t)
    })
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))

  return (
    <div className="alumnos-page page-shell">
      <div className="page-heading"><div><h1>Alumnos</h1>
      <p className="page-subtitle">
        Directorio de solo lectura — para registrar consumos o estancia usa el módulo correspondiente.
      </p></div></div>

      {sinPlantelAsignado(user) && (
        <div className="card form-error">
          Tu cuenta aún no tiene un plantel asignado, por eso no ves alumnos. Pide al administrador que te lo asigne.
        </div>
      )}

      <div className="alumnos-toolbar">
        <input
          className="input"
          placeholder="Buscar por nombre, matrícula o tutor…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {verTodos && planteles.length > 1 && (
          <select className="input" value={plantelFiltro} onChange={(e) => setPlantelFiltro(e.target.value)}>
            <option value="">Todos los planteles</option>
            {planteles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        {niveles.length > 1 && (
          <select className="input" value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)}>
            <option value="">Todos los niveles</option>
            {niveles.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
        <select className="input" value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
          <option value="">Todos los grados y grupos</option>
          {grupos.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p style={{ color: 'var(--ink-muted)' }}>Cargando…</p>
      ) : (
        <div className="alumnos-table-wrap">
          <table className="alumnos-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Matrícula</th>
              {verTodos && <th>Plantel</th>}
              <th>Nivel</th>
              <th>Grado</th>
              <th>Grupo</th>
              <th>Tutor responsable</th>
              <th>Teléfono tutor</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.nombre}</strong></td>
                <td className="page-muted">{a.matricula}</td>
                {verTodos && <td>{a.plantel}</td>}
                <td>{a.nivel}</td>
                <td>{a.grado}</td>
                <td>{a.grupo}</td>
                <td>{a.tutor}</td>
                <td>{a.telefonoTutor}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
      {!cargando && filtrados.length === 0 && (
        <p style={{ color: 'var(--ink-muted)', marginTop: '1rem' }}>No se encontraron alumnos.</p>
      )}
    </div>
  )
}
