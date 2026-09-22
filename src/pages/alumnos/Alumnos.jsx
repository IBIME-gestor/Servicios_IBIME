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
    <div>
      <h1 style={{ marginTop: 0 }}>Alumnos</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>
        Directorio de solo lectura — para registrar consumos o estancia usa el módulo correspondiente.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <input
          className="input"
          placeholder="Buscar por nombre o matrícula…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="input" value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos los grupos</option>
          {grupos.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p style={{ color: 'var(--ink-muted)' }}>Cargando…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              <th style={{ padding: '0.4rem' }}>Nombre</th>
              <th style={{ padding: '0.4rem' }}>Matrícula</th>
              <th style={{ padding: '0.4rem' }}>Grado</th>
              <th style={{ padding: '0.4rem' }}>Grupo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem 0.4rem' }}>{a.nombre}</td>
                <td style={{ padding: '0.5rem 0.4rem', color: 'var(--ink-muted)' }}>{a.matricula}</td>
                <td style={{ padding: '0.5rem 0.4rem' }}>{a.grado}</td>
                <td style={{ padding: '0.5rem 0.4rem' }}>{a.grupo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!cargando && filtrados.length === 0 && (
        <p style={{ color: 'var(--ink-muted)', marginTop: '1rem' }}>No se encontraron alumnos.</p>
      )}
    </div>
  )
}
