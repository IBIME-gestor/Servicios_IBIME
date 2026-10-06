import { useEffect, useMemo, useState } from 'react'
import { listarAlumnosActivos } from '../../lib/alumnos'

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarAlumnosActivos().then((lista) => {
      setAlumnos(lista)
      setCargando(false)
    })
  }, [])

  const grupos = useMemo(() => {
    const set = new Set(alumnos.map((a) => a.grupo).filter(Boolean))
    return Array.from(set).sort()
  }, [alumnos])

  const filtrados = alumnos
    .filter((a) => (grupoFiltro ? a.grupo === grupoFiltro : true))
    .filter((a) => {
      const t = texto.trim().toLowerCase()
      if (!t) return true
      return a.nombre?.toLowerCase().includes(t) || a.matricula?.toLowerCase().includes(t)
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <div className="alumnos-page page-shell">
      <div className="page-heading"><div><h1>Alumnos</h1>
      <p className="page-subtitle">
        Directorio de solo lectura — para registrar consumos o estancia usa el módulo correspondiente.
      </p></div></div>

      <div className="alumnos-toolbar">
        <input
          className="input"
          placeholder="Buscar por nombre o matrícula…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select className="input" value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
          <option value="">Todos los grupos</option>
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
              <th>Grado</th>
              <th>Grupo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.nombre}</strong></td>
                <td className="page-muted">{a.matricula}</td>
                <td>{a.grado}</td>
                <td>{a.grupo}</td>
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
