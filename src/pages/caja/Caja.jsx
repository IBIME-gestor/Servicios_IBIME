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
import {
  listarAlumnosActivos,
  filtrarPorPlantel,
  descripcionAlumno,
  gradoGrupo,
  normalizar,
  plantelesDe,
  puedeVerTodosLosPlanteles,
  sinPlantelAsignado,
} from '../../lib/alumnos'
import { METODOS_PAGO_ESTANCIA, listarCortesEstancia, estanciasPendientesAlumno } from '../../lib/estancia'
import { obtenerConfigComedor } from '../../lib/pricingComedor'
import { marcarDetalleCobro } from '../../lib/cobros'
import { listarPlanesComedor } from '../../lib/planesComedor'
import { db } from '../../firebase'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import { obtenerCalendario, contarDiasHabiles, esDiaHabil, rangoMes, fechaISO } from '../../lib/calendario'
import { tienePermiso } from '../../lib/permisos'
import { registrarLog } from '../../lib/log'
import CargaMasivaServicios from '../../components/CargaMasivaServicios'

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

async function cargarConsumosMesAlumno(alumnoId, inicioMes, finMes) {
  const q = query(
    collection(db, 'consumos'),
    where('alumnoId', '==', alumnoId),
    where('fecha', '>=', Timestamp.fromDate(inicioMes)),
    where('fecha', '<=', Timestamp.fromDate(finMes)),
    orderBy('fecha', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate ? d.data().fecha.toDate() : null }))
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

