import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos } from '../../lib/alumnos'
import { obtenerConfigComedor } from '../../lib/pricingComedor'
import { marcarDetalleCobro } from '../../lib/cobros'
import { db } from '../../firebase'
import { formatoFecha, formatoHora } from '../../lib/fechas'

const dinero = (n) => `$${Number(n || 0).toFixed(2)} MXN`

function inicioDelDia(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function finDelDia(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function fechaInput(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseInputDate(value, end = false) {
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return end ? finDelDia(date) : inicioDelDia(date)
}

function contarDiasHabiles(inicio, fin) {
  let total = 0
  const d = inicioDelDia(inicio)
  const ultimo = inicioDelDia(fin)
  while (d <= ultimo) {
    const dia = d.getDay()
    if (dia !== 0 && dia !== 6) total += 1
    d.setDate(d.getDate() + 1)
  }
  return total
}

function solapaRango(plan, inicio, fin) {
  const a = plan.fechaInicio?.toDate ? plan.fechaInicio.toDate() : new Date(plan.fechaInicio)
  const b = plan.fechaFin?.toDate ? plan.fechaFin.toDate() : new Date(plan.fechaFin)
  return a <= fin && b >= inicio
}

async function cargarConsumosRango(inicio, fin) {
  const q = query(
    collection(db, 'consumos'),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    fecha: d.data().fecha?.toDate ? d.data().fecha.toDate() : null,
  }))
}

async function cargarEstanciasRango(inicio, fin) {
  const q = query(
    collection(db, 'estancias'),
    where('horaEntrada', '>=', Timestamp.fromDate(inicio)),
    where('horaEntrada', '<=', Timestamp.fromDate(fin)),
    orderBy('horaEntrada', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    horaEntrada: d.data().horaEntrada?.toDate ? d.data().horaEntrada.toDate() : null,
    horaSalida: d.data().horaSalida?.toDate ? d.data().horaSalida.toDate() : null,
  }))
}

