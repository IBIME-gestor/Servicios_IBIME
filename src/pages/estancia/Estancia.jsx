import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  listarAlumnosActivos,
  filtrarAlumnos,
  filtrarPorPlantel,
  descripcionAlumno,
  puedeVerTodosLosPlanteles,
  sinPlantelAsignado,
} from '../../lib/alumnos'
import {
  iniciarEstancia,
  estanciasActivas,
  estanciasDelDia,
  finalizarEstancia,
  marcarEstanciaPagada,
  METODOS_PAGO_ESTANCIA,
} from '../../lib/estancia'
import { tienePermiso } from '../../lib/permisos'
import CargaMasivaServicios from '../../components/CargaMasivaServicios'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import { calcularCostoEstancia, calcularMinutosEstancia, obtenerConfigEstancia } from '../../lib/pricing'
import FirmaPad from '../../components/FirmaPad'
import CorteEstancia from './CorteEstancia'

const dineroLocal = (n) => `$${Number(n || 0).toFixed(2)}`

const minutosTexto = (minutos) => {
  const total = Number(minutos || 0)
  const horas = Math.floor(total / 60)
  const mins = total % 60
  if (horas === 0) return `${mins} min`
  return `${horas} h ${mins} min`
}

export default function Estancia() {
  const { user } = useAuth()
  const [alumnosTodos, setAlumnosTodos] = useState([])
  const [vista, setVista] = useState('operacion') // 'operacion' | 'corte'
  const [pagando, setPagando] = useState(null) // estancia a la que se le elige método de pago
  const [guardandoPago, setGuardandoPago] = useState('')
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
  const [configEstancia, setConfigEstancia] = useState(null)
  const [ahora, setAhora] = useState(new Date())
  const firmaRef = useRef(null)

  async function cargarRegistros() {
    const [abiertos, hoy] = await Promise.all([estanciasActivas(), estanciasDelDia()])
    setActivos(abiertos)
    setRegistrosHoy(hoy)
  }

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnosTodos)
    obtenerConfigEstancia().then(setConfigEstancia).catch(() => setConfigEstancia(null))
    const reloj = setInterval(() => setAhora(new Date()), 30000)
    cargarRegistros().catch((err) => setError(err?.message || 'No fue posible cargar las estancias.'))
    return () => clearInterval(reloj)
  }, [])

  // Cada usuario solo ve y opera alumnos (y sus registros) de su plantel.
  const verTodos = puedeVerTodosLosPlanteles(user)
  const alumnos = useMemo(() => filtrarPorPlantel(alumnosTodos, user), [alumnosTodos, user])
  const mapaAlumnos = useMemo(() => new Map(alumnos.map((a) => [a.id, a])), [alumnos])
  const delPlantel = (lista) => (verTodos ? lista : lista.filter((e) => mapaAlumnos.has(e.alumnoId)))
  const activosVisibles = delPlantel(activos)
  const registrosVisibles = delPlantel(registrosHoy)
  const infoAlumno = (e) => descripcionAlumno(mapaAlumnos.get(e.alumnoId), { matricula: false }) || e.alumnoGrupo || ''
  const puedeCorte = tienePermiso(user, 'estancia.corte')

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
      setResultado({ ...res, estanciaId: retirando.id, pagado: false })
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible finalizar la estancia.')
    } finally {
      setCargando(false)
    }
  }

  async function pagarEstancia(estanciaId, metodoPago) {
    setGuardandoPago(estanciaId)
    setError('')
    try {
      await marcarEstanciaPagada({ estanciaId, usuario: user?.email || user?.uid || 'usuario', metodoPago })
      const marca = { pagado: true, cargado: true, metodoPago }
      setRegistrosHoy((lista) => lista.map((e) => (e.id === estanciaId ? { ...e, ...marca } : e)))
      setResultado((actual) => (actual?.estanciaId === estanciaId ? { ...actual, ...marca } : actual))
      setPagando(null)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible registrar el pago.')
    } finally {
      setGuardandoPago('')
    }
  }

  const cerradasHoy = registrosVisibles.filter((e) => e.horaSalida)

  return (
    <div className="estancia-page">
      <div className="estancia-header">
        <div>
          <h1 style={{ marginTop: 0 }}>🏫 Estancia</h1>
          <p className="page-muted">Registra la entrada y salida. El sistema calcula automáticamente el tiempo y el costo de cada estancia.</p>
        </div>
        <div className="estancia-counts">
          <span><strong>{activosVisibles.length}</strong> dentro</span>
          <span><strong>{cerradasHoy.length}</strong> salidas hoy</span>
        </div>
      </div>

      {error && <div className="card form-error">⚠️ {error}</div>}

      {sinPlantelAsignado(user) && (
        <div className="card form-error">
          Tu cuenta aún no tiene un plantel asignado, por eso no ves alumnos. Pide al administrador que te lo asigne.
        </div>
      )}

      {puedeCorte && (
        <div className="admin-tabs">
          <button className={`admin-tab${vista === 'operacion' ? ' active' : ''}`} onClick={() => setVista('operacion')}>
            Entradas y salidas
          </button>
          <button className={`admin-tab${vista === 'corte' ? ' active' : ''}`} onClick={() => setVista('corte')}>
            Corte de estancia
          </button>
        </div>
      )}

      {vista === 'corte' && puedeCorte && <CorteEstancia alumnos={alumnos} />}

      {vista === 'operacion' && (<>

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
                      <div>{descripcionAlumno(a)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card estancia-active-card">
            <div className="section-heading">
              <div><h3 style={{ margin: 0 }}>Alumnos en estancia ahora</h3><span>{activosVisibles.length} dentro</span></div>
            </div>
            {activosVisibles.length === 0 ? (
              <p className="page-muted">No hay alumnos en estancia.</p>
            ) : (
              <div className="estancia-active-list">
                {activosVisibles.map((e) => (
                  <div key={e.id} className="estancia-active-item">
                    <div className="estancia-status-dot" />
                    <div className="estancia-item-main">
                      <strong>{e.alumnoNombre}</strong>
                      {infoAlumno(e) && <span>{infoAlumno(e)}</span>}
                      <span>Entrada: {formatoHora(e.horaEntrada)}</span>
                      {configEstancia && (() => {
                        const minutosActuales = calcularMinutosEstancia(e.horaEntrada, ahora, configEstancia)
                        const preview = calcularCostoEstancia(minutosActuales, configEstancia)
                        return <span className={preview.costo === 0 ? 'text-success' : ''}>
                          {minutosTexto(minutosActuales)} · {preview.costo === 0 ? 'Dentro de gracia' : dineroLocal(preview.costo)}
                        </span>
                      })()}
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
            <div><h3 style={{ margin: 0 }}>Registro de hoy</h3><span>{registrosVisibles.length} movimientos</span></div>
            <button className="btn btn-outline btn-small" onClick={() => cargarRegistros()}>Actualizar</button>
          </div>

          {registrosVisibles.length === 0 ? (
            <div className="daily-empty"><span>🏫</span><p>Aquí aparecerán las entradas y salidas del día.</p></div>
          ) : (
            <div className="estancia-daily-list">
              {registrosVisibles.map((e) => (
                <div key={e.id} className="estancia-daily-item">
                  <div className={`estancia-daily-badge ${e.horaSalida ? 'closed' : 'open'}`}>{e.horaSalida ? '✓' : '→'}</div>
                  <div className="estancia-daily-info">
                    <strong>{e.alumnoNombre}</strong>
                    {infoAlumno(e) && <span>{infoAlumno(e)}</span>}
                    <span>Entrada {e.horaEntrada ? formatoHora(e.horaEntrada) : '—'}</span>
                    {e.horaSalida ? (
                      <span>Salida {formatoHora(e.horaSalida)} · <strong>{minutosTexto(e.minutos)}</strong></span>
                    ) : (
                      <span className="text-success">En estancia</span>
                    )}
                  </div>
                  <div className="estancia-daily-cost">
                    {e.horaSalida ? (
                      <>
                        <strong>${Number(e.costo || 0).toFixed(2)}</strong>
                        {e.pagado ? (
                          <span className="status-pill status-paid">
                            ✓ Pagado{e.metodoPago && METODOS_PAGO_ESTANCIA[e.metodoPago] ? ` · ${METODOS_PAGO_ESTANCIA[e.metodoPago].etiqueta}` : ''}
                          </span>
                        ) : (
                          <button className="btn btn-primary btn-small" disabled={guardandoPago === e.id} onClick={() => setPagando(e)}>
                            {guardandoPago === e.id ? '…' : 'Pagar'}
                          </button>
                        )}
                      </>
                    ) : <span>—</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      </>)}

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
                <div className="drawer-actions" style={{ justifyContent: 'center' }}>
                  {resultado.pagado ? (
                    <span className="status-pill status-paid">
                      ✓ Pago registrado{resultado.metodoPago ? ` en ${METODOS_PAGO_ESTANCIA[resultado.metodoPago]?.etiqueta}` : ''} y enviado a Caja
                    </span>
                  ) : (
                    <button className="btn btn-primary" disabled={guardandoPago === resultado.estanciaId} onClick={() => setPagando({ id: resultado.estanciaId, alumnoNombre: retirando.alumnoNombre, costo: resultado.costo })}>
                      💳 Pagar
                    </button>
                  )}
                  <button className="btn btn-outline" onClick={() => setRetirando(null)}>Listo</button>
                </div>
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
      {pagando && (
        <div className="estancia-drawer-backdrop pago-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardandoPago) setPagando(null) }}>
          <div className="card pago-modal" role="dialog" aria-modal="true">
            <h3 style={{ marginTop: 0 }}>¿Cómo pagó?</h3>
            <p className="page-muted" style={{ marginTop: '-0.4rem' }}>
              {pagando.alumnoNombre} · <strong>{dineroLocal(pagando.costo)}</strong>
            </p>
            <div className="pago-opciones">
              {Object.values(METODOS_PAGO_ESTANCIA).map((m) => (
                <button
                  key={m.clave}
                  type="button"
                  className="btn btn-primary pago-opcion"
                  disabled={Boolean(guardandoPago)}
                  onClick={() => pagarEstancia(pagando.id, m.clave)}
                >
                  <span style={{ fontSize: '1.6rem' }}>{m.icono}</span>
                  {m.etiqueta}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              Se refleja como pagado en Caja y queda pendiente en el corte de estancia.
            </p>
            <button className="btn btn-outline" disabled={Boolean(guardandoPago)} onClick={() => setPagando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
