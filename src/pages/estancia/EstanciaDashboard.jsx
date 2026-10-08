import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  estanciasEntreFechas,
  estanciasPendientesHistoricas,
  pagarEstancias,
  validarTarjeta,
  TIPOS_TARJETA,
} from '../../lib/estancia'
import {
  listarAlumnosActivos,
  filtrarPorPlantel,
  puedeVerTodosLosPlanteles,
  sinPlantelAsignado,
  normalizar,
} from '../../lib/alumnos'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import { registrarLog } from '../../lib/log'
import { notificarTicketPago } from '../../lib/notificacionesAuto'

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`
const pad2 = (n) => String(n).padStart(2, '0')

function rangoInicial() {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return {
    desde: `${inicio.getFullYear()}-${pad2(inicio.getMonth() + 1)}-${pad2(inicio.getDate())}`,
    hasta: `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-${pad2(hoy.getDate())}`,
  }
}

function agruparPorAlumno(lista) {
  const mapa = new Map()
  lista.forEach((e) => {
    const key = e.alumnoId || e.alumnoNombre
    if (!mapa.has(key)) {
      mapa.set(key, {
        alumnoId: e.alumnoId,
        alumnoNombre: e.alumnoNombre || 'Sin nombre',
        alumnoPlantel: e.alumnoPlantel || '',
        alumnoGrupo: e.alumnoGrupo || '',
        registros: [],
        total: 0,
      })
    }
    const g = mapa.get(key)
    g.registros.push(e)
    g.total += Number(e.costo || 0)
  })
  return Array.from(mapa.values()).sort((a, b) =>
    a.alumnoNombre.localeCompare(b.alumnoNombre, 'es')
  )
}

function estadoPendientes(cantidad) {
  if (cantidad > 3) return 'danger'
  return 'warning'
}

export default function EstanciaDashboard({ soloPendientes = false }) {
  const { user } = useAuth()
  const [rango, setRango] = useState(rangoInicial)
  const [registros, setRegistros] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [moduloAbierto, setModuloAbierto] = useState(null)
  const [alumnoPendienteAbierto, setAlumnoPendienteAbierto] = useState(null)
  const [pagando, setPagando] = useState(null)
  const [metodoTarjeta, setMetodoTarjeta] = useState(false)
  const [tarjeta, setTarjeta] = useState({ tipo: '', banco: '', ultimos4: '', titular: '' })
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [errorPago, setErrorPago] = useState('')
  const [aviso, setAviso] = useState('')

  const verTodos = puedeVerTodosLosPlanteles(user)

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      // No hacemos que una consulta de estancias bloquee el contador de alumnos.
      // Así, si Firestore tiene un índice pendiente o una consulta histórica falla,
      // el Dashboard sigue mostrando los alumnos que sí pudo leer.
      const resultados = await Promise.allSettled([
        estanciasEntreFechas(rango.desde, rango.hasta),
        estanciasPendientesHistoricas(),
        listarAlumnosActivos(),
      ])

      const [resRegistros, resPendientes, resAlumnos] = resultados
      const r = resRegistros.status === 'fulfilled' ? resRegistros.value : []
      const p = resPendientes.status === 'fulfilled' ? resPendientes.value : []
      const a = resAlumnos.status === 'fulfilled' ? resAlumnos.value : []

      const fallos = resultados
        .filter((x) => x.status === 'rejected')
        .map((x) => x.reason?.message || String(x.reason || 'Error desconocido'))

      if (fallos.length) {
        console.warn('Dashboard de estancia: algunas consultas fallaron:', fallos)
        setError(`Se cargó el dashboard parcialmente. ${fallos[0]}`)
      }

      const alumnosVisibles = filtrarPorPlantel(a, user)
      const idsVisibles = new Set(alumnosVisibles.map((x) => x.id))
      const plantelUsuario = normalizar(user?.plantel)
      const visibles = (lista) => verTodos
        ? lista
        : lista.filter((e) =>
            idsVisibles.has(e.alumnoId) ||
            (plantelUsuario && normalizar(e.alumnoPlantel) === plantelUsuario)
          )
      setRegistros(visibles(r))
      setPendientes(visibles(p))
      setAlumnos(alumnosVisibles)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar el dashboard de estancia.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [rango.desde, rango.hasta, user?.uid, user?.plantel])

  const usados = useMemo(() => agruparPorAlumno(registros.filter((e) => e.horaSalida || e.horaEntrada)), [registros])
  const cobrados = useMemo(() => agruparPorAlumno(registros.filter((e) => e.pagado && !e.ajusteAcuerdo)), [registros])
  const pendientesRango = useMemo(() => agruparPorAlumno(registros.filter((e) => e.pendiente && !e.pagado)), [registros])
  const historicoAgrupado = useMemo(() => agruparPorAlumno(pendientes), [pendientes])

  const totalCobrado = registros.filter((e) => e.pagado && !e.ajusteAcuerdo).reduce((t, e) => t + Number(e.costo || 0), 0)
  const totalPendienteRango = registros.filter((e) => e.pendiente && !e.pagado).reduce((t, e) => t + Number(e.costo || 0), 0)
  const totalPendienteHistorico = pendientes.reduce((t, e) => t + Number(e.costo || 0), 0)

  const detalle = {
    alumnos: alumnos,
    usados,
    cobrados,
    pendientes: pendientesRango,
  }

  function abrirPago(grupo) {
    setPagando(grupo)
    setMetodoTarjeta(false)
    setTarjeta({ tipo: '', banco: '', ultimos4: '', titular: '' })
    setErrorPago('')
  }

  async function confirmarPago(metodoPago) {
    if (!pagando || guardandoPago) return
    if (metodoPago === 'tarjeta') {
      const err = validarTarjeta(tarjeta)
      if (err) {
        setErrorPago(err)
        return
      }
    }

    setGuardandoPago(true)
    setErrorPago('')
    try {
      const datosTarjeta = metodoPago === 'tarjeta' ? { ...tarjeta } : null
      const res = await pagarEstancias({
        estanciaIds: pagando.registros.map((e) => e.id),
        usuario: user?.email || user?.uid || 'usuario',
        metodoPago,
        tarjeta: datosTarjeta,
      })
      registrarLog({
        user,
        accion: 'estancia.pago_historico',
        modulo: 'estancia',
        entidad: 'estancias',
        entidadId: pagando.registros[0]?.id,
        alumno: { id: pagando.alumnoId, nombre: pagando.alumnoNombre },
        detalle: {
          metodoPago,
          conceptos: res.pagados.map((p) => p.id),
          importe: res.pagados.reduce((t, p) => t + p.costo, 0),
          historicoPendientes: true,
        },
      })
      setPagando(null)
      setAviso(`Pago registrado para ${pagando.alumnoNombre}: ${dinero(res.pagados.reduce((t, p) => t + p.costo, 0))}.`)
      notificarTicketPago({
        estanciaIds: res.pagados.map((p) => p.id),
        alumno: {
          id: pagando.alumnoId,
          nombre: pagando.alumnoNombre,
          plantel: pagando.alumnoPlantel,
        },
        user,
      }).catch(() => {})
      await cargar()
    } catch (err) {
      console.error(err)
      setErrorPago(err?.message || 'No fue posible registrar el pago.')
    } finally {
      setGuardandoPago(false)
    }
  }

  if (sinPlantelAsignado(user)) {
    return (
      <div className="card" style={{ padding: '1.25rem' }}>
        <strong>⚠️ Falta asignar plantel</strong>
        <p className="page-muted" style={{ marginBottom: 0 }}>
          Este dashboard necesita un plantel para limitar la información. Pide al administrador que asigne el plantel de tu cuenta.
        </p>
      </div>
    )
  }

  if (soloPendientes) {
    return (
      <div className="estancia-dashboard">
        <div className="estancia-dashboard-heading">
          <div>
            <h2>🔔 Pendientes históricos</h2>
            <p>Todos los cobros pendientes, sin límite de fecha, agrupados por alumno.</p>
          </div>
          <button className="btn btn-outline btn-small" onClick={cargar} disabled={cargando}>↻ Actualizar</button>
        </div>
        {error && <div className="card form-error" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}
        {aviso && <div className="estancia-dashboard-success">{aviso}</div>}
        <PendientesHistoricos
          grupos={historicoAgrupado}
          totalRegistros={pendientes.length}
          totalMonto={totalPendienteHistorico}
          abierto={alumnoPendienteAbierto}
          setAbierto={setAlumnoPendienteAbierto}
          onCobrar={abrirPago}
        />
        {pagando && (
          <PagoHistoricoModal
            grupo={pagando}
            tarjeta={tarjeta}
            setTarjeta={setTarjeta}
            metodoTarjeta={metodoTarjeta}
            setMetodoTarjeta={setMetodoTarjeta}
            guardando={guardandoPago}
            error={errorPago}
            onEfectivo={() => confirmarPago('efectivo')}
            onTarjeta={() => confirmarPago('tarjeta')}
            onCerrar={() => { if (!guardandoPago) setPagando(null) }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="estancia-dashboard">
      <div className="estancia-dashboard-heading">
        <div>
          <h2>📊 Dashboard de estancia</h2>
          <p>Resumen de alumnos, uso y cobranza. El histórico de pendientes no depende del filtro de fechas.</p>
        </div>
        <button className="btn btn-outline btn-small" onClick={cargar} disabled={cargando}>↻ Actualizar</button>
      </div>

      {error && <div className="card form-error" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}
      {aviso && <div className="estancia-dashboard-success">{aviso}</div>}

      <div className="estancia-dashboard-filtros card">
        <div>
          <label className="field-label">Desde</label>
          <input className="input" type="date" value={rango.desde} max={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
        </div>
        <div>
          <label className="field-label">Hasta</label>
          <input className="input" type="date" value={rango.hasta} min={rango.desde} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
        </div>
        <div className="estancia-dashboard-filtro-info">
          <span>Periodo consultado</span>
          <strong>{formatoFecha(new Date(`${rango.desde}T12:00:00`))} — {formatoFecha(new Date(`${rango.hasta}T12:00:00`))}</strong>
        </div>
      </div>

      <div className="estancia-dashboard-kpis">
        <Kpi
          icon="👥"
          label="Alumnos totales"
          value={alumnos.length}
          detail="Alumnos activos del plantel"
          active={moduloAbierto === 'alumnos'}
          onClick={() => setModuloAbierto(moduloAbierto === 'alumnos' ? null : 'alumnos')}
        />
        <Kpi
          icon="🏫"
          label="Usaron estancia"
          value={usados.length}
          detail={`${registros.length} uso(s) en el periodo`}
          active={moduloAbierto === 'usados'}
          onClick={() => setModuloAbierto(moduloAbierto === 'usados' ? null : 'usados')}
        />
        <Kpi
          icon="✓"
          label="Ya se cobraron"
          value={cobrados.length}
          detail={dinero(totalCobrado)}
          active={moduloAbierto === 'cobrados'}
          onClick={() => setModuloAbierto(moduloAbierto === 'cobrados' ? null : 'cobrados')}
        />
        <Kpi
          icon="⚠️"
          label="Pendientes"
          value={pendientesRango.length}
          detail={dinero(totalPendienteRango)}
          active={moduloAbierto === 'pendientes'}
          onClick={() => setModuloAbierto(moduloAbierto === 'pendientes' ? null : 'pendientes')}
          danger={pendientesRango.length > 0}
        />
      </div>

      {moduloAbierto && (
        <DetalleModulo
          titulo={{
            alumnos: 'Alumnos activos',
            usados: 'Alumnos que usaron estancia',
            cobrados: 'Alumnos con cobro registrado',
            pendientes: 'Alumnos con pendientes en el periodo',
          }[moduloAbierto]}
          lista={detalle[moduloAbierto]}
          tipo={moduloAbierto}
        />
      )}

      <PendientesHistoricos
        grupos={historicoAgrupado}
        totalRegistros={pendientes.length}
        totalMonto={totalPendienteHistorico}
        abierto={alumnoPendienteAbierto}
        setAbierto={setAlumnoPendienteAbierto}
        onCobrar={abrirPago}
      />

      {pagando && (
        <PagoHistoricoModal
          grupo={pagando}
          tarjeta={tarjeta}
          setTarjeta={setTarjeta}
          metodoTarjeta={metodoTarjeta}
          setMetodoTarjeta={setMetodoTarjeta}
          guardando={guardandoPago}
          error={errorPago}
          onEfectivo={() => confirmarPago('efectivo')}
          onTarjeta={() => confirmarPago('tarjeta')}
          onCerrar={() => { if (!guardandoPago) setPagando(null) }}
        />
      )}
    </div>
  )
}

function Kpi({ icon, label, value, detail, active, onClick, danger = false }) {
  return (
    <button type="button" className={`estancia-dashboard-kpi${active ? ' active' : ''}${danger ? ' danger' : ''}`} onClick={onClick}>
      <span className="estancia-dashboard-kpi-icon">{icon}</span>
      <span className="estancia-dashboard-kpi-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
      <span className="estancia-dashboard-kpi-open">{active ? 'Ocultar' : 'Ver detalle'}</span>
    </button>
  )
}

function DetalleModulo({ titulo, lista, tipo }) {
  const grupos = tipo === 'alumnos'
    ? lista.map((a) => ({
        alumnoId: a.id,
        alumnoNombre: a.nombre,
        alumnoPlantel: a.plantel,
        alumnoGrupo: [a.nivel, a.grado, a.grupo].filter(Boolean).join(' · '),
        registros: [],
        total: 0,
      }))
    : lista

  return (
    <section className="card estancia-dashboard-detalle">
      <div className="estancia-dashboard-section-head">
        <div><h3>{titulo}</h3><span>{grupos.length} alumno(s)</span></div>
      </div>
      {grupos.length === 0 ? (
        <div className="empty-state">No hay información para este módulo en el periodo seleccionado.</div>
      ) : (
        <div className="estancia-dashboard-detail-grid">
          {grupos.map((g) => (
            <div key={g.alumnoId} className="estancia-dashboard-detail-item">
              <div>
                <strong>{g.alumnoNombre}</strong>
                <small>{[g.alumnoPlantel, g.alumnoGrupo].filter(Boolean).join(' · ')}</small>
                {g.registros.length > 0 && <small>{g.registros.length} uso(s) · {dinero(g.total)}</small>}
              </div>
              {tipo === 'pendientes' && <span className="status-pill status-pending">Pendiente</span>}
              {tipo === 'cobrados' && <span className="status-pill status-paid">✓ Cobrado</span>}
              {tipo === 'usados' && <span className="status-pill">🏫 {g.registros.length}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PendientesHistoricos({ grupos, totalRegistros, totalMonto, abierto, setAbierto, onCobrar }) {
  return (
    <section className="estancia-dashboard-historico card">
      <div className="estancia-dashboard-section-head">
        <div>
          <h3>🔔 Histórico de pendientes</h3>
          <span>Todos los pendientes abiertos, agrupados por alumno · {grupos.length} alumno(s) · {totalRegistros} registro(s) · {dinero(totalMonto)}</span>
        </div>
        <span className="estancia-dashboard-fixed">SIN FILTRO DE FECHAS</span>
      </div>

      {grupos.length === 0 ? (
        <div className="empty-state">🎉 No hay estancias pendientes de cobro.</div>
      ) : (
        <div className="estancia-pendientes-list">
          {grupos.map((grupo) => {
            const estaAbierto = abierto === grupo.alumnoId
            const estado = estadoPendientes(grupo.registros.length)
            return (
              <div key={grupo.alumnoId} className={`estancia-pendiente-grupo ${estado}`}>
                <button className="estancia-pendiente-header" onClick={() => setAbierto(estaAbierto ? null : grupo.alumnoId)}>
                  <span className={`estancia-pendiente-badge ${estado}`}>{grupo.registros.length}</span>
                  <span className="estancia-pendiente-main">
                    <strong>{grupo.alumnoNombre}</strong>
                    <small>{[grupo.alumnoPlantel, grupo.alumnoGrupo].filter(Boolean).join(' · ') || 'Sin datos de plantel/grupo'}</small>
                    <small>{grupo.registros.length === 1 ? '1 pendiente' : `${grupo.registros.length} pendientes`} · {dinero(grupo.total)}</small>
                  </span>
                  <span className="estancia-pendiente-state">{estado === 'danger' ? '🚨 Cobranza prioritaria' : '⚠️ Cobranza pendiente'}</span>
                  <span className="estancia-pendiente-caret">{estaAbierto ? '▴' : '▾'}</span>
                </button>

                {estaAbierto && (
                  <div className="estancia-pendiente-detail">
                    {grupo.registros.map((e) => (
                      <div key={e.id} className="estancia-pendiente-row">
                        <div>
                          <strong>{formatoFecha(e.horaEntrada)}</strong>
                          <span>{e.horaEntrada ? formatoHora(e.horaEntrada) : '—'} → {e.horaSalida ? formatoHora(e.horaSalida) : '—'} · {Number(e.minutos || 0)} min</span>
                        </div>
                        <strong>{dinero(e.costo)}</strong>
                      </div>
                    ))}
                    <div className="estancia-pendiente-total">
                      <span>Total pendiente</span>
                      <strong>{dinero(grupo.total)}</strong>
                    </div>
                    <button className="btn btn-primary estancia-cobrar-todo" onClick={() => onCobrar(grupo)}>
                      💳 Cobrar {dinero(grupo.total)} · todas las pendientes
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PagoHistoricoModal({
  grupo,
  tarjeta,
  setTarjeta,
  metodoTarjeta,
  setMetodoTarjeta,
  guardando,
  error,
  onEfectivo,
  onTarjeta,
  onCerrar,
}) {
  const total = grupo.total
  return (
    <div className="estancia-drawer-backdrop pago-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card pago-modal" role="dialog" aria-modal="true">
        <h3 style={{ marginTop: 0 }}>Cobrar pendientes</h3>
        <p className="page-muted" style={{ marginTop: '-.4rem' }}>{grupo.alumnoNombre}</p>

        {error && <div className="form-error" style={{ padding: '.5rem .7rem', marginBottom: '.7rem', fontSize: '.85rem' }}>⚠️ {error}</div>}

        <div className="pago-conceptos">
          {grupo.registros.map((e) => (
            <div key={e.id} className="pago-concepto">
              <span style={{ flex: 1 }}>
                <strong>{formatoFecha(e.horaEntrada)}</strong>
                <small style={{ display: 'block', color: 'var(--ink-muted)' }}>
                  {e.horaEntrada ? formatoHora(e.horaEntrada) : '—'} → {e.horaSalida ? formatoHora(e.horaSalida) : '—'}
                </small>
              </span>
              <strong>{dinero(e.costo)}</strong>
            </div>
          ))}
          <div className="pago-total"><span>Total a pagar</span><strong>{dinero(total)}</strong></div>
        </div>

        <div className="pago-opciones pago-opciones-3">
          <button type="button" className="btn btn-primary pago-opcion" disabled={guardando} onClick={onEfectivo}>
            <span style={{ fontSize: '1.6rem' }}>💵</span>Efectivo
          </button>
          <button type="button" className={`btn pago-opcion ${metodoTarjeta ? 'btn-primary' : 'btn-outline'}`} disabled={guardando} onClick={() => setMetodoTarjeta((v) => !v)}>
            <span style={{ fontSize: '1.6rem' }}>💳</span>Tarjeta
          </button>
        </div>

        {metodoTarjeta && (
          <div className="pago-tarjeta">
            <div className="pago-tipo-tarjeta">
              {Object.values(TIPOS_TARJETA).map((t) => (
                <button key={t.clave} type="button" className={`btn ${tarjeta.tipo === t.clave ? 'btn-primary' : 'btn-outline'}`} disabled={guardando} onClick={() => setTarjeta((x) => ({ ...x, tipo: t.clave }))}>
                  {t.etiqueta}
                </button>
              ))}
            </div>
            {tarjeta.tipo && (
              <div className="pago-tarjeta-form">
                <label className="field-label">Banco</label>
                <input className="input" value={tarjeta.banco} disabled={guardando} placeholder="Ej. BBVA, Banorte, Santander…" onChange={(e) => setTarjeta((x) => ({ ...x, banco: e.target.value }))} />
                <label className="field-label" style={{ marginTop: '.6rem' }}>Últimos 4 dígitos</label>
                <input className="input" inputMode="numeric" maxLength={4} value={tarjeta.ultimos4} disabled={guardando} placeholder="0000" onChange={(e) => setTarjeta((x) => ({ ...x, ultimos4: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                <label className="field-label" style={{ marginTop: '.6rem' }}>Titular</label>
                <input className="input" value={tarjeta.titular} disabled={guardando} placeholder="Nombre como aparece en la tarjeta" onChange={(e) => setTarjeta((x) => ({ ...x, titular: e.target.value }))} />
                <button type="button" className="btn btn-primary" style={{ marginTop: '.9rem', width: '100%', justifyContent: 'center' }} disabled={guardando} onClick={onTarjeta}>
                  {guardando ? 'Guardando…' : `Confirmar tarjeta · ${dinero(total)}`}
                </button>
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: '.78rem', color: 'var(--ink-muted)' }}>
          Se marcarán como pagadas todas las estancias pendientes de este alumno y desaparecerán del histórico de pendientes.
        </p>
        <button className="btn btn-outline" disabled={guardando} onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}
