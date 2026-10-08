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
  cortarTiempoEstancia,
  completarSalidaEstancia,
  estanciasRetiroPendiente,
  reintentarFirmasPendientes,
  marcarEstanciaPendiente,
  estanciasPendientesAlumno,
  pagarEstancias,
  validarTarjeta,
  describirPago,
  TIPOS_TARJETA,
} from '../../lib/estancia'
import { tienePermiso } from '../../lib/permisos'
import CargaMasivaServicios from '../../components/CargaMasivaServicios'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import { calcularCostoEstancia, calcularMinutosEstancia, configParaEstancia, obtenerConfigEstancia } from '../../lib/pricing'
import FirmaPad from '../../components/FirmaPad'
import CorteEstancia from './CorteEstancia'
import { registrarLog } from '../../lib/log'
import { notificarTicketPago, notificarSaldoPendiente } from '../../lib/notificacionesAuto'

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
  const [ajusteAcuerdo, setAjusteAcuerdo] = useState(false)
  const [pendientesPrevios, setPendientesPrevios] = useState([]) // conceptos "Pendiente" de días anteriores del mismo alumno
  const [cargandoPrevios, setCargandoPrevios] = useState(false)
  const [seleccion, setSeleccion] = useState({}) // id → ¿se paga ahora?
  const [metodoTarjeta, setMetodoTarjeta] = useState(false) // se pulsó "Tarjeta"
  const [tarjeta, setTarjeta] = useState({ tipo: '', banco: '', ultimos4: '', titular: '' })
  const [titularIgual, setTitularIgual] = useState(false)
  const [errorPago, setErrorPago] = useState('')
  const [retirosPendientes, setRetirosPendientes] = useState([])
  const [cortando, setCortando] = useState('')
  const [avisoCorreo, setAvisoCorreo] = useState(null) // { tipo: 'ok' | 'warn', texto }
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
    const [abiertos, hoy, sinCompletar] = await Promise.all([estanciasActivas(), estanciasDelDia(), estanciasRetiroPendiente()])
    setActivos(abiertos)
    setRegistrosHoy(hoy)
    setRetirosPendientes(sinCompletar)
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
  // Alumnos a los que ya se les cortó el tiempo pero falta firma y/o pago (se muestran en amarillo con alerta).
  const porCobrar = useMemo(() => {
    const mapa = new Map()
    retirosPendientes.forEach((e) => mapa.set(e.id, e))
    registrosHoy
      .filter((e) => e.horaSalida && !e.pagado && !e.pendiente)
      .forEach((e) => mapa.set(e.id, { ...mapa.get(e.id), ...e }))
    return Array.from(mapa.values())
      .filter((e) => !e.pagado && e.horaSalida)
      .sort((a, b) => (a.horaSalida?.getTime() || 0) - (b.horaSalida?.getTime() || 0))
  }, [retirosPendientes, registrosHoy])
  const porCobrarVisibles = delPlantel(porCobrar)
  const infoAlumno = (e) => descripcionAlumno(mapaAlumnos.get(e.alumnoId), { matricula: false }) || e.alumnoGrupo || ''
  const puedeCorte = tienePermiso(user, 'estancia.corte')

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function registrarLlegada(alumno) {
    if (registrando) return
    setRegistrando(true)
    setError('')
    try {
      const estanciaId = await iniciarEstancia({ alumno, registradoPor: user.uid })
      registrarLog({ user, accion: 'estancia.entrada', modulo: 'estancia', entidad: 'estancias', entidadId: estanciaId, alumno })
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

  async function cortarTiempo(estancia) {
    if (cortando) return
    const ok = window.confirm(`¿Cortar el tiempo de ${estancia.alumnoNombre} ahora (${formatoHora(new Date())})?\n\nSe calculará el costo con esta hora y quedará en amarillo para completar la firma y el pago después.`)
    if (!ok) return
    setCortando(estancia.id)
    setError('')
    try {
      const res = await cortarTiempoEstancia({ estanciaId: estancia.id, usuario: user?.email || user?.uid || 'usuario' })
      registrarLog({
        user, accion: 'estancia.corte_tiempo', modulo: 'estancia', entidad: 'estancias', entidadId: estancia.id,
        alumno: { id: estancia.alumnoId, nombre: estancia.alumnoNombre, nivel: estancia.alumnoNivel },
        detalle: { minutos: res.minutos, costo: res.costo },
      })
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cortar el tiempo.')
    } finally {
      setCortando('')
    }
  }

  async function confirmarRetiro() {
    if (!nombreRetira.trim() || !retirando) return
    setCargando(true)
    setError('')
    try {
      const firmaBlob = firmaLista ? await firmaRef.current.getBlob() : null
      // Si ya se había cortado el tiempo, solo se completan nombre y firma (no se recalcula nada).
      const res = retirando.horaSalida
        ? await completarSalidaEstancia({ estanciaId: retirando.id, retiradoPor: nombreRetira.trim(), firmaBlob })
        : await finalizarEstancia({ estanciaId: retirando.id, retiradoPor: nombreRetira.trim(), firmaBlob })
      registrarLog({
        user, accion: retirando.horaSalida ? 'estancia.salida_completada' : 'estancia.salida', modulo: 'estancia', entidad: 'estancias', entidadId: retirando.id,
        alumno: { id: retirando.alumnoId, nombre: retirando.alumnoNombre, nivel: retirando.alumnoNivel },
        detalle: { minutos: res.minutos, costo: res.costo, retiradoPor: nombreRetira.trim(), conFirma: Boolean(firmaBlob) },
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

  function abrirPago(estancia) {
    setAjusteAcuerdo(false)
    setMetodoTarjeta(false)
    setTarjeta({ tipo: '', banco: '', ultimos4: '', titular: '' })
    setTitularIgual(false)
    setErrorPago('')
    setPendientesPrevios([])
    setSeleccion({ [estancia.id]: true })
    setPagando(estancia)
    // Si el alumno dejó conceptos "Pendiente" antes, se ofrecen junto al consumo actual.
    setCargandoPrevios(true)
    estanciasPendientesAlumno(estancia.alumnoId)
      .then((lista) => {
        const previos = lista.filter((x) => x.id !== estancia.id)
        setPendientesPrevios(previos)
        setSeleccion(Object.fromEntries([estancia, ...previos].map((x) => [x.id, true])))
      })
      .catch((err) => {
        console.error(err)
        setErrorPago('No se pudieron consultar los pendientes anteriores del alumno.')
      })
      .finally(() => setCargandoPrevios(false))
  }

  function cerrarPago() {
    if (guardandoPago) return
    setPagando(null)
  }

  /** Dispara un correo automático en segundo plano y muestra el resultado sin bloquear la caja. */
  function avisarCorreo(promesa) {
    promesa
      .then((r) => {
        if (r?.estado === 'enviado') setAvisoCorreo({ tipo: 'ok', texto: `📧 ${r.mensaje}` })
        else if (r?.estado === 'error' || r?.motivo === 'sin_correo') setAvisoCorreo({ tipo: 'warn', texto: `📧 ${r.mensaje}` })
      })
      .catch((err) => {
        console.error(err)
        setAvisoCorreo({ tipo: 'warn', texto: `📧 No se pudo enviar el correo automático: ${err?.message || err}` })
      })
  }

  // Al abrir Estancia, sube a Drive las firmas que se quedaron pendientes (sin bloquear nada).
  useEffect(() => {
    const t = setTimeout(() => { reintentarFirmasPendientes().catch(() => {}) }, 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!avisoCorreo) return undefined
    const t = setTimeout(() => setAvisoCorreo(null), 9000)
    return () => clearTimeout(t)
  }, [avisoCorreo])

  // Conceptos que se pueden pagar en este cobro: el actual + pendientes anteriores.
  const conceptosPago = pagando ? [pagando, ...pendientesPrevios] : []
  const conceptosElegidos = conceptosPago.filter((c) => seleccion[c.id])
  const totalElegido = conceptosElegidos.reduce((t, c) => t + (Number(c.costo) || 0), 0)
  const quienRecoge = (pagando?.retiradoPor || '').trim()

  function elegirTitularIgual(marcado) {
    setTitularIgual(marcado)
    setTarjeta((t) => ({ ...t, titular: marcado ? quienRecoge : '' }))
  }

  async function ejecutarPago({ metodoPago = null, ajuste = false }) {
    if (!pagando || guardandoPago) return
    if (conceptosElegidos.length === 0) { setErrorPago('Selecciona al menos un concepto para pagar.'); return }
    if (!ajuste && metodoPago === 'tarjeta') {
      const err = validarTarjeta(tarjeta)
      if (err) { setErrorPago(err); return }
    }
    setGuardandoPago(pagando.id)
    setErrorPago('')
    setError('')
    try {
      const datosTarjeta = metodoPago === 'tarjeta' ? { ...tarjeta, titularEsQuienRecoge: titularIgual } : null
      const res = await pagarEstancias({
        estanciaIds: conceptosElegidos.map((c) => c.id),
        usuario: user?.email || user?.uid || 'usuario',
        metodoPago, tarjeta: datosTarjeta, ajusteAcuerdo: ajuste,
      })
      registrarLog({
        user, accion: ajuste ? 'estancia.ajuste_acuerdo' : 'estancia.pago', modulo: 'estancia', entidad: 'estancias', entidadId: pagando.id,
        alumno: { id: pagando.alumnoId, nombre: pagando.alumnoNombre },
        detalle: {
          metodoPago: ajuste ? 'ajuste_acuerdo' : metodoPago,
          tarjeta: datosTarjeta ? { tipo: datosTarjeta.tipo, banco: datosTarjeta.banco, ultimos4: datosTarjeta.ultimos4, titular: datosTarjeta.titular } : null,
          conceptos: res.pagados.map((p) => p.id),
          importe: ajuste ? 0 : res.pagados.reduce((t, p) => t + p.costo, 0),
          importeOriginal: res.pagados.reduce((t, p) => t + p.costoOriginal, 0),
        },
      })
      setResultado((actual) => {
        if (!actual || !res.pagados.some((p) => p.id === actual.estanciaId)) return actual
        const marca = ajuste
          ? { pagado: true, pendiente: false, metodoPago: 'ajuste_acuerdo', ajusteAcuerdo: true }
          : { pagado: true, pendiente: false, metodoPago, tarjeta: datosTarjeta }
        return { ...actual, ...marca }
      })
      const alumnoPago = mapaAlumnos.get(pagando.alumnoId) || { id: pagando.alumnoId, nombre: pagando.alumnoNombre }
      setPagando(null)
      // Ticket automático por correo (solo pagos con importe; el ajuste acuerdo de $0 no genera ticket).
      if (!ajuste && res.pagados.length > 0) {
        avisarCorreo(notificarTicketPago({ estanciaIds: res.pagados.map((p) => p.id), alumno: alumnoPago, user }))
      }
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setErrorPago(err?.message || 'No fue posible registrar el pago.')
    } finally {
      setGuardandoPago('')
    }
  }

  async function dejarPendiente() {
    if (!pagando || guardandoPago) return
    const ok = window.confirm(`¿Dejar ${dineroLocal(pagando.costo)} de ${pagando.alumnoNombre} como COBRO PENDIENTE?\n\nQuedará abierto y aparecerá la próxima vez que el alumno vaya a pagar. Si junta 3 cobros pendientes sin pagar, se le enviará el aviso de saldo por correo.`)
    if (!ok) return
    setGuardandoPago(pagando.id)
    setErrorPago('')
    try {
      await marcarEstanciaPendiente({ estanciaId: pagando.id, usuario: user?.email || user?.uid || 'usuario' })
      registrarLog({
        user, accion: 'estancia.pendiente', modulo: 'estancia', entidad: 'estancias', entidadId: pagando.id,
        alumno: { id: pagando.alumnoId, nombre: pagando.alumnoNombre }, detalle: { importe: Number(pagando.costo || 0) },
      })
      setResultado((actual) => (actual?.estanciaId === pagando.id ? { ...actual, pendiente: true } : actual))
      const alumnoPend = mapaAlumnos.get(pagando.alumnoId) || { id: pagando.alumnoId, nombre: pagando.alumnoNombre }
      setPagando(null)
      // Si ya suma las estancias pendientes configuradas (3 por defecto), avisa del saldo por correo.
      avisarCorreo(notificarSaldoPendiente({ alumno: alumnoPend, user }))
      await cargarRegistros()
    } catch (err) {
      console.error(err)
      setErrorPago(err?.message || 'No fue posible dejar el concepto como pendiente.')
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
          {porCobrarVisibles.length > 0 && <span style={{ color: '#92400e' }}><strong>{porCobrarVisibles.length}</strong> por cobrar</span>}
        </div>
      </div>

      {error && <div className="card form-error">⚠️ {error}</div>}
      {avisoCorreo && (
        <div className="card" style={{ padding: '0.7rem 1rem', marginBottom: '1rem', border: `1px solid ${avisoCorreo.tipo === 'ok' ? '#16a34a' : '#f59e0b'}`, background: avisoCorreo.tipo === 'ok' ? '#f0fdf4' : '#fffbeb', color: avisoCorreo.tipo === 'ok' ? '#166534' : '#92400e', fontSize: '0.88rem' }}>
          {avisoCorreo.texto}
        </div>
      )}

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
                        const minutosActuales = calcularMinutosEstancia(e.horaEntrada, ahora, configParaEstancia(e, configEstancia))
                        const preview = calcularCostoEstancia(minutosActuales, configEstancia)
                        return <span className={preview.costo === 0 ? 'text-success' : ''}>
                          {minutosTexto(minutosActuales)} · {preview.costo === 0 ? 'Dentro de gracia' : dineroLocal(preview.costo)}
                        </span>
                      })()}
                    </div>
                    <div className="estancia-item-actions">
                      <button className="btn btn-outline" disabled={cortando === e.id} title="Detiene el tiempo ahora; la firma y el pago se completan después" onClick={() => cortarTiempo(e)}>
                        {cortando === e.id ? '…' : '⏱ Cortar tiempo'}
                      </button>
                      <button className="btn btn-primary" onClick={() => abrirRetiro(e)}>Dar salida</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {porCobrarVisibles.length > 0 && (
              <div className="estancia-porcobrar">
                <div className="estancia-porcobrar-title">⚠️ Estancia terminada · pendiente de cobro ({porCobrarVisibles.length})</div>
                <div className="estancia-active-list">
                  {porCobrarVisibles.map((e) => (
                    <div key={e.id} className="estancia-active-item estancia-alert-item">
                      <div className="estancia-alert-icon" aria-label="Pendiente de cobro">!</div>
                      <div className="estancia-item-main">
                        <strong>{e.alumnoNombre}</strong>
                        {infoAlumno(e) && <span>{infoAlumno(e)}</span>}
                        <span>{formatoHora(e.horaEntrada)} → {formatoHora(e.horaSalida)} · {minutosTexto(e.minutos)} · <strong>{dineroLocal(e.costo)}</strong></span>
                        <span className="estancia-alert-text">
                          {e.retiroPendiente ? 'Tiempo detenido. Falta firma de retiro y pago.' : 'La estancia terminó. Falta el pago.'}
                        </span>
                      </div>
                      <div className="estancia-item-actions">
                        {e.retiroPendiente ? (
                          <button className="btn btn-primary" onClick={() => abrirRetiro(e)}>Completar y cobrar</button>
                        ) : (
                          <button className="btn btn-primary" onClick={() => abrirPago(e)}>Pagar</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                  <div className={`estancia-daily-badge ${e.horaSalida ? (!e.pagado && !e.pendiente ? 'alert' : 'closed') : 'open'}`}>{e.horaSalida ? (!e.pagado && !e.pendiente ? '!' : '✓') : '→'}</div>
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
                            {e.ajusteAcuerdo ? '✓ Ajuste acuerdo' : `✓ Pagado${describirPago(e) ? ` · ${describirPago(e)}` : ''}`}
                          </span>
                        ) : e.retiroPendiente ? (
                          <button className="btn btn-primary btn-small" onClick={() => abrirRetiro(e)}>Completar</button>
                        ) : (
                          <>
                            {e.pendiente && <span className="status-pill status-pending">⏳ Cobro pendiente</span>}
                            <button className="btn btn-primary btn-small" disabled={guardandoPago === e.id} onClick={() => abrirPago(e)}>
                              {guardandoPago === e.id ? '…' : e.pendiente ? 'Cobrar' : 'Pagar'}
                            </button>
                          </>
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
              <div><h2 style={{ margin: 0 }}>{retirando.horaSalida ? 'Completar salida' : 'Dar salida'}</h2><span>{retirando.alumnoNombre}</span></div>
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
                      {resultado.ajusteAcuerdo ? '✓ Ajuste acuerdo registrado ($0.00)' : `✓ Pago registrado${describirPago(resultado) ? ` en ${describirPago(resultado)}` : ''} y enviado a Caja`}
                    </span>
                  ) : resultado.pendiente ? (
                    <span className="status-pill status-pending">⏳ Quedó como cobro pendiente</span>
                  ) : (
                    <button className="btn btn-primary" disabled={guardandoPago === resultado.estanciaId} onClick={() => abrirPago({ id: resultado.estanciaId, alumnoId: retirando.alumnoId, alumnoNombre: retirando.alumnoNombre, costo: resultado.costo, retiradoPor: nombreRetira.trim() })}>
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
                {retirando.horaSalida && (
                  <div className="drawer-summary" style={{ background: '#fef3c7' }}>
                    <span>Tiempo cortado a las {formatoHora(retirando.horaSalida)}</span>
                    <strong>{minutosTexto(retirando.minutos)} · {dineroLocal(retirando.costo)}</strong>
                  </div>
                )}
                <label className="field-label">Nombre de quién retira al alumno</label>
                <input className="input" value={nombreRetira} onChange={(e) => setNombreRetira(e.target.value)} />
                <label className="field-label" style={{ marginTop: '1rem' }}>Firma de enterado del padre/madre/tutor</label>
                <FirmaPad ref={firmaRef} onCambio={setFirmaLista} />
                <div className="drawer-actions">
                  <button className="btn btn-primary" disabled={cargando || !nombreRetira.trim()} onClick={confirmarRetiro}>
                    {cargando ? 'Guardando…' : retirando.horaSalida ? 'Confirmar retiro y cobrar' : 'Confirmar salida y cobro'}
                  </button>
                  <button className="btn btn-outline" disabled={cargando} onClick={() => setRetirando(null)}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {pagando && (
        <div className="estancia-drawer-backdrop pago-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarPago() }}>
          <div className="card pago-modal" role="dialog" aria-modal="true">
            <h3 style={{ marginTop: 0 }}>¿Cómo pagó?</h3>
            <p className="page-muted" style={{ marginTop: '-0.4rem' }}>{pagando.alumnoNombre}</p>

            {errorPago && <div className="form-error" style={{ padding: '0.5rem 0.7rem', marginBottom: '0.7rem', fontSize: '0.85rem' }}>⚠️ {errorPago}</div>}

            {cargandoPrevios ? (
              <p className="page-muted" style={{ fontSize: '0.85rem' }}>Revisando pendientes anteriores…</p>
            ) : (
              <div className="pago-conceptos">
                {pendientesPrevios.length > 0 && (
                  <p style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
                    ⏳ Este alumno tiene <strong>{pendientesPrevios.length}</strong> concepto(s) pendiente(s). Marca lo que se paga ahora:
                  </p>
                )}
                {conceptosPago.map((c) => (
                  <label key={c.id} className="pago-concepto">
                    <input
                      type="checkbox"
                      checked={Boolean(seleccion[c.id])}
                      disabled={Boolean(guardandoPago) || conceptosPago.length === 1}
                      onChange={(ev) => setSeleccion((sel) => ({ ...sel, [c.id]: ev.target.checked }))}
                    />
                    <span style={{ flex: 1 }}>
                      <strong>{c.id === pagando.id ? 'Estancia de hoy' : `Pendiente del ${formatoFecha(c.horaEntrada)}`}</strong>
                      <small style={{ display: 'block', color: 'var(--ink-muted)' }}>
                        {c.horaEntrada ? formatoHora(c.horaEntrada) : '—'} → {c.horaSalida ? formatoHora(c.horaSalida) : '—'} · {minutosTexto(c.minutos)}
                      </small>
                    </span>
                    <strong>{dineroLocal(c.costo)}</strong>
                  </label>
                ))}
                <div className="pago-total">
                  <span>{ajusteAcuerdo ? 'Total (ajuste acuerdo)' : 'Total a pagar'}</span>
                  <strong>{dineroLocal(ajusteAcuerdo ? 0 : totalElegido)}</strong>
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.2rem 0 0.9rem', fontWeight: 700 }}>
              <input type="checkbox" checked={ajusteAcuerdo} disabled={Boolean(guardandoPago)} onChange={(ev) => setAjusteAcuerdo(ev.target.checked)} />
              Ajuste acuerdo
            </label>

            {ajusteAcuerdo ? (
              <>
                <p style={{ fontSize: '0.85rem' }}>Importe: <strong>{dineroLocal(0)}</strong> (antes {dineroLocal(totalElegido)}). Queda en el historial; no pasa a acciones de Caja ni al corte.</p>
                <button type="button" className="btn btn-primary" disabled={Boolean(guardandoPago) || cargandoPrevios} onClick={() => ejecutarPago({ ajuste: true })}>
                  {guardandoPago ? 'Guardando…' : 'Aceptar'}
                </button>
              </>
            ) : (
              <>
                <div className="pago-opciones pago-opciones-3">
                  <button type="button" className="btn btn-primary pago-opcion" disabled={Boolean(guardandoPago) || cargandoPrevios} onClick={() => ejecutarPago({ metodoPago: 'efectivo' })}>
                    <span style={{ fontSize: '1.6rem' }}>💵</span>Efectivo
                  </button>
                  <button type="button" className={`btn pago-opcion ${metodoTarjeta ? 'btn-primary' : 'btn-outline'}`} disabled={Boolean(guardandoPago) || cargandoPrevios} onClick={() => { setMetodoTarjeta((v) => !v); setErrorPago('') }}>
                    <span style={{ fontSize: '1.6rem' }}>💳</span>Tarjeta
                  </button>
                  {!pagando.pendiente && (
                    <button type="button" className="btn btn-outline pago-opcion pago-opcion-pendiente" disabled={Boolean(guardandoPago) || cargandoPrevios} onClick={dejarPendiente}>
                      <span style={{ fontSize: '1.6rem' }}>⏳</span>Cobro pendiente
                    </button>
                  )}
                </div>

                {metodoTarjeta && (
                  <div className="pago-tarjeta">
                    <div className="pago-tipo-tarjeta">
                      {Object.values(TIPOS_TARJETA).map((t) => (
                        <button
                          key={t.clave}
                          type="button"
                          className={`btn ${tarjeta.tipo === t.clave ? 'btn-primary' : 'btn-outline'}`}
                          disabled={Boolean(guardandoPago)}
                          onClick={() => setTarjeta((x) => ({ ...x, tipo: t.clave }))}
                        >
                          {t.etiqueta}
                        </button>
                      ))}
                    </div>

                    {tarjeta.tipo && (
                      <div className="pago-tarjeta-form">
                        <label className="field-label">Banco</label>
                        <input className="input" value={tarjeta.banco} disabled={Boolean(guardandoPago)} placeholder="Ej. BBVA, Banorte, Santander…" onChange={(ev) => setTarjeta((x) => ({ ...x, banco: ev.target.value }))} />

                        <label className="field-label" style={{ marginTop: '0.6rem' }}>Últimos 4 dígitos</label>
                        <input className="input" inputMode="numeric" maxLength={4} value={tarjeta.ultimos4} disabled={Boolean(guardandoPago)} placeholder="0000" onChange={(ev) => setTarjeta((x) => ({ ...x, ultimos4: ev.target.value.replace(/\D/g, '').slice(0, 4) }))} />

                        <label className="field-label" style={{ marginTop: '0.6rem' }}>Titular de la tarjeta</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', marginBottom: '0.35rem', opacity: quienRecoge ? 1 : 0.55 }}>
                          <input type="checkbox" checked={titularIgual} disabled={!quienRecoge || Boolean(guardandoPago)} onChange={(ev) => elegirTitularIgual(ev.target.checked)} />
                          {quienRecoge ? <>Es la misma persona que recoge: <strong>{quienRecoge}</strong></> : 'Es la misma persona que recoge (aún no se captura quién recoge)'}
                        </label>
                        <input className="input" value={tarjeta.titular} disabled={titularIgual || Boolean(guardandoPago)} placeholder="Nombre como aparece en la tarjeta" onChange={(ev) => setTarjeta((x) => ({ ...x, titular: ev.target.value }))} />

                        <button type="button" className="btn btn-primary" style={{ marginTop: '0.9rem', width: '100%', justifyContent: 'center' }} disabled={Boolean(guardandoPago) || cargandoPrevios} onClick={() => ejecutarPago({ metodoPago: 'tarjeta' })}>
                          {guardandoPago ? 'Guardando…' : `Confirmar pago con tarjeta ${tarjeta.tipo === 'debito' ? 'de débito' : 'de crédito'} · ${dineroLocal(totalElegido)}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              {ajusteAcuerdo
                ? 'Para alumnos con acuerdo o que esperan su taller.'
                : 'Se refleja como pagado en Caja y queda pendiente en el corte de estancia. De la tarjeta solo se guardan banco, últimos 4 dígitos y titular. “Cobro pendiente” deja el concepto abierto para cobrarlo después.'}
            </p>
            <button className="btn btn-outline" disabled={Boolean(guardandoPago)} onClick={cerrarPago}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