async function cargarPlanesRango(inicio, fin) {
  const snap = await getDocs(collection(db, 'planes_comedor'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.activo !== false && solapaRango(p, inicio, fin))
}

/** Esperado / cargado / pagado de un alumno en el periodo (misma regla que el detalle). */
function finanzasAlumno(a, planesTodos, config) {
  const planes = planesTodos.filter((p) => p.alumnoId === a.id)
  const cubreDesayuno = planes.some((p) => p.tipo === 'desayuno')
  const cubreComida = planes.some((p) => p.tipo === 'comida')
  const individuales = a.cafeteria.filter((c) => (c.tipo === 'desayuno' ? !cubreDesayuno : !cubreComida))
  const filas = [
    ...individuales.map((c) => ({ monto: costoConsumoLocal(c, config), cargado: c.cargado, pagado: c.pagado })),
    ...planes.map((p) => ({ monto: Number(p.montoAjustado ?? p.monto ?? 0), cargado: p.cargado, pagado: p.pagado })),
    ...a.estancia.map((e) => ({ monto: Number(e.costo) || 0, cargado: e.cargado, pagado: e.pagado })),
  ]
  const suma = (f) => filas.filter(f).reduce((t, x) => t + x.monto, 0)
  const esperado = suma(() => true)
  const cargado = suma((x) => x.cargado)
  const pagado = suma((x) => x.pagado)
  return { esperado, cargado, pagado, pendiente: Math.max(esperado - pagado, 0), planes: planes.length }
}

export default function Caja() {
  const { user } = useAuth()
  const hoy = new Date()
  const mesActual = rangoMes(hoy)
  const [fechaDesde, setFechaDesde] = useState(fechaInput(mesActual.inicio))
  const [fechaHasta, setFechaHasta] = useState(fechaInput(mesActual.fin))
  const [alumnos, setAlumnos] = useState([])
  const [consumos, setConsumos] = useState([])
  const [consumosMesPlan, setConsumosMesPlan] = useState([])
  const [estancias, setEstancias] = useState([])
  const [configComedor, setConfigComedor] = useState(null)
  const [catalogoPlanes, setCatalogoPlanes] = useState([])
  const [planes, setPlanes] = useState([])
  const [planesTodos, setPlanesTodos] = useState([])
  const [texto, setTexto] = useState('')
  const [filtroPlantel, setFiltroPlantel] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')
  const [expandirRegistro, setExpandirRegistro] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [modulo, setModulo] = useState(null)
  const [panelResumen, setPanelResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState('')
  const [error, setError] = useState('')
  const [mostrarMensualidad, setMostrarMensualidad] = useState(false)
  const [calendario, setCalendario] = useState({ vacaciones: [] })
  const [mostrarCargaMasiva, setMostrarCargaMasiva] = useState(false)
  const [formMensualidad, setFormMensualidad] = useState({ tipo: 'desayuno', monto: '', planCatalogoId: '' })
  const [cortesEstancia, setCortesEstancia] = useState([])
  const [pendientesEstanciaSeleccionado, setPendientesEstanciaSeleccionado] = useState([])
  const [mostrarCortes, setMostrarCortes] = useState(false)
  const [fechaCorteDesde, setFechaCorteDesde] = useState(fechaInput(mesActual.inicio))
  const [fechaCorteHasta, setFechaCorteHasta] = useState(fechaInput(mesActual.fin))
  const [corteExpandido, setCorteExpandido] = useState(null)
  const [aplicandoAjuste, setAplicandoAjuste] = useState('')
  const [pagoModal, setPagoModal] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [tipoTarjeta, setTipoTarjeta] = useState('debito')
  const [banco, setBanco] = useState('')
  const [ultimos4, setUltimos4] = useState('')
  const [titularTarjeta, setTitularTarjeta] = useState('')
  const [mismoQueRecoge, setMismoQueRecoge] = useState(true)

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
      const [a, c, e, cfg, cfgPlanes, cfgCalendario, planesPeriodo, cortes] = await Promise.all([
        listarAlumnosActivos(),
        cargarConsumosRango(inicio, fin),
        cargarEstanciasRango(inicio, fin),
        obtenerConfigComedor(),
        listarPlanesComedor(),
        obtenerCalendario(),
        cargarPlanesRango(inicio, fin),
        listarCortesEstancia(100),
      ])
      setPlanesTodos(planesPeriodo)
      setAlumnos(filtrarPorPlantel(a, user))
      setConsumos(c)
      setEstancias(e.filter((x) => x.horaSalida))
      setConfigComedor(cfg)
      setCatalogoPlanes(cfgPlanes.filter((p) => p.activo !== false))
      setCalendario(cfgCalendario || { vacaciones: [] })
      setCortesEstancia(cortes || [])
      if (seleccionadoId) {
        const p = await cargarPlanesAlumno(seleccionadoId)
        setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
        const mes = rangoMes(new Date())
        setConsumosMesPlan(await cargarConsumosMesAlumno(seleccionadoId, mes.inicio, mes.fin))
        setPendientesEstanciaSeleccionado(await estanciasPendientesAlumno(seleccionadoId))
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
    return Array.from(mapa.values()).map((a) => ({ ...a, fin: finanzasAlumno(a, planesTodos, configComedor) }))
  }, [alumnos, consumos, estancias, planesTodos, configComedor])

  // Totales del periodo de todos los alumnos visibles (los tres KPIs de dinero).
  const totalesPeriodo = useMemo(() => actividad.reduce(
    (t, a) => ({ esperado: t.esperado + a.fin.esperado, cargado: t.cargado + a.fin.cargado, pagado: t.pagado + a.fin.pagado }),
    { esperado: 0, cargado: 0, pagado: 0 }
  ), [actividad])

  const cortesFiltrados = useMemo(() => {
    const desde = parseInputDate(fechaCorteDesde, false)
    const hasta = parseInputDate(fechaCorteHasta, true)
    if (desde > hasta) return []
    return cortesEstancia.filter((c) => c.creadoEn && c.creadoEn >= desde && c.creadoEn <= hasta)
  }, [cortesEstancia, fechaCorteDesde, fechaCorteHasta])

  const alumnosEnRegistro = actividad.filter((a) => a.cafeteria.length || a.estancia.length || a.fin.planes)
  const verTodosPlanteles = puedeVerTodosLosPlanteles(user)
  const planteles = useMemo(() => plantelesDe(alumnos), [alumnos])
  const niveles = useMemo(() => Array.from(new Set(alumnos.map((a) => String(a.nivel || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [alumnos])
  const filtrados = alumnosEnRegistro.filter((a) => {
    const t = normalizar(texto)
    if (filtroPlantel && normalizar(a.plantel) !== normalizar(filtroPlantel)) return false
    if (filtroNivel && normalizar(a.nivel) !== normalizar(filtroNivel)) return false
    return !t || normalizar(a.nombre).includes(t) || normalizar(a.matricula).includes(t) || normalizar(a.grupo).includes(t) || normalizar(a.tutor).includes(t)
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  async function seleccionar(a) {
    setSeleccionadoId(a.id)
    setModulo(null)
    setMostrarMensualidad(false)
    setError('')
    try {
      const p = await cargarPlanesAlumno(a.id)
      setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
      const mes = rangoMes(new Date())
      setConsumosMesPlan(await cargarConsumosMesAlumno(a.id, mes.inicio, mes.fin))
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar las mensualidades del alumno.')
      setPlanes([])
    }
  }

  function incidenciasMensualidad(plan) {
    const inicioPlan = plan.fechaInicio?.toDate ? plan.fechaInicio.toDate() : new Date(plan.fechaInicio)
    const finPlan = plan.fechaFin?.toDate ? plan.fechaFin.toDate() : new Date(plan.fechaFin)
    const consumidos = new Set(consumosMesPlan.filter(c => c.tipo === plan.tipo && c.fecha && c.fecha >= inicioPlan && c.fecha <= finPlan && esDiaHabil(c.fecha, calendario.vacaciones || [])).map(c => fechaISO(c.fecha)))
    const diasPlan = contarDiasHabiles(inicioPlan, finPlan, calendario.vacaciones || [])
    const valorDia = diasPlan > 0 ? Number(plan.monto || 0) / diasPlan : 0
    const hoy = inicioDelDia(new Date())
    const hasta = finPlan < hoy ? finPlan : hoy
    const yaAjustados = new Set(plan.incidenciasInasistencia || [])
    const faltantes = []
    for (let d = new Date(inicioPlan); d <= hasta; d.setDate(d.getDate() + 1)) {
      if (esDiaHabil(d, calendario.vacaciones || [])) {
        const clave = fechaISO(d)
        if (!consumidos.has(clave) && !yaAjustados.has(clave)) faltantes.push(new Date(d))
      }
    }
    return { diasPlan, usados: consumidos.size, faltantes, valorDia, descuentoSugerido: faltantes.length * valorDia }
  }

  const seleccionado = actividad.find((a) => a.id === seleccionadoId) || null
  const cafeteriaSeleccionada = seleccionado?.cafeteria || []
  const estanciaActualSeleccionada = seleccionado?.estancia || []
  const estanciaSeleccionada = useMemo(() => { const ids = new Set(estanciaActualSeleccionada.map(e => e.id)); return [...estanciaActualSeleccionada, ...pendientesEstanciaSeleccionado.filter(e => !ids.has(e.id))] }, [estanciaActualSeleccionada, pendientesEstanciaSeleccionado])

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
  const totalMensualidades = [...planesDesayuno, ...planesComida].reduce((s, p) => s + Number(p.montoAjustado ?? p.monto ?? 0), 0)
  const totalEstancia = estanciaSeleccionada.reduce((s, e) => s + (Number(e.costo) || 0), 0)
  const totalCafeteria = totalIndividualComedor + totalMensualidades
  const totalEsperado = totalCafeteria + totalEstancia

  const cargadoIndividual = consumosIndividuales.filter((c) => c.cargado).reduce((s, c) => s + costoConsumo(c), 0) + estanciaSeleccionada.filter((e) => e.cargado).reduce((s, e) => s + Number(e.costo || 0), 0)
  const pagadoIndividual = consumosIndividuales.filter((c) => c.pagado).reduce((s, c) => s + costoConsumo(c), 0) + estanciaSeleccionada.filter((e) => e.pagado).reduce((s, e) => s + Number(e.costo || 0), 0)
  const cargadoMensual = [...planesDesayuno, ...planesComida].filter((p) => p.cargado).reduce((s, p) => s + Number(p.montoAjustado ?? p.monto ?? 0), 0)
  const pagadoMensual = [...planesDesayuno, ...planesComida].filter((p) => p.pagado).reduce((s, p) => s + Number(p.montoAjustado ?? p.monto ?? 0), 0)
  const totalCargado = cargadoIndividual + cargadoMensual
  const totalPagado = pagadoIndividual + pagadoMensual

  async function cambiarEstado(coleccion, id, campo, valor) {
    if (campo === 'pagado' && valor) {
      const actual = coleccion === 'consumos' ? consumos.find(x => x.id === id) : coleccion === 'estancias' ? estancias.find(x => x.id === id) : planes.find(x => x.id === id)
      abrirPagoModal([{ id, coleccion, monto: coleccion === 'consumos' ? costoConsumoLocal(actual, configComedor) : Number(actual?.montoAjustado ?? actual?.monto ?? actual?.costo ?? 0), etiqueta: coleccion === 'estancias' ? `Estancia · ${actual?.horaEntrada ? formatoFecha(actual.horaEntrada) : ''}` : coleccion === 'planes_comedor' ? (actual?.tipo === 'desayuno' ? 'Desayuno mensual' : 'Comida mensual') : (actual?.tipo === 'desayuno' ? 'Desayuno' : 'Comida'), retiradoPor: actual?.retiradoPor || seleccionado?.tutor || '' }])
      return
    }
    const key = `${coleccion}-${id}-${campo}`
    setGuardando(key)
    setError('')
    try {
      await marcarDetalleCobro({ coleccion, id, campo, valor, usuario: user?.email || user?.uid || 'usuario' })
      registrarLog({ user, accion: `caja.${campo}_${valor ? 'marcar' : 'desmarcar'}`, modulo: 'caja', entidad: coleccion, entidadId: id, alumno: seleccionado, detalle: { campo, valor: Boolean(valor) } })
      const aplicar = (lista) => lista.map((x) => x.id === id ? { ...x, [campo]: valor } : x)
      if (coleccion === 'consumos') setConsumos(aplicar)
      else if (coleccion === 'estancias') setEstancias(aplicar)
      else setPlanes(aplicar)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible actualizar el estado de cobro.')
    } finally { setGuardando('') }
  }

  async function abrirPagoModal(items) {
    let lista = items
    const estancia = items.find(x => x.coleccion === 'estancias')
    if (estancia && seleccionado?.id) {
      try {
        const pendientes = await estanciasPendientesAlumno(seleccionado.id)
        const actuales = new Set(items.map(x => x.id))
        lista = [...items, ...pendientes.filter(x => !actuales.has(x.id)).map(x => ({ id:x.id, coleccion:'estancias', monto:Number(x.costo||0), etiqueta:`Estancia · ${x.horaEntrada ? formatoFecha(x.horaEntrada) : ''}`, retiradoPor:x.retiradoPor || '' }))]
      } catch (err) { console.error(err) }
    }
    setMetodoPago('efectivo'); setTipoTarjeta('debito'); setBanco(''); setUltimos4(''); setMismoQueRecoge(true)
    setTitularTarjeta(lista[0]?.retiradoPor || seleccionado?.tutor || '')
    setPagoModal(lista.map(x => ({...x, seleccionado: true})))
  }

  async function confirmarPagoModal() {
    const items = (pagoModal || []).filter(x => x.seleccionado)
    if (!items.length) return
    const metodo = metodoPago === 'efectivo' ? 'efectivo' : `tarjeta_${tipoTarjeta}`
    const datosPago = metodo === 'efectivo' ? null : { tipoTarjeta, banco: banco.trim(), ultimos4: ultimos4.trim(), titular: (mismoQueRecoge ? (items[0]?.retiradoPor || titularTarjeta) : titularTarjeta).trim(), titularEsRecoje: mismoQueRecoge }
    if (metodo !== 'efectivo' && (!datosPago.banco || !/^\d{4}$/.test(datosPago.ultimos4) || !datosPago.titular)) { setError('Completa banco, últimos 4 dígitos y titular de la tarjeta.'); return }
    setGuardando('pago-multiple'); setError('')
    try {
      for (const item of items) {
        await marcarDetalleCobro({ coleccion: item.coleccion === 'planes_comedor' ? 'planes_comedor' : item.coleccion, id:item.id, campo:'pagado', valor:true, usuario:user?.email||user?.uid||'usuario', pago:{ metodoPago:metodo, datosPago } })
      }
      const marcar = (lista, coleccion) => lista.map(x => items.some(i=>i.id===x.id && i.coleccion===coleccion) ? {...x, pagado:true, pagadoPor:user?.email||user?.uid||'usuario', metodoPago:metodo, datosPago} : x)
      setConsumos(x => marcar(x,'consumos')); setEstancias(x => marcar(x,'estancias')); setPlanes(x => marcar(x,'planes_comedor')); setPlanesTodos(x => marcar(x,'planes_comedor'))
      registrarLog({ user, accion:'caja.pago_registrar', modulo:'caja', entidad:'cobros', alumno:seleccionado, detalle:{ metodoPago:metodo, items:items.map(i=>i.id), total:items.reduce((t,i)=>t+Number(i.monto||0),0), datosPago } })
      setPagoModal(null)
    } catch (err) { console.error(err); setError(err?.message || 'No fue posible registrar el pago.') } finally { setGuardando('') }
  }

  async function aplicarDescuentoInasistencia(plan, descuento, faltantes) {
    if (!plan?.id || descuento <= 0) return
    const ok = window.confirm(`Se aplicará un descuento de ${dinero(descuento)} a la mensualidad de ${plan.tipo === 'desayuno' ? 'desayuno' : 'comida'} por ${faltantes.length} día(s) sin consumo registrado.\n\nEste ajuste quedará guardado en la mensualidad y deberá aclararse con el tutor. ¿Continuar?`)
    if (!ok) return
    const key = `ajuste-${plan.id}`
    setAplicandoAjuste(key)
    setError('')
    try {
      const montoOriginal = Number(plan.monto || 0)
      const descuentoAnterior = Number(plan.descuentoInasistencia || 0)
      const nuevoDescuento = Math.min(montoOriginal, descuentoAnterior + descuento)
      const montoAjustado = Math.max(montoOriginal - nuevoDescuento, 0)
      await updateDoc(doc(db, 'planes_comedor', plan.id), {
        montoOriginal: Number(plan.montoOriginal || montoOriginal),
        descuentoInasistencia: nuevoDescuento,
        montoAjustado,
        diasDescontados: Number(plan.diasDescontados || 0) + faltantes.length,
        incidenciasInasistencia: Array.from(new Set([...(plan.incidenciasInasistencia || []), ...faltantes.map(d => fechaISO(d))])),
        ultimaIncidenciaInasistencia: serverTimestamp(),
        ajustadoPor: user?.email || user?.uid || 'usuario',
      })
      const actualizar = (lista) => lista.map(p => p.id === plan.id ? { ...p, montoOriginal: Number(p.montoOriginal || montoOriginal), descuentoInasistencia: nuevoDescuento, montoAjustado, diasDescontados: Number(p.diasDescontados || 0) + faltantes.length } : p)
      setPlanes(actualizar)
      setPlanesTodos(actualizar)
      registrarLog({ user, accion: 'caja.mensualidad_descuento_inasistencia', modulo: 'caja', entidad: 'planes_comedor', entidadId: plan.id, alumno: seleccionado, detalle: { descuento, dias: faltantes.length, fechas: faltantes.map(d => fechaISO(d)) } })
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible aplicar el descuento por inasistencia.')
    } finally {
      setAplicandoAjuste('')
    }
  }

  async function crearMensualidad(e) {
    e.preventDefault()
    if (!seleccionado) return
    setGuardando('nueva-mensualidad')
    setError('')
    try {
      const planCatalogo = catalogoPlanes.find((p) => p.id === formMensualidad.planCatalogoId) || null
      const tipo = planCatalogo?.tipo || formMensualidad.tipo
      const monto = Number(planCatalogo?.monto ?? formMensualidad.monto)
      if (!Number.isFinite(monto) || monto <= 0) throw new Error('Captura o selecciona un monto mensual válido.')

      const mes = rangoMes(new Date())
      const diasHabiles = contarDiasHabiles(mes.inicio, mes.fin, calendario.vacaciones || [])
      const fechaInicio = Timestamp.fromDate(mes.inicio)
      const fechaFin = Timestamp.fromDate(mes.fin)
      const mesClave = fechaISO(mes.inicio).slice(0, 7)
      const existentes = await cargarPlanesAlumno(seleccionado.id)
      const existeSolapado = existentes.some(p => p.tipo === tipo && p.mesClave === mesClave && p.activo !== false)
      if (existeSolapado) throw new Error(`Ya existe una mensualidad activa de ${tipo} para ${mesClave}.`)

      await addDoc(collection(db, 'planes_comedor'), {
        alumnoId: seleccionado.id,
        alumnoNombre: seleccionado.nombre,
        tipo,
        monto,
        planCatalogoId: planCatalogo?.id || null,
        planCatalogoNombre: planCatalogo?.nombre || null,
        fechaInicio,
        fechaFin,
        mesClave,
        diasHabiles,
        vacacionesAplicadas: calendario.vacaciones || [],
        activo: true,
        cargado: true,
        pagado: false,
        creadoPor: user?.email || user?.uid || 'usuario',
        creadoEn: serverTimestamp(),
      })
      registrarLog({
        user, accion: 'caja.mensualidad_crear', modulo: 'caja', entidad: 'planes_comedor', alumno: seleccionado,
        detalle: { tipo, monto, mes: mesClave, plan: planCatalogo?.nombre || 'manual' },
      })
      setPlanesTodos(await cargarPlanesRango(inicio, fin))
      const p = await cargarPlanesAlumno(seleccionado.id)
      setPlanes(p.filter((x) => solapaRango(x, inicio, fin)))
      const consumosMes = await cargarConsumosMesAlumno(seleccionado.id, mes.inicio, mes.fin)
      setConsumosMesPlan(consumosMes)
      setPendientesEstanciaSeleccionado(await estanciasPendientesAlumno(seleccionado.id))
      setMostrarMensualidad(false)
      setFormMensualidad({ tipo: 'desayuno', monto: '', planCatalogoId: '' })
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible crear la mensualidad.')
    } finally {
      setGuardando('')
    }
  }

  async function cambiarEstadoMensualidad(id, campo, valor) {
    if (campo === 'pagado' && valor) {
      const plan = planes.find(p => p.id === id)
      abrirPagoModal([{ id, coleccion:'planes_comedor', monto:Number(plan?.montoAjustado ?? plan?.monto ?? 0), etiqueta: plan?.tipo === 'desayuno' ? 'Desayuno mensual' : 'Comida mensual', retiradoPor: seleccionado?.tutor || '' }])
      return
    }
    const key = `planes_comedor-${id}-${campo}`
    setGuardando(key); setError('')
    try {
      await updateDoc(doc(db, 'planes_comedor', id), { [campo]: Boolean(valor), [`${campo}Por`]: user?.email || user?.uid || 'usuario', [`fecha${campo[0].toUpperCase()}${campo.slice(1)}`]: serverTimestamp() })
      setPlanes((lista) => lista.map((p) => p.id === id ? { ...p, [campo]: Boolean(valor) } : p))
      setPlanesTodos((lista) => lista.map((p) => p.id === id ? { ...p, [campo]: Boolean(valor) } : p))
    } catch (err) { console.error(err); setError(err?.message || 'No fue posible actualizar la mensualidad.') } finally { setGuardando('') }
  }

  if (cargando) return <p style={{ color: 'var(--ink-muted)' }}>Cargando registro de alumnos…</p>

  return (
    <div className="caja-page page-shell">
      <div className="page-heading"><div><h1>💳 Caja</h1>
      <p className="page-subtitle">Consulta, carga y pago de servicios por cualquier periodo.</p></div></div>

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
      {sinPlantelAsignado(user) && <div className="card form-error">Tu cuenta aún no tiene un plantel asignado, por eso no ves alumnos. Pide al administrador que te lo asigne.</div>}

      {tienePermiso(user, 'caja.carga_masiva') && <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-outline" onClick={() => setMostrarCargaMasiva(v => !v)}>📦 {mostrarCargaMasiva ? 'Ocultar carga masiva' : 'Carga masiva'}</button>
        {mostrarCargaMasiva && <div style={{ marginTop: '0.8rem' }}><CargaMasivaServicios tipo="comedor" /></div>}
      </div>}

      <div className="caja-kpis">
        <Kpi titulo="Alumnos" valor={alumnos.length} />
        <Kpi
          titulo="Con comedor"
          valor={actividad.filter(a => a.cafeteria.length).length}
          desplegable
          activo={panelResumen === 'comedor'}
          onClick={() => setPanelResumen(panelResumen === 'comedor' ? null : 'comedor')}
        />
        <Kpi
          titulo="Con estancia"
          valor={actividad.filter(a => a.estancia.length).length}
          desplegable
          activo={panelResumen === 'estancia'}
          onClick={() => setPanelResumen(panelResumen === 'estancia' ? null : 'estancia')}
        />
        {[['esperado', 'Esperado'], ['cargado', 'Cargado'], ['pagado', 'Pagado']].map(([clave, titulo]) => (
          <Kpi
            key={clave}
            titulo={titulo}
            valor={dinero(totalesPeriodo[clave])}
            desplegable
            activo={panelResumen === clave}
            onClick={() => setPanelResumen(panelResumen === clave ? null : clave)}
          />
        ))}
      </div>

      {panelResumen && (() => {
        const esDinero = ['esperado', 'cargado', 'pagado'].includes(panelResumen)
        const titulos = { comedor: 'Alumnos con comedor', estancia: 'Alumnos con estancia', esperado: 'Esperado por alumno', cargado: 'Cargado por alumno', pagado: 'Pagado por alumno' }
        const filas = actividad
          .filter((a) => (esDinero ? a.fin[panelResumen] > 0 : panelResumen === 'comedor' ? a.cafeteria.length : a.estancia.length))
          .sort((x, y) => (esDinero ? y.fin[panelResumen] - x.fin[panelResumen] : x.nombre.localeCompare(y.nombre)))
        return (
          <div className="card caja-summary-panel">
            <div className="section-heading">
              <div>
                <strong>{titulos[panelResumen]}{esDinero ? ` · ${dinero(totalesPeriodo[panelResumen])}` : ''}</strong>
                <span>{filas.length} alumno(s) · haz clic en uno para abrir su desglose a la derecha.</span>
              </div>
              <button className="btn btn-outline btn-small" onClick={() => setPanelResumen(null)}>Cerrar</button>
            </div>
            <div className="caja-summary-list">
              {filas.length === 0 && <p className="page-muted">Sin alumnos en este concepto para el periodo.</p>}
              {filas.map((a) => (
                <button key={a.id} className="caja-summary-row" onClick={() => seleccionar(a)}>
                  <span><strong>{a.nombre}</strong><small>{descripcionAlumno(a)}</small></span>
                  <span>{esDinero ? <strong>{dinero(a.fin[panelResumen])}</strong> : panelResumen === 'comedor' ? `🍽️ ${a.cafeteria.length}` : `🏫 ${a.estancia.length}`}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="caja-workspace">
        <section>
          <button className="card caja-register-toggle" onClick={() => setExpandirRegistro(v => !v)}>
            <div><strong>Alumnos en registro</strong><span>Selecciona un alumno para trabajar su detalle financiero.</span></div>
            <strong className="caja-register-count">{alumnosEnRegistro.length} {expandirRegistro ? '▲' : '▼'}</strong>
          </button>

          {expandirRegistro && (
            <div className="card caja-register-list">
              <div className="caja-list-toolbar">
                <input className="input" placeholder="Buscar alumno, matrícula, grupo o tutor…" value={texto} onChange={e => setTexto(e.target.value)} />
                {verTodosPlanteles && planteles.length > 1 && <select className="input" value={filtroPlantel} onChange={e => setFiltroPlantel(e.target.value)}><option value="">Todos los planteles</option>{planteles.map(p => <option key={p} value={p}>{p}</option>)}</select>}
                {niveles.length > 1 && <select className="input" value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)}><option value="">Todos los niveles</option>{niveles.map(n => <option key={n} value={n}>{n}</option>)}</select>}
              </div>
              <div className="caja-table-wrap">
                <table className="caja-table">
                  <thead><tr><th>Alumno</th>{verTodosPlanteles && <th>Plantel</th>}<th>Nivel · Grado · Grupo</th><th>Comedor</th><th>Estancia</th><th>Total</th></tr></thead>
                  <tbody>
                    {filtrados.map(a => {
                      const selected = a.id === seleccionadoId
                      return <tr key={a.id} onClick={() => seleccionar(a)} className={selected ? 'selected' : ''}>
                        <td><strong>{selected ? '▶ ' : ''}{a.nombre}</strong><small>{a.matricula}</small></td>
                        {verTodosPlanteles && <td>{a.plantel}</td>}<td>{gradoGrupo(a)}</td><td>🍽️ {a.cafeteria.length}</td><td>🏫 {a.estancia.length}</td><td><strong>{dinero(a.fin.esperado)}</strong></td>
                      </tr>
                    })}
                  </tbody>
                </table>
                {filtrados.length === 0 && <p className="page-muted caja-no-results">No hay alumnos con servicios en este periodo.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      {seleccionado && (
        <div className="caja-detail-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSeleccionadoId(null); setPlanes([]); setConsumosMesPlan([]); setModulo(null) } }}>
          <aside className="card caja-detail-drawer" role="dialog" aria-modal="true">
          <div className="drawer-header">
            <div><h2 style={{ margin: 0 }}>{seleccionado.nombre}</h2><span>{descripcionAlumno(seleccionado)}</span>{(seleccionado.tutor || seleccionado.telefonoTutor) && <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 2 }}>Tutor: {seleccionado.tutor || '—'}{seleccionado.telefonoTutor ? ` · Tel. ${seleccionado.telefonoTutor}` : ''}</div>}</div>
            <button className="btn btn-outline btn-small" onClick={() => { setSeleccionadoId(null); setPlanes([]); setConsumosMesPlan([]); setModulo(null) }}>Cerrar</button>
          </div>

          <div className="caja-module-grid">
            <Modulo titulo="🍽️ Comedor" total={totalCafeteria} activo={modulo === 'comedor'} onClick={() => setModulo(modulo === 'comedor' ? null : 'comedor')} detalle={`${cafeteriaSeleccionada.length} consumo(s)`}/>
            <Modulo titulo="🏫 Estancia" total={totalEstancia} activo={modulo === 'estancia'} onClick={() => setModulo(modulo === 'estancia' ? null : 'estancia')} detalle={`${estanciaSeleccionada.length} registro(s)`}/>
          </div>

          <div className="caja-mini-grid">
            <Mini titulo="Esperado" valor={dinero(totalEsperado)} />
            <Mini titulo="Cargado" valor={dinero(totalCargado)} />
            <Mini titulo="Pagado" valor={dinero(totalPagado)} />
            <Mini titulo="Pendiente" valor={dinero(Math.max(totalEsperado - totalPagado, 0))} onClick={() => setModulo(modulo === 'pendiente' ? null : 'pendiente')} activo={modulo === 'pendiente'} />
          </div>

          <div className="caja-monthly-section">
            <div className="section-heading">
              <div><strong>🍽️ Mensualidades de comedor</strong><span>Desayuno y comida son conceptos independientes.</span></div>
              {tienePermiso(user, 'caja.asignar_plan_comedor') && <button className="btn btn-outline btn-small" onClick={() => setMostrarMensualidad(v => !v)}>+ {mostrarMensualidad ? 'Cerrar' : 'Registrar'}</button>}
            </div>

            {[...planesDesayuno, ...planesComida].map(plan => <PlanMensual key={plan.id} plan={plan} consumos={consumosMesPlan} vacaciones={calendario.vacaciones || []} incidencia={incidenciasMensualidad(plan)} cambiarEstado={cambiarEstadoMensualidad} aplicarDescuento={aplicarDescuentoInasistencia} aplicandoAjuste={aplicandoAjuste} guardando={guardando} puedeGestionar={tienePermiso(user, 'caja.asignar_plan_comedor')} />)}

            {mostrarMensualidad && <form onSubmit={crearMensualidad} className="caja-monthly-form">
              <div className="caja-form-grid">
                <label><span>Plan del catálogo</span><select className="input" value={formMensualidad.planCatalogoId} onChange={e => { const id = e.target.value; const p = catalogoPlanes.find(x => x.id === id); setFormMensualidad({ ...formMensualidad, planCatalogoId: id, tipo: p?.tipo || formMensualidad.tipo, monto: p?.monto ?? formMensualidad.monto }) }}><option value="">Captura manual</option>{catalogoPlanes.map(p => <option key={p.id} value={p.id}>{p.nombre} · ${Number(p.montoAjustado ?? p.monto ?? 0).toFixed(2)}</option>)}</select></label>
                <label><span>Concepto</span><select className="input" value={formMensualidad.tipo} disabled={Boolean(formMensualidad.planCatalogoId)} onChange={e => setFormMensualidad({ ...formMensualidad, tipo: e.target.value })}><option value="desayuno">Desayuno</option><option value="comida">Comida</option></select></label>
                <label><span>Monto mensual</span><input className="input" type="number" min="0" step="0.01" value={formMensualidad.monto} readOnly={Boolean(formMensualidad.planCatalogoId)} placeholder="0.00" onChange={e => setFormMensualidad({ ...formMensualidad, monto: e.target.value })}/></label>
              </div>
              <div className="page-muted">Periodo: <strong>{fechaInput(mesActual.inicio)} → {fechaInput(mesActual.fin)}</strong> · días de consumo: <strong>{contarDiasHabiles(mesActual.inicio, mesActual.fin, calendario.vacaciones || [])}</strong>.</div>
              <button className="btn btn-primary" disabled={guardando === 'nueva-mensualidad'}>{guardando === 'nueva-mensualidad' ? 'Guardando…' : 'Guardar mensualidad'}</button>
            </form>}
          </div>

          {modulo === 'comedor' && <DetalleComedor rows={consumosIndividuales} config={configComedor} cambiarEstado={cambiarEstado} guardando={guardando} planesDesayuno={planesDesayuno} planesComida={planesComida} planDesayunoPagado={planDesayunoPagado} planComidaPagado={planComidaPagado} planDesayunoActivo={planDesayunoActivo} planComidaActivo={planComidaActivo} consumosTotales={cafeteriaSeleccionada}/>} 
          {modulo === 'estancia' && <DetalleEstancia rows={estanciaSeleccionada} cambiarEstado={cambiarEstado} guardando={guardando}/>}
          {modulo === 'pendiente' && <DetallePendientes rows={estanciaSeleccionada.filter(e => !e.pagado)} cambiarEstado={cambiarEstado} guardando={guardando} />} 
          </aside>
        </div>
      )}


      {pagoModal && (
        <div className="estancia-drawer-backdrop pago-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget && !guardando) setPagoModal(null)}}>
          <div className="card pago-modal" role="dialog" aria-modal="true">
            <h3 style={{marginTop:0}}>Registrar pago</h3>
            <p className="page-muted">Selecciona qué conceptos se liquidan en este momento.</p>
            <div style={{display:'grid',gap:'0.45rem',marginBottom:'0.8rem'}}>{pagoModal.map((item,i)=><label key={item.id} style={{display:'flex',justifyContent:'space-between',gap:'0.5rem',padding:'0.55rem',border:'1px solid var(--border)',borderRadius:8}}><span><input type="checkbox" checked={item.seleccionado} onChange={()=>setPagoModal(xs=>xs.map((x,j)=>j===i?{...x,seleccionado:!x.seleccionado}:x))}/> {item.etiqueta}</span><strong>{dinero(item.monto)}</strong></label>)}</div>
            <div style={{fontWeight:800,marginBottom:'0.7rem'}}>Total: {dinero(pagoModal.filter(x=>x.seleccionado).reduce((t,x)=>t+Number(x.monto||0),0))}</div>
            <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}><button type="button" className={`btn ${metodoPago==='efectivo'?'btn-primary':'btn-outline'}`} onClick={()=>setMetodoPago('efectivo')}>💵 Efectivo</button><button type="button" className={`btn ${metodoPago==='tarjeta'?'btn-primary':'btn-outline'}`} onClick={()=>setMetodoPago('tarjeta')}>💳 Cargo a tarjeta</button></div>
            {metodoPago==='tarjeta' && <div style={{display:'grid',gap:'0.5rem',marginTop:'0.7rem'}}><div style={{display:'flex',gap:'0.5rem'}}><button type="button" className={`btn ${tipoTarjeta==='debito'?'btn-primary':'btn-outline'}`} onClick={()=>setTipoTarjeta('debito')}>Débito</button><button type="button" className={`btn ${tipoTarjeta==='credito'?'btn-primary':'btn-outline'}`} onClick={()=>setTipoTarjeta('credito')}>Crédito</button></div><input className="input" placeholder="Banco" value={banco} onChange={e=>setBanco(e.target.value)}/><input className="input" inputMode="numeric" maxLength={4} placeholder="Últimos 4 dígitos" value={ultimos4} onChange={e=>setUltimos4(e.target.value.replace(/\D/g,'').slice(0,4))}/><label style={{display:'flex',gap:'0.4rem',alignItems:'center'}}><input type="checkbox" checked={mismoQueRecoge} onChange={e=>{setMismoQueRecoge(e.target.checked);if(e.target.checked)setTitularTarjeta(pagoModal[0]?.retiradoPor||seleccionado?.tutor||'')}}/> El titular es el mismo que recoge</label><input className="input" placeholder="Titular de la tarjeta" value={titularTarjeta} disabled={mismoQueRecoge} onChange={e=>setTitularTarjeta(e.target.value)}/></div>}
            <div style={{display:'flex',gap:'0.5rem',marginTop:'0.9rem'}}><button className="btn btn-primary" disabled={guardando==='pago-multiple'||!pagoModal.some(x=>x.seleccionado)} onClick={confirmarPagoModal}>{guardando==='pago-multiple'?'Guardando…':'Registrar pago'}</button><button className="btn btn-outline" disabled={guardando==='pago-multiple'} onClick={()=>setPagoModal(null)}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function costoConsumoLocal(c, config) {
  return Number(c.costo) || (c.tipo === 'desayuno' ? Number(config?.precioDesayuno || 0) : Number(config?.precioComida || 0))
}

function CampoFecha({ label, value, onChange }) { return <label style={{ minWidth: 155 }}><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div><input className="input" type="date" value={value} onChange={e => onChange(e.target.value)} /></label> }
function Kpi({ titulo, valor, desplegable = false, activo = false, onClick }) { return <button type="button" className={`card caja-kpi ${activo ? 'active' : ''} ${desplegable ? 'clickable' : ''}`} onClick={onClick} disabled={!desplegable} aria-pressed={activo}><div className="caja-kpi-value">{valor}</div><div className="caja-kpi-label">{titulo}{desplegable ? <span>{activo ? '▲' : '▼'}</span> : null}</div></button> }
function Mini({ titulo, valor, onClick, activo }) { return <button type="button" onClick={onClick} style={{ padding: '0.75rem', border: `1px solid ${activo ? 'var(--red-600)' : 'var(--border)'}`, borderRadius: 10, textAlign:'left', background: activo ? 'var(--surface-sunken)' : 'var(--surface)', cursor:onClick?'pointer':'default' }}><div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{titulo}</div><strong>{valor}</strong></button> }
function Modulo({ titulo, total, detalle, activo, onClick }) { return <button onClick={onClick} className="card" style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', border: `2px solid ${activo ? 'var(--red-600)' : 'var(--border)'}`, background: activo ? 'var(--surface-sunken)' : 'var(--surface)' }}><div style={{ fontWeight: 800 }}>{titulo}</div><div style={{ fontSize: '1.35rem', marginTop: '0.3rem' }}>{dinero(total)}</div><div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{detalle} · {activo ? 'ocultar detalle' : 'ver detalle'}</div></button> }
function Check({ label, checked, disabled, onChange }) { return <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', opacity: disabled ? 0.5 : 1 }}><input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={e => onChange(e.target.checked)} />{label}</label> }

function PlanMensual({ plan, consumos, vacaciones, incidencia, cambiarEstado, aplicarDescuento, aplicandoAjuste, guardando, puedeGestionar }) {
  const inicio = plan.fechaInicio?.toDate ? plan.fechaInicio.toDate() : new Date(plan.fechaInicio)
  const fin = plan.fechaFin?.toDate ? plan.fechaFin.toDate() : new Date(plan.fechaFin)
  const dias = incidencia?.diasPlan || contarDiasHabiles(inicio, fin, vacaciones || [])
  const usados = incidencia?.usados || 0
  const descuento = Number(plan.descuentoInasistencia || 0)
  const montoVisible = Number(plan.montoAjustado ?? plan.monto ?? 0)
  const faltantes = incidencia?.faltantes || []
  return <div style={{ marginTop: '0.65rem', padding: '0.8rem', border: '1px solid var(--border)', borderRadius: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div><strong>{plan.tipo === 'desayuno' ? '🍳 Desayuno mensual' : '🍲 Comida mensual'}</strong><div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{formatoFecha(inicio)} → {formatoFecha(fin)} · {dias} días hábiles</div></div>
      <div style={{ textAlign: 'right' }}><strong>{dinero(montoVisible)}</strong>{descuento > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Original {dinero(plan.monto)} · descuento {dinero(descuento)}</div>}</div>
    </div>
    <div style={{ marginTop: '0.65rem' }}><strong>{usados} / {dias}</strong> servicios utilizados · {Math.max(dias - usados, 0)} restantes</div>
    {faltantes.length > 0 && <div style={{ marginTop: '0.7rem', padding: '0.65rem', borderRadius: 8, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      <strong>⚠️ Incidencia de asistencia de comedor</strong>
      <div style={{ fontSize: '0.76rem', marginTop: 3 }}>{faltantes.length} día(s) hábil(es) sin consumo registrado. Descuento sugerido: <strong>{dinero(incidencia.descuentoSugerido)}</strong>.</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginTop: 3 }}>{faltantes.slice(0, 8).map(d => fechaISO(d)).join(' · ')}{faltantes.length > 8 ? ' · …' : ''}</div>
      {puedeGestionar && incidencia.descuentoSugerido > 0 && <button className="btn btn-outline btn-small" style={{ marginTop: '0.5rem' }} disabled={aplicandoAjuste === `ajuste-${plan.id}`} onClick={() => aplicarDescuento(plan, incidencia.descuentoSugerido, faltantes)}>{aplicandoAjuste === `ajuste-${plan.id}` ? 'Aplicando…' : 'Aplicar descuento y dejar incidencia'}</button>}
      <div style={{ fontSize: '0.68rem', color: 'var(--ink-muted)', marginTop: 4 }}>La incidencia se calcula por ausencia de consumo registrado; Caja debe confirmar que el alumno realmente no acudió antes de aplicarla.</div>
    </div>}
    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
      <Check label="Cargado" checked={plan.cargado} disabled={!puedeGestionar || guardando === `planes_comedor-${plan.id}-cargado`} onChange={v => cambiarEstado(plan.id, 'cargado', v)} />
      <Check label="Pagado" checked={plan.pagado} disabled={!puedeGestionar || !plan.cargado || guardando === `planes_comedor-${plan.id}-pagado`} onChange={v => cambiarEstado(plan.id, 'pagado', v)} />
      {plan.pagado ? <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>✓ {plan.tipo === 'desayuno' ? 'Desayuno' : 'Comida'} pagado de forma independiente.</span> : <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>⚠️ {plan.tipo === 'desayuno' ? 'Desayuno' : 'Comida'} pendiente de pago.</span>}
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

function DetallePendientes({ rows, cambiarEstado, guardando }) { return <div style={{ marginTop:'1rem' }}><h3 style={{fontSize:'0.95rem'}}>Pendientes por liquidar</h3>{rows.length===0 ? <p style={{color:'var(--ink-muted)'}}>No hay conceptos pendientes.</p> : rows.map(e => <div key={e.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'0.7rem',padding:'0.65rem 0',borderTop:'1px solid var(--border)'}}><div><strong>🏫 Estancia · {e.horaEntrada ? formatoFecha(e.horaEntrada) : '—'}</strong><div style={{fontSize:'0.76rem',color:'var(--ink-muted)'}}>{e.horaEntrada ? formatoHora(e.horaEntrada) : ''} → {e.horaSalida ? formatoHora(e.horaSalida) : ''} · {dinero(e.costo)}</div><div style={{color:'#a16207',fontSize:'0.76rem',fontWeight:800}}>⚠️ Pago pendiente</div></div><button className="btn btn-primary btn-small" onClick={()=>cambiarEstado('estancias',e.id,'pagado',true)} disabled={guardando===`estancias-${e.id}-pagado`}>Pagar</button></div>)}</div> }

function DetalleEstancia({ rows, cambiarEstado, guardando }) { return <div style={{ marginTop: '1rem' }}><h3 style={{ fontSize: '0.95rem' }}>Detalle de estancia</h3>{rows.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>Sin estancias cerradas.</p> : rows.map(e => e.ajusteAcuerdo ? <div key={e.id} style={{ padding: '0.65rem 0', borderTop: '1px solid var(--border)' }}><strong>{e.horaEntrada ? formatoFecha(e.horaEntrada) : '—'}</strong><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>{e.horaEntrada ? formatoHora(e.horaEntrada) : '—'} → {e.horaSalida ? formatoHora(e.horaSalida) : '—'} · {e.minutos || 0} min · {dinero(0)}{e.costoOriginal ? ` (original ${dinero(e.costoOriginal)})` : ''}</div><div style={{ fontSize: '0.76rem', fontWeight: 700 }}>🤝 Ajuste acuerdo · solo historial, sin acciones de caja</div></div> : <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.8rem', alignItems: 'center', padding: '0.65rem 0', borderTop: '1px solid var(--border)' }}><div><strong>{e.horaEntrada ? formatoFecha(e.horaEntrada) : '—'}</strong><div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>{e.horaEntrada ? formatoHora(e.horaEntrada) : '—'} → {e.horaSalida ? formatoHora(e.horaSalida) : '—'} · {e.minutos || 0} min · {dinero(e.costo)}</div></div><Check label="Cargado" checked={e.cargado} disabled={guardando === `estancias-${e.id}-cargado`} onChange={v => cambiarEstado('estancias', e.id, 'cargado', v)} /><Check label="Pagado" checked={e.pagado} disabled={!e.cargado || guardando === `estancias-${e.id}-pagado`} onChange={v => cambiarEstado('estancias', e.id, 'pagado', v)} />{e.metodoPago && METODOS_PAGO_ESTANCIA[e.metodoPago] && <div style={{ gridColumn: '1 / -1', fontSize: '0.76rem', fontWeight: 700 }}>{METODOS_PAGO_ESTANCIA[e.metodoPago].icono} Pagado en {METODOS_PAGO_ESTANCIA[e.metodoPago].etiqueta} desde Estancia{e.corteId ? ' · ya incluido en un corte' : ' · pendiente de corte'}</div>}</div>)}</div> }
