import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos, filtrarAlumnos } from '../../lib/alumnos'
import { iniciarEstancia, estanciasActivas, finalizarEstancia } from '../../lib/estancia'
import { formatoHora } from '../../lib/fechas'
import FirmaPad from '../../components/FirmaPad'

export default function Estancia() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [activos, setActivos] = useState([])
  const [retirando, setRetirando] = useState(null) // estancia seleccionada para retiro
  const [nombreRetira, setNombreRetira] = useState('')
  const [firmaLista, setFirmaLista] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const firmaRef = useRef(null)

  async function cargarActivos() {
    setActivos(await estanciasActivas())
  }

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnos)
    cargarActivos()
  }, [])

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function registrarLlegada(alumno) {
    await iniciarEstancia({ alumno, registradoPor: user.uid })
    setTexto('')
    await cargarActivos()
  }

  function abrirRetiro(estancia) {
    setRetirando(estancia)
    setNombreRetira('')
    setFirmaLista(false)
    setResultado(null)
  }

  async function confirmarRetiro() {
    if (!nombreRetira.trim()) return
    setCargando(true)
    try {
      const firmaBlob = firmaLista ? await firmaRef.current.getBlob() : null
      const res = await finalizarEstancia({
        estanciaId: retirando.id,
        retiradoPor: nombreRetira.trim(),
        firmaBlob,
      })
      setResultado(res)
      await cargarActivos()
    } finally {
      setCargando(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Estancia</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>
        Registra la llegada del alumno y, al retirarlo, captura quién lo recoge y su firma.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: retirando ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div>
          <div style={{ position: 'relative', maxWidth: 420, marginBottom: '1.25rem' }}>
            <input
              className="input"
              placeholder="Buscar alumno para registrar llegada…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {sugerencias.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 5, maxHeight: 260, overflowY: 'auto' }}>
                {sugerencias.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => registrarLlegada(a)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  >
                    <strong>{a.nombre}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{a.grado} {a.grupo} · {a.matricula}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '0.95rem' }}>Alumnos en estancia ahora ({activos.length})</h3>
          {activos.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>No hay alumnos en estancia.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {activos.map((e) => (
                <li key={e.id} className="card" style={{ padding: '0.75rem 1rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{e.alumnoNombre}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Entrada: {formatoHora(e.horaEntrada)}</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => abrirRetiro(e)}>Retirar</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {retirando && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Retirar a {retirando.alumnoNombre}</h3>

            {resultado ? (
              <div>
                <p style={{ fontSize: '0.95rem' }}>
                  Tiempo en estancia: <strong>{resultado.minutos} min</strong>
                  <br />
                  Costo: <strong style={{ color: "var(--red-600)" }}>${resultado.costo} MXN</strong>
                  <br />
                  <span style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>{resultado.desglose}</span>
                </p>
                <button className="btn btn-outline" onClick={() => setRetirando(null)}>Cerrar</button>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                  Nombre de quién retira al alumno
                </label>
                <input
                  className="input"
                  value={nombreRetira}
                  onChange={(e) => setNombreRetira(e.target.value)}
                  style={{ marginBottom: '1rem' }}
                />

                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                  Firma de enterado del padre/madre/tutor
                </label>
                <FirmaPad ref={firmaRef} onCambio={setFirmaLista} />

                <button
                  className="btn btn-primary"
                  style={{ marginTop: '1rem' }}
                  disabled={cargando || !nombreRetira.trim()}
                  onClick={confirmarRetiro}
                >
                  {cargando ? 'Guardando…' : 'Confirmar retiro y cobro'}
                </button>
                <button className="btn btn-outline" style={{ marginTop: '1rem', marginLeft: '0.5rem' }} onClick={() => setRetirando(null)}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