async function cargarPlanesAlumno(alumnoId) {
  const q = query(collection(db, 'planes_comedor'), where('alumnoId', '==', alumnoId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export default function Caja() {
  const { user } = useAuth()
  const hoy = new Date()
  const [fechaDesde, setFechaDesde] = useState(fechaInput(inicioDelDia(hoy)))
  const [fechaHasta, setFechaHasta] = useState(fechaInput(finDelDia(hoy)))
  const [alumnos, setAlumnos] = useState([])
  const [consumos, setConsumos] = useState([])
  const [estancias, setEstancias] = useState([])
  const [configComedor, setConfigComedor] = useState(null)
  const [planes, setPlanes] = useState([])
  const [texto, setTexto] = useState('')
  const [expandirRegistro, setExpandirRegistro] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [modulo, setModulo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState('')
  const [error, setError] = useState('')
  const [mostrarMensualidad, setMostrarMensualidad] = useState(false)
  const [formMensualidad, setFormMensualidad] = useState({ tipo: 'desayuno', desde: fechaInput(hoy), hasta: fechaInput(hoy), monto: '' })

  const inicio = useMemo(() => parseInputDate(fechaDesde, false), [fechaDesde])
  const fin = useMemo(() => parseInputDate(fechaHasta, true), [fechaHasta])

  async function cargar() {
    if (inicio > fin) {
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }
    setCargando(true)
    setError('')
    try {
      const [a, c, e, cfg] = await Promise.all([
        listarAlumnosActivos(),
        cargarConsumosRango(inicio, fin),
        cargarEstanciasRango(inicio, fin),
        obtenerConfigComedor(),
      ])
      setAlumnos(a)
      setConsumos(c)
      setEstancias(e.filter((x) => x.horaSalida))
      setConfigComedor(cfg)
      if (seleccionadoId) {
        const p = await cargarPlanesAlumno(seleccionadoId)
        setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
      }
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar la información de Caja.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [fechaDesde, fechaHasta])

  const actividad = useMemo(() => {
    const mapa = new Map(alumnos.map((a) => [a.id, { ...a, cafeteria: [], estancia: [] }]))
    consumos.forEach((c) => mapa.get(c.alumnoId)?.cafeteria.push(c))
    estancias.forEach((e) => mapa.get(e.alumnoId)?.estancia.push(e))
    return Array.from(mapa.values())
  }, [alumnos, consumos, estancias])

  const alumnosEnRegistro = actividad.filter((a) => a.cafeteria.length || a.estancia.length)
  const filtrados = alumnosEnRegistro.filter((a) => {
    const t = texto.trim().toLowerCase()
    return !t || a.nombre?.toLowerCase().includes(t) || a.matricula?.toLowerCase().includes(t) || a.grupo?.toLowerCase().includes(t)
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  async function seleccionar(a) {
    setSeleccionadoId(a.id)
    setModulo(null)
    setMostrarMensualidad(false)
    setError('')
    try {
      const p = await cargarPlanesAlumno(a.id)
      setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar las mensualidades del alumno.')
      setPlanes([])
    }
  }

  const seleccionado = actividad.find((a) => a.id === seleccionadoId) || null
  const cafeteriaSeleccionada = seleccionado?.cafeteria || []
  const estanciaSeleccionada = seleccionado?.estancia || []

  const planesDesayuno = planes.filter((p) => p.tipo === 'desayuno' && p.activo !== false)
  const planesComida = planes.filter((p) => p.tipo === 'comida' && p.activo !== false)
  const planDesayunoActivo = planesDesayuno.some((p) => p.activo !== false)
  const planComidaActivo = planesComida.some((p) => p.activo !== false)
  const planDesayunoPagado = planesDesayuno.some((p) => p.pagado === true)
  const planComidaPagado = planesComida.some((p) => p.pagado === true)

  function estaCubiertoPorMensualidad(consumo) {
    return consumo.tipo === 'desayuno' ? planDesayunoActivo : planComidaActivo
  }

  const costoConsumo = (c) => Number(c.costo) || (c.tipo === 'desayuno' ? Number(configComedor?.precioDesayuno || 0) : Number(configComedor?.precioComida || 0))

  const consumosIndividuales = cafeteriaSeleccionada.filter((c) => !estaCubiertoPorMensualidad(c))
  const totalIndividualComedor = consumosIndividuales.reduce((s, c) => s + costoConsumo(c), 0)
  const totalMensualidades = [...planesDesayuno, ...planesComida].reduce((s, p) => s + Number(p.monto || 0), 0)
  const totalEstancia = estanciaSeleccionada.reduce((s, e) => s + (Number(e.costo) || 0), 0)
  const totalCafeteria = totalIndividualComedor + totalMensualidades
  const totalEsperado = totalCafeteria + totalEstancia

  const cargadoIndividual = consumosIndividuales.filter((c) => c.cargado).reduce((s, c) => s + costoConsumo(c), 0) + estanciaSeleccionada.filter((e) => e.cargado).reduce((s, e) => s + Number(e.costo || 0), 0)
  const pagadoIndividual = consumosIndividuales.filter((c) => c.pagado).reduce((s, c) => s + costoConsumo(c), 0) + estanciaSeleccionada.filter((e) => e.pagado).reduce((s, e) => s + Number(e.costo || 0), 0)
  const cargadoMensual = [...planesDesayuno, ...planesComida].filter((p) => p.cargado).reduce((s, p) => s + Number(p.monto || 0), 0)
  const pagadoMensual = [...planesDesayuno, ...planesComida].filter((p) => p.pagado).reduce((s, p) => s + Number(p.monto || 0), 0)
  const totalCargado = cargadoIndividual + cargadoMensual
  const totalPagado = pagadoIndividual + pagadoMensual

  async function cambiarEstado(coleccion, id, campo, valor) {
    const key = `${coleccion}-${id}-${campo}`
    setGuardando(key)
    try {
      if (campo === 'pagado' && !valor) {
        // Permitir revertir el pago solo a quien tenga permisos en las reglas.
      }
      await marcarDetalleCobro({ coleccion, id, campo, valor, usuario: user?.email || user?.uid || 'usuario' })
      const aplicar = (lista) => lista.map((x) => x.id === id ? { ...x, [campo]: valor } : x)
      if (coleccion === 'consumos') setConsumos(aplicar)
      else if (coleccion === 'estancias') setEstancias(aplicar)
      else setPlanes(aplicar)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible actualizar el estado de cobro.')
    } finally {
      setGuardando('')
    }
  }

  async function crearMensualidad(e) {
    e.preventDefault()
    if (!seleccionado) return
    const desde = parseInputDate(formMensualidad.desde, false)
    const hasta = parseInputDate(formMensualidad.hasta, true)
    if (desde > hasta) return setError('La fecha inicial de la mensualidad no puede ser posterior a la final.')
    const diasHabiles = contarDiasHabiles(desde, hasta)
    const monto = Number(formMensualidad.monto)
    if (!Number.isFinite(monto) || monto <= 0) return setError('Captura un monto mensual válido.')

    setGuardando('nueva-mensualidad')
    setError('')
    try {
      const existentes = await cargarPlanesAlumno(seleccionado.id)
      const existeSolapado = existentes.some((p) => {
        if (p.tipo !== formMensualidad.tipo || p.activo === false) return false
        return solapaRango(p, desde, hasta)
      })
      if (existeSolapado) throw new Error(`Ya existe una mensualidad activa de ${formMensualidad.tipo} que se cruza con ese periodo.`)

      await addDoc(collection(db, 'planes_comedor'), {
        alumnoId: seleccionado.id,
        alumnoNombre: seleccionado.nombre,
        tipo: formMensualidad.tipo,
        fechaInicio: Timestamp.fromDate(desde),
        fechaFin: Timestamp.fromDate(hasta),
        diasHabiles,
        monto,
        serviciosUtilizados: 0,
        activo: true,
        cargado: true,
        pagado: false,
        creadoPor: user?.email || user?.uid || 'usuario',
        creadoEn: serverTimestamp(),
      })
      const p = await cargarPlanesAlumno(seleccionado.id)
      setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
      setMostrarMensualidad(false)
      setFormMensualidad({ tipo: 'desayuno', desde: fechaInput(inicio), hasta: fechaInput(fin), monto: '' })
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible crear la mensualidad.')
    } finally {
      setGuardando('')
    }
  }

  async function cambiarEstadoMensualidad(id, campo, valor) {
    const key = `planes_comedor-${id}-${campo}`
    setGuardando(key)
    setError('')
    try {
      await updateDoc(doc(db, 'planes_comedor', id), {
        [campo]: Boolean(valor),
        [`${campo}Por`]: user?.email || user?.uid || 'usuario',
        [`fecha${campo[0].toUpperCase()}${campo.slice(1)}`]: serverTimestamp(),
      })
      setPlanes((lista) => lista.map((p) => p.id === id ? { ...p, [campo]: Boolean(valor) } : p))
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible actualizar la mensualidad.')
    } finally {
      setGuardando('')
    }
  }

  if (cargando) return <p style={{ color: 'var(--ink-muted)' }}>Cargando registro de alumnos…</p>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>💳 Caja</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>Consulta, carga y pago de servicios por cualquier periodo.</p>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: '0.8rem', flexWrap: 'wrap' }}>
          <CampoFecha label="Desde" value={fechaDesde} onChange={setFechaDesde} />
          <CampoFecha label="Hasta" value={fechaHasta} onChange={setFechaHasta} />
          <button className="btn btn-outline" onClick={() => { const d = new Date(); setFechaDesde(fechaInput(d)); setFechaHasta(fechaInput(d)) }}>Hoy</button>
          <button className="btn btn-outline" onClick={() => { const d = new Date(); const day = d.getDay() || 7; const monday = new Date(d); monday.setDate(d.getDate() - day + 1); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); setFechaDesde(fechaInput(monday)); setFechaHasta(fechaInput(sunday)) }}>Esta semana</button>
          <button className="btn btn-primary" onClick={cargar}>Consultar periodo</button>
        </div>
        <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
          Este filtro permite consultar y trabajar cargos/pagos de días o semanas anteriores sin perder el histórico.
        </div>
      </div>

      {error && <div className="card" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', border: '1px solid #ef4444', color: '#b91c1c' }}>⚠️ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.7rem', marginBottom: '1.25rem' }}>
        <Kpi titulo="Alumnos" valor={alumnos.length} />
        <Kpi titulo="Con comedor" valor={actividad.filter(a => a.cafeteria.length).length} />
        <Kpi titulo="Con estancia" valor={actividad.filter(a => a.estancia.length).length} />
        <Kpi titulo="Esperado" valor={dinero(totalEsperado)} />
        <Kpi titulo="Cargado" valor={dinero(totalCargado)} />
        <Kpi titulo="Pagado" valor={dinero(totalPagado)} />
      </div>

      <button className="card" onClick={() => setExpandirRegistro(v => !v)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', padding: '1rem', marginBottom: expandirRegistro ? '0.7rem' : '1.25rem' }}>
        <div style={{ fontSize: '1.55rem', fontWeight: 800 }}>{alumnosEnRegistro.length}</div>
        <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>Alumnos en registro {expandirRegistro ? '▲' : '▼'}</div>
      </button>

      {expandirRegistro && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <div><strong>Alumnos en registro</strong><div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Selecciona un alumno para trabajar su detalle financiero.</div></div>
            <input className="input" placeholder="Buscar alumno, matrícula o grupo…" value={texto} onChange={e => setTexto(e.target.value)} style={{ maxWidth: 340 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--ink-muted)', fontSize: '0.78rem' }}><th>Alumno</th><th>Grupo</th><th>Comedor</th><th>Estancia</th><th>Total estimado</th></tr></thead>
              <tbody>
                {filtrados.map(a => {
                  const selected = a.id === seleccionadoId
                  const tc = a.cafeteria.reduce((s, c) => s + costoConsumoLocal(c, configComedor), 0)
                  const te = a.estancia.reduce((s, e) => s + (Number(e.costo) || 0), 0)
                  return <tr key={a.id} onClick={() => seleccionar(a)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--surface-sunken)' : 'transparent', outline: selected ? '2px solid var(--red-600)' : 'none', outlineOffset: '-2px' }}>
                    <td style={{ padding: '0.7rem 0.4rem' }}><strong>{selected ? '▶ ' : ''}{a.nombre}</strong><div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{a.matricula}</div></td>
                    <td>{a.grado} {a.grupo}</td><td>🍽️ {a.cafeteria.length}</td><td>🏫 {a.estancia.length}</td><td><strong>{dinero(tc + te)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {seleccionado && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0 }}>{seleccionado.nombre}</h2><span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{seleccionado.grado} {seleccionado.grupo} · {seleccionado.matricula} · {seleccionado.correoAlumno || 'sin correo alumno'}</span></div>
            <button className="btn btn-outline" onClick={() => { setSeleccionadoId(null); setPlanes([]) }}>Cerrar</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
            <Modulo titulo="🍽️ Comedor" total={totalCafeteria} activo={modulo === 'comedor'} onClick={() => setModulo(modulo === 'comedor' ? null : 'comedor')} detalle={`${cafeteriaSeleccionada.length} consumo(s)`}/>
            <Modulo titulo="🏫 Estancia" total={totalEstancia} activo={modulo === 'estancia'} onClick={() => setModulo(modulo === 'estancia' ? null : 'estancia')} detalle={`${estanciaSeleccionada.length} registro(s)`}/>
          </div>

          <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.7rem' }}>
            <Mini titulo="Esperado" valor={dinero(totalEsperado)} />
            <Mini titulo="Cargado" valor={dinero(totalCargado)} />
            <Mini titulo="Pagado" valor={dinero(totalPagado)} />
            <Mini titulo="Pendiente" valor={dinero(Math.max(totalEsperado - totalPagado, 0))} />
          </div>

          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div><strong>🍽️ Mensualidades de comedor</strong><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>Desayuno y comida son conceptos independientes.</div></div>
              <button className="btn btn-outline" onClick={() => setMostrarMensualidad(v => !v)}>+ {mostrarMensualidad ? 'Cerrar' : 'Registrar mensualidad'}</button>
            </div>

            {[...planesDesayuno, ...planesComida].map(plan => <PlanMensual key={plan.id} plan={plan} consumos={cafeteriaSeleccionada} cambiarEstado={cambiarEstadoMensualidad} guardando={guardando} />)}

            {mostrarMensualidad && <form onSubmit={crearMensualidad} className="card" style={{ marginTop: '0.8rem', padding: '1rem', background: 'var(--surface-sunken)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.7rem' }}>
                <label><span>Concepto</span><select className="input" value={formMensualidad.tipo} onChange={e => setFormMensualidad({ ...formMensualidad, tipo: e.target.value })}><option value="desayuno">Desayuno</option><option value="comida">Comida</option></select></label>
                <label><span>Desde</span><input className="input" type="date" value={formMensualidad.desde} onChange={e => setFormMensualidad({ ...formMensualidad, desde: e.target.value })}/></label>
                <label><span>Hasta</span><input className="input" type="date" value={formMensualidad.hasta} onChange={e => setFormMensualidad({ ...formMensualidad, hasta: e.target.value })}/></label>
                <label><span>Monto mensual</span><input className="input" type="number" min="0" step="0.01" value={formMensualidad.monto} placeholder="0.00" onChange={e => setFormMensualidad({ ...formMensualidad, monto: e.target.value })}/></label>
              </div>
              <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Días hábiles calculados: <strong>{contarDiasHabiles(parseInputDate(formMensualidad.desde), parseInputDate(formMensualidad.hasta, true))}</strong>. El contador de uso será por servicio: desayuno 1/24, 2/24… y comida 1/24, 2/24… de manera independiente.</div>
              <button className="btn btn-primary" disabled={guardando === 'nueva-mensualidad'} style={{ marginTop: '0.8rem' }}>{guardando === 'nueva-mensualidad' ? 'Guardando…' : 'Guardar mensualidad'}</button>
            </form>}
          </div>

          {modulo === 'comedor' && <DetalleComedor rows={consumosIndividuales} config={configComedor} cambiarEstado={cambiarEstado} guardando={guardando} planesDesayuno={planesDesayuno} planesComida={planesComida} planDesayunoPagado={planDesayunoPagado} planComidaPagado={planComidaPagado} planDesayunoActivo={planDesayunoActivo} planComidaActivo={planComidaActivo} consumosTotales={cafeteriaSeleccionada}/>} 
          {modulo === 'estancia' && <DetalleEstancia rows={estanciaSeleccionada} cambiarEstado={cambiarEstado} guardando={guardando}/>} 
        </div>
      )}
    </div>
  )
}

function costoConsumoLocal(c, config) {
  return Number(c.costo) || (c.tipo === 'desayuno' ? Number(config?.precioDesayuno || 0) : Number(config?.precioComida || 0))
}

function CampoFecha({ label, value, onChange }) { return <label style={{ minWidth: 155 }}><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div><input className="input" type="date" value={value} onChange={e => onChange(e.target.value)} /></label> }
function Kpi({ titulo, valor }) { return <div className="card" style={{ padding: '1rem' }}><div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{valor}</div><div style={{ color: 'var(--ink-muted)', fontSize: '0.78rem' }}>{titulo}</div></div> }
function Mini({ titulo, valor }) { return <div style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 10 }}><div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{titulo}</div><strong>{valor}</strong></div> }
function Modulo({ titulo, total, detalle, activo, onClick }) { return <button onClick={onClick} className="card" style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', border: `2px solid ${activo ? 'var(--red-600)' : 'var(--border)'}`, background: activo ? 'var(--surface-sunken)' : 'var(--surface)' }}><div style={{ fontWeight: 800 }}>{titulo}</div><div style={{ fontSize: '1.35rem', marginTop: '0.3rem' }}>{dinero(total)}</div><div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{detalle} · {activo ? 'ocultar detalle' : 'ver detalle'}</div></button> }
function Check({ label, checked, disabled, onChange }) { return <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', opacity: disabled ? 0.5 : 1 }}><input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={e => onChange(e.target.checked)} />{label}</label> }

function PlanMensual({ plan, consumos, cambiarEstado, guardando }) {
  const inicio = plan.fechaInicio?.toDate ? plan.fechaInicio.toDate() : new Date(plan.fechaInicio)
  const fin = plan.fechaFin?.toDate ? plan.fechaFin.toDate() : new Date(plan.fechaFin)
  const usados = consumos.filter(c => c.tipo === plan.tipo && c.fecha && c.fecha >= inicio && c.fecha <= fin).length
  const dias = Number(plan.diasHabiles || 0)
  return <div style={{ marginTop: '0.65rem', padding: '0.8rem', border: '1px solid var(--border)', borderRadius: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div><strong>{plan.tipo === 'desayuno' ? '🍳 Desayuno mensual' : '🍲 Comida mensual'}</strong><div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{formatoFecha(inicio)} → {formatoFecha(fin)} · {dias} días hábiles</div></div>
      <strong>{dinero(plan.monto)}</strong>
    </div>
    <div style={{ marginTop: '0.65rem' }}><strong>{usados} / {dias}</strong> servicios utilizados · {Math.max(dias - usados, 0)} restantes</div>
    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
      <Check label="Cargado" checked={plan.cargado} disabled={guardando === `planes_comedor-${plan.id}-cargado`} onChange={v => cambiarEstado(plan.id, 'cargado', v)} />
      <Check label="Pagado" checked={plan.pagado} disabled={!plan.cargado || guardando === `planes_comedor-${plan.id}-pagado`} onChange={v => cambiarEstado(plan.id, 'pagado', v)} />
      {plan.pagado ? <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>✓ Mensualidad pagada. Los consumos de {plan.tipo} dentro del periodo quedan cubiertos.</span> : <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>⚠️ Mensualidad activa y aún pendiente de pago. No se generan cargos individuales para este concepto.</span>}
    </div>
  </div>
}

function DetalleComedor({ rows, config, cambiarEstado, guardando, planesDesayuno, planesComida, planDesayunoPagado, planComidaPagado, planDesayunoActivo, planComidaActivo, consumosTotales }) {
  const totalDesayunos = consumosTotales.filter(c => c.tipo === 'desayuno').length
  const totalComidas = consumosTotales.filter(c => c.tipo === 'comida').length
  const maxDesayunos = planesDesayuno.reduce((s, p) => s + Number(p.diasHabiles || 0), 0)
  const maxComidas = planesComida.reduce((s, p) => s + Number(p.diasHabiles || 0), 0)
  return <div style={{ marginTop: '1rem' }}>
    <h3 style={{ fontSize: '0.95rem' }}>Detalle de comedor</h3>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginBottom: '0.8rem' }}>
      <div className="card" style={{ padding: '0.8rem' }}>🍳 Desayunos: <strong>{totalDesayunos}{maxDesayunos ? ` / ${maxDesayunos}` : ''}</strong></div>
      <div className="card" style={{ padding: '0.8rem' }}>🍲 Comidas: <strong>{totalComidas}{maxComidas ? ` / ${maxComidas}` : ''}</strong></div>
    </div>
    {planDesayunoPagado && <div style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>✓ Desayuno: mensualidad pagada. Los consumos quedan cubiertos por el cargo mensual.</div>}
    {!planDesayunoPagado && planDesayunoActivo && <div style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>ℹ️ Desayuno: existe mensualidad activa. El alumno se cobra por el cargo mensual, no por consumo individual.</div>}
    {planComidaPagado && <div style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>✓ Comida: mensualidad pagada. Los consumos quedan cubiertos por el cargo mensual.</div>}
    {!planComidaPagado && planComidaActivo && <div style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>ℹ️ Comida: existe mensualidad activa. El alumno se cobra por el cargo mensual, no por consumo individual.</div>}
    {rows.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>No hay consumos individuales pendientes de cobrar en este periodo.</p> : rows.map(c => {
      const costo = costoConsumoLocal(c, config)
      return <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.8rem', alignItems: 'center', padding: '0.65rem 0', borderTop: '1px solid var(--border)' }}>
        <div><strong>{c.tipo === 'desayuno' ? 'Desayuno' : 'Comida'}</strong><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>{c.fecha ? `${formatoFecha(c.fecha)} · ${formatoHora(c.fecha)}` : '—'} · {dinero(costo)}</div></div>
        <Check label="Cargado" checked={c.cargado} disabled={guardando === `consumos-${c.id}-cargado`} onChange={v => cambiarEstado('consumos', c.id, 'cargado', v)} />
        <Check label="Pagado" checked={c.pagado} disabled={!c.cargado || guardando === `consumos-${c.id}-pagado`} onChange={v => cambiarEstado('consumos', c.id, 'pagado', v)} />
      </div>
    })}
  </div>
}

function DetalleEstancia({ rows, cambiarEstado, guardando }) { return <div style={{ marginTop: '1rem' }}><h3 style={{ fontSize: '0.95rem' }}>Detalle de estancia</h3>{rows.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>Sin estancias cerradas.</p> : rows.map(e => <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.8rem', alignItems: 'center', padding: '0.65rem 0', borderTop: '1px solid var(--border)' }}><div><strong>{e.horaEntrada ? formatoFecha(e.horaEntrada) : '—'}</strong><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>{e.horaEntrada ? formatoHora(e.horaEntrada) : '—'} → {e.horaSalida ? formatoHora(e.horaSalida) : '—'} · {e.minutos || 0} min · {dinero(e.costo)}</div></div><Check label="Cargado" checked={e.cargado} disabled={guardando === `estancias-${e.id}-cargado`} onChange={v => cambiarEstado('estancias', e.id, 'cargado', v)} /><Check label="Pagado" checked={e.pagado} disabled={!e.cargado || guardando === `estancias-${e.id}-pagado`} onChange={v => cambiarEstado('estancias', e.id, 'pagado', v)} /></div>)}</div> }
