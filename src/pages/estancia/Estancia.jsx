import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos, filtrarAlumnos } from '../../lib/alumnos'
import { iniciarEstancia, estanciasActivas, estanciasDelDia, finalizarEstancia } from '../../lib/estancia'
import { tienePermiso } from '../../lib/permisos'
import CargaMasivaServicios from '../../components/CargaMasivaServicios'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import FirmaPad from '../../components/FirmaPad'

const minutosTexto = (minutos) => {
  const total = Number(minutos || 0)
  const horas = Math.floor(total / 60)
  const mins = total % 60
  if (horas === 0) return `${mins} min`
  return `${horas} h ${mins} min`
}

export default function Estancia() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [activos, setActivos] = useState([])
  const [registrosHoy, setRegistrosHoy] = useState([])
  const [retirando, setRetirando] = useState(null)
  const [nombreRetira, setNombreRetira] = useState('')
  const [firmaLista, setFirmaLista] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [mostrarCargaMasiva, setMostrarCargaMasiva] = useState(false)
  const [error, setError] = useState('')
  const firmaRef = useRef(null)

  async function cargarRegistros() {
    const [abiertos, hoy] = await Promise.all([estanciasActivas(), estanciasDelDia()])
    setActivos(abiertos)
    setRegistrosHoy(hoy)
  }

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnos)
    cargarRegistros().catch((err) => setError(err?.message || 'No fue posible cargar las estancias.'))
  }, [])

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function registrarLlegada(alumno) {
    if (registrando) return
    setRegistrando(true)
    setError('')
    try {
      await iniciarEstancia({ alumno, registradoPor: user.uid })
      setTexto('')
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible registrar la llegada.')
    } finally {
      setRegistrando(false)
    }
  }

  function abrirRetiro(estancia) {
    setRetirando(estancia)
    setNombreRetira('')
    setFirmaLista(false)
    setResultado(null)
  }

  async function confirmarRetiro() {
    if (!nombreRetira.trim() || !retirando) return
    setCargando(true)
    setError('')
    try {
      const firmaBlob = firmaLista ? await firmaRef.current.getBlob() : null
      const res = await finalizarEstancia({
        estanciaId: retirando.id,
        retiradoPor: nombreRetira.trim(),
        firmaBlob,
      })
      setResultado(res)
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible finalizar la estancia.')
    } finally {
      setCargando(false)
    }
  }

  const cerradasHoy = registrosHoy.filter((e) => e.horaSalida)

  return (
    <div className="estancia-page">
      <div className="estancia-header">
        <div>
          <h1 style={{ marginTop: 0 }}>🏫 Estancia</h1>
          <p className="page-muted">Registra la entrada y salida. El sistema calcula automáticamente el tiempo y el costo de cada estancia.</p>
        </div>
        <div className="estancia-counts">
          <span><strong>{activos.length}</strong> dentro</span>
          <span><strong>{cerradasHoy.length}</strong> salidas hoy</span>
        </div>
      </div>

      {error && <div className="card form-error">⚠️ {error}</div>}

      {tienePermiso(user, 'estancia.carga_masiva') && (
        <div style={{ marginBottom: '1rem' }}>
          <button className="btn btn-outline" onClick={() => setMostrarCargaMasiva(v => !v)}>
            📦 {mostrarCargaMasiva ? 'Ocultar carga masiva' : 'Carga masiva'}
          </button>
          {mostrarCargaMasiva && <div style={{ marginTop: '0.8rem' }}><CargaMasivaServicios tipo="estancia" /></div>}
        </div>
      )}

      <div className="estancia-layout">
        <section className="estancia-captura">
          <div className="card estancia-search-card">
            <h3 style={{ marginTop: 0 }}>Registrar entrada</h3>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                placeholder="Buscar alumno para registrar llegada…"
                value={texto}
                disabled={registrando}
                onChange={(e) => setTexto(e.target.value)}
              />
              {sugerencias.length > 0 && (
                <div className="card estancia-sugerencias">
                  {sugerencias.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={registrando}
                      onClick={() => registrarLlegada(a)}
                      className="estancia-sugerencia"
                    >
                      <strong>{a.nombre}</strong>
                      <div>{a.grado} {a.grupo} · {a.matricula}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card estancia-active-card">
            <div className="section-heading">
              <div><h3 style={{ margin: 0 }}>Alumnos en estancia ahora</h3><span>{activos.length} dentro</span></div>
            </div>
            {activos.length === 0 ? (
              <p className="page-muted">No hay alumnos en estancia.</p>
            ) : (
              <div className="estancia-active-list">
                {activos.map((e) => (
                  <div key={e.id} className="estancia-active-item">
                    <div className="estancia-status-dot" />
                    <div className="estancia-item-main">
                      <strong>{e.alumnoNombre}</strong>
                      <span>Entrada: {formatoHora(e.horaEntrada)}</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => abrirRetiro(e)}>Dar salida</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="card estancia-daily-card">
          <div className="section-heading">
            <div><h3 style={{ margin: 0 }}>Registro de hoy</h3><span>{registrosHoy.length} movimientos</span></div>
            <button className="btn btn-outline btn-small" onClick={() => cargarRegistros()}>Actualizar</button>
          </div>

          {registrosHoy.length === 0 ? (
            <div className="daily-empty"><span>🏫</span><p>Aquí aparecerán las entradas y salidas del día.</p></div>
          ) : (
            <div className="estancia-daily-list">
              {registrosHoy.map((e) => (
                <div key={e.id} className="estancia-daily-item">
                  <div className={`estancia-daily-badge ${e.horaSalida ? 'closed' : 'open'}`}>{e.horaSalida ? '✓' : '→'}</div>
                  <div className="estancia-daily-info">
                    <strong>{e.alumnoNombre}</strong>
                    <span>Entrada {e.horaEntrada ? formatoHora(e.horaEntrada) : '—'}</span>
                    {e.horaSalida ? (
                      <span>Salida {formatoHora(e.horaSalida)} · <strong>{minutosTexto(e.minutos)}</strong></span>
                    ) : (
                      <span className="text-success">En estancia</span>
                    )}
                  </div>
                  <div className="estancia-daily-cost">
                    {e.horaSalida ? <strong>${Number(e.costo || 0).toFixed(2)}</strong> : <span>—</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {retirando && (
        <div className="estancia-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !cargando) setRetirando(null) }}>
          <div className="card estancia-drawer" role="dialog" aria-modal="true">
            <div className="drawer-header">
              <div><h2 style={{ margin: 0 }}>Dar salida</h2><span>{retirando.alumnoNombre}</span></div>
              {!cargando && <button className="btn btn-outline btn-small" onClick={() => setRetirando(null)}>Cerrar</button>}
            </div>

            {resultado ? (
              <div className="estancia-result">
                <div className="result-number">{minutosTexto(resultado.minutos)}</div>
                <div className="result-label">Tiempo total en estancia</div>
                <div className="result-cost">${Number(resultado.costo || 0).toFixed(2)} MXN</div>
                <p className="page-muted">{resultado.desglose}</p>
                <button className="btn btn-primary" onClick={() => setRetirando(null)}>Listo</button>
              </div>
            ) : (
              <>
                <div className="drawer-summary">
                  <span>Entrada</span><strong>{formatoHora(retirando.horaEntrada)}</strong>
                </div>
                <label className="field-label">Nombre de quién retira al alumno</label>
                <input className="input" value={nombreRetira} onChange={(e) => setNombreRetira(e.target.value)} />
                <label className="field-label" style={{ marginTop: '1rem' }}>Firma de enterado del padre/madre/tutor</label>
                <FirmaPad ref={firmaRef} onCambio={setFirmaLista} />
                <div className="drawer-actions">
                  <button className="btn btn-primary" disabled={cargando || !nombreRetira.trim()} onClick={confirmarRetiro}>
                    {cargando ? 'Guardando…' : 'Confirmar salida y cobro'}
                  </button>
                  <button className="btn btn-outline" disabled={cargando} onClick={() => setRetirando(null)}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
