import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos, filtrarAlumnos } from '../../lib/alumnos'
import { registrarConsumo, consumosSemanaAlumno } from '../../lib/consumos'
import { formatoFecha, formatoHora } from '../../lib/fechas'

export default function Cafeteria() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [resumen, setResumen] = useState([])
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnos)
  }, [])

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function seleccionar(alumno) {
    setSeleccionado(alumno)
    setTexto('')
    setAviso('')
    const semana = await consumosSemanaAlumno(alumno.id)
    setResumen(semana)
  }

  async function registrar(tipo) {
    if (!seleccionado) return
    setRegistrando(true)
    try {
      await registrarConsumo({ alumno: seleccionado, tipo, registradoPor: user.uid })
      setAviso(`Registrado: ${tipo === 'desayuno' ? 'Desayuno' : 'Comida'} ✓`)
      const semana = await consumosSemanaAlumno(seleccionado.id)
      setResumen(semana)
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>🍽️ Cafetería</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>
        Busca al alumno por nombre, matrícula o grupo y registra su consumo.
      </p>

      <div style={{ position: 'relative', maxWidth: 420, marginBottom: '1.5rem' }}>
        <input
          className="input"
          placeholder="Buscar alumno…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {sugerencias.length > 0 && (
          <div className="card" style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 5, maxHeight: 260, overflowY: 'auto' }}>
            {sugerencias.map((a) => (
              <button
                key={a.id}
                onClick={() => seleccionar(a)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.6rem 0.8rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <strong>{a.nombre}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  {a.grado} {a.grupo} · {a.matricula}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {seleccionado && (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 560 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{seleccionado.nombre}</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
                {seleccionado.grado} {seleccionado.grupo} · {seleccionado.matricula}
              </span>
            </div>
            {resumen.length >= 3 && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--amber-500)' }}>
                Frecuente esta semana ({resumen.length}×)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
            <button className="btn btn-primary" disabled={registrando} onClick={() => registrar('desayuno')}>
              Registrar desayuno
            </button>
            <button className="btn btn-primary" disabled={registrando} onClick={() => registrar('comida')}>
              Registrar comida
            </button>
          </div>

          {aviso && <p style={{ color: 'var(--green-600)', fontSize: '0.85rem' }}>{aviso}</p>}

          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Resumen de esta semana</h3>
          {resumen.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>Sin consumos registrados esta semana.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {resumen.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.45rem 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.9rem',
                  }}
                >
                  <span>{c.tipo === 'desayuno' ? 'Desayuno' : 'Comida'}</span>
                  <span style={{ color: 'var(--ink-muted)' }}>
                    {c.fecha ? `${formatoFecha(c.fecha)} · ${formatoHora(c.fecha)}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
