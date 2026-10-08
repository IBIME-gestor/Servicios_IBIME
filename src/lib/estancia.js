import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'
import { calcularCostoEstancia, calcularMinutosEstancia, configParaEstancia, horaInicioPorNivel, obtenerConfigEstancia } from './pricing'
import { subirArchivoADrive } from './googleDrive'
import { registrarLog } from './log'

/** Métodos de pago que se cobran directo en Estancia (fuera de Caja) y entran al corte. */
export const METODOS_PAGO_ESTANCIA = {
  efectivo: { clave: 'efectivo', etiqueta: 'Efectivo', icono: '💵' },
  tarjeta: { clave: 'tarjeta', etiqueta: 'Tarjeta', icono: '💳' },
}
export const TIPOS_TARJETA = {
  debito: { clave: 'debito', etiqueta: 'Débito' },
  credito: { clave: 'credito', etiqueta: 'Crédito' },
}
/** Cometa ya no se ofrece, pero hay cobros históricos registrados con ese método. */
const METODO_HISTORICO_COMETA = 'cometa'

/** ¿Este método de pago entra al corte? (incluye el histórico "cometa"). */
export const metodoEntraAlCorte = (m) => Boolean(METODOS_PAGO_ESTANCIA[m]) || m === METODO_HISTORICO_COMETA
/** ¿Se cobró con tarjeta? (los históricos de Cometa se agrupan aquí en los totales). */
export const esPagoConTarjeta = (m) => m === 'tarjeta' || m === METODO_HISTORICO_COMETA

/** Texto corto del pago: "Efectivo", "Tarjeta débito · BBVA ···· 1234", "Cometa (histórico)". */
export function describirPago(reg) {
  const m = reg?.metodoPago
  if (m === 'efectivo') return 'Efectivo'
  if (m === 'tarjeta') {
    const t = reg.tarjeta || {}
    const tipo = TIPOS_TARJETA[t.tipo || reg.tarjetaTipo]?.etiqueta
    const detalle = [t.banco, t.ultimos4 ? `···· ${t.ultimos4}` : ''].filter(Boolean).join(' ')
    return ['Tarjeta', tipo ? tipo.toLowerCase() : '', detalle ? `· ${detalle}` : ''].filter(Boolean).join(' ')
  }
  if (m === METODO_HISTORICO_COMETA) return 'Cometa (histórico)'
  if (m === 'ajuste_acuerdo') return 'Ajuste acuerdo'
  return ''
}

/** Valida los datos de la tarjeta; devuelve el mensaje de error o '' si todo está bien. */
export function validarTarjeta(t) {
  if (!TIPOS_TARJETA[t?.tipo]) return 'Elige si la tarjeta es de débito o de crédito.'
  if (!String(t.banco || '').trim()) return 'Captura el banco de la tarjeta.'
  if (!/^\d{4}$/.test(String(t.ultimos4 || ''))) return 'Captura los últimos 4 dígitos de la tarjeta.'
  if (!String(t.titular || '').trim()) return 'Captura el nombre del titular de la tarjeta.'
  return ''
}

/** Registra la llegada de un alumno a estancia (abre el registro). */
export async function iniciarEstancia({ alumno, registradoPor, horaEntrada = null, retroactivo = false }) {
  // Según el plantel y nivel del alumno se define desde qué hora corre su estancia.
  const config = await obtenerConfigEstancia()
  const ref = await addDoc(collection(db, 'estancias'), {
    alumnoId: alumno.id,
    alumnoNombre: alumno.nombre,
    alumnoGrupo: alumno.grupo || '',
    alumnoNivel: alumno.nivel || '',
    alumnoPlantel: alumno.plantel || '',
    horaInicioConteo: horaInicioPorNivel(alumno.nivel, config, alumno.plantel),
    horaEntrada: horaEntrada ? Timestamp.fromDate(horaEntrada) : serverTimestamp(),
    horaSalida: null,
    minutos: null,
    costo: null,
    cargado: false,
    pagado: false,
    pendiente: false,
    retiroPendiente: false,
    retiradoPor: null,
    firmaUrl: null,
    registradoPor,
    capturadoEn: serverTimestamp(),
    retroactivo: Boolean(retroactivo),
  })
  return ref.id
}

/** Estancias abiertas (alumnos que siguen dentro), para la lista de la nani. */
export async function estanciasActivas() {
  const q = query(collection(db, 'estancias'), where('horaSalida', '==', null), orderBy('horaEntrada', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), horaEntrada: d.data().horaEntrada?.toDate() }))
}

/** Registros de estancia capturados durante un día, abiertos o cerrados. */
export async function estanciasDelDia(fecha = new Date()) {
  const inicio = new Date(fecha)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(fecha)
  fin.setHours(23, 59, 59, 999)
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
    horaEntrada: d.data().horaEntrada?.toDate(),
    horaSalida: d.data().horaSalida?.toDate?.() || null,
  }))
}

/**
 * Cierra una estancia: calcula minutos y costo según la configuración
 * vigente, sube la firma a Drive (si se capturó) y guarda todo.
 */
export async function finalizarEstancia({ estanciaId, retiradoPor, firmaBlob, horaSalida = null, retroactivo = false }) {
  const ref = doc(db, 'estancias', estanciaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La estancia ya no existe.')
  const data = snap.data()

  const horaEntrada = data.horaEntrada.toDate()
  const ahora = horaSalida || new Date()
  const config = await obtenerConfigEstancia()
  const minutos = calcularMinutosEstancia(horaEntrada, ahora, configParaEstancia(data, config))
  if (minutos < 0) throw new Error('La hora de retiro no puede ser anterior a la hora de entrada.')
  const { costo, desglose } = calcularCostoEstancia(minutos, config)

  let firmaUrl = data.firmaUrl || null
  if (firmaBlob) {
    const nombreArchivo = `firma_${data.alumnoNombre.replace(/\s+/g, '_')}_${ahora.toISOString().slice(0, 10)}_${estanciaId}.png`
    const subida = await subirArchivoADrive(firmaBlob, nombreArchivo)
    firmaUrl = subida.webViewLink
  }

  await updateDoc(ref, {
    horaSalida: horaSalida ? Timestamp.fromDate(horaSalida) : serverTimestamp(),
    minutos,
    costo,
    desgloseCosto: desglose,
    retiradoPor,
    firmaUrl,
    capturadoEn: data.capturadoEn || serverTimestamp(),
    retroactivo: Boolean(retroactivo || data.retroactivo),
  })

  return { minutos, costo, desglose }
}

/** Estancias de un alumno en la semana actual (para su ficha en Caja). */
export async function estanciasSemanaAlumno(alumnoId) {
  const { inicio, fin } = rangoSemanaActual()
  const q = query(
    collection(db, 'estancias'),
    where('alumnoId', '==', alumnoId),
    where('horaEntrada', '>=', Timestamp.fromDate(inicio)),
    where('horaEntrada', '<=', Timestamp.fromDate(fin)),
    orderBy('horaEntrada', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    horaEntrada: d.data().horaEntrada?.toDate(),
    horaSalida: d.data().horaSalida?.toDate() || null,
  }))
}

/** Todas las estancias cerradas de la semana actual (para el concentrado de Caja). */
export async function estanciasSemanaTodas() {
  const { inicio, fin } = rangoSemanaActual()
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
    horaEntrada: d.data().horaEntrada?.toDate(),
    horaSalida: d.data().horaSalida?.toDate() || null,
  }))
}


/**
 * Corta el tiempo de una estancia SIN pedir firma ni nombre (para quien está
 * formado). Calcula minutos y costo al momento, y deja el registro marcado con
 * `retiroPendiente` para completar firma y pago cuando llegue al mostrador.
 */
export async function cortarTiempoEstancia({ estanciaId, usuario }) {
  const ref = doc(db, 'estancias', estanciaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La estancia ya no existe.')
  const data = snap.data()
  if (data.horaSalida) throw new Error('A esta estancia ya se le cortó el tiempo.')

  const ahora = new Date()
  const config = await obtenerConfigEstancia()
  const minutos = calcularMinutosEstancia(data.horaEntrada.toDate(), ahora, configParaEstancia(data, config))
  const { costo, desglose } = calcularCostoEstancia(minutos, config)

  await updateDoc(ref, {
    horaSalida: Timestamp.fromDate(ahora),
    minutos,
    costo,
    desgloseCosto: desglose,
    retiroPendiente: true,
    tiempoCortadoPor: usuario || 'usuario',
    capturadoEn: data.capturadoEn || serverTimestamp(),
  })
  return { minutos, costo, desglose }
}

/**
 * Completa una salida que ya tenía el tiempo cortado: guarda quién retira y la
 * firma. NO recalcula tiempo ni costo (quedan los del momento del corte).
 */
export async function completarSalidaEstancia({ estanciaId, retiradoPor, firmaBlob }) {
  const ref = doc(db, 'estancias', estanciaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La estancia ya no existe.')
  const data = snap.data()
  if (!data.horaSalida) throw new Error('Esta estancia sigue abierta; usa "Dar salida".')

  let firmaUrl = data.firmaUrl || null
  if (firmaBlob) {
    const nombreArchivo = `firma_${data.alumnoNombre.replace(/\s+/g, '_')}_${data.horaSalida.toDate().toISOString().slice(0, 10)}_${estanciaId}.png`
    const subida = await subirArchivoADrive(firmaBlob, nombreArchivo)
    firmaUrl = subida.webViewLink
  }
  await updateDoc(ref, { retiradoPor, firmaUrl, retiroPendiente: false })
  return { minutos: data.minutos, costo: data.costo, desglose: data.desgloseCosto || '' }
}

/** Estancias con el tiempo cortado pero con firma/retiro todavía sin completar (de cualquier día). */
export async function estanciasRetiroPendiente() {
  const q = query(collection(db, 'estancias'), where('retiroPendiente', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    horaEntrada: d.data().horaEntrada?.toDate(),
    horaSalida: d.data().horaSalida?.toDate?.() || null,
  }))
}

/**
 * El papá no pagó por ahora: deja el concepto abierto como "Pendiente".
 * Reaparece en el cobro la próxima vez que el alumno vaya a pagar.
 */
export async function marcarEstanciaPendiente({ estanciaId, usuario }) {
  const ref = doc(db, 'estancias', estanciaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La estancia ya no existe.')
  const data = snap.data()
  if (!data.horaSalida) throw new Error('Primero hay que dar salida a la estancia.')
  if (data.pagado) throw new Error('Esta estancia ya está pagada.')
  await updateDoc(ref, { pendiente: true, pendienteDesde: serverTimestamp(), pendientePor: usuario || 'usuario' })
}

/** Conceptos de estancia que el alumno dejó "Pendiente" en días anteriores (sin pagar). */
export async function estanciasPendientesAlumno(alumnoId) {
  const q = query(collection(db, 'estancias'), where('alumnoId', '==', alumnoId), where('pendiente', '==', true))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      horaEntrada: d.data().horaEntrada?.toDate?.() || null,
      horaSalida: d.data().horaSalida?.toDate?.() || null,
    }))
    .filter((e) => e.horaSalida && !e.pagado)
    .sort((a, b) => (a.horaEntrada?.getTime() || 0) - (b.horaEntrada?.getTime() || 0))
}

/**
 * Registra el pago de uno o varios conceptos de estancia de una sola vez
 * (el consumo actual y/o pendientes anteriores). Todos comparten método de pago.
 *
 * - metodoPago: 'efectivo' | 'tarjeta'
 * - tarjeta: { tipo: 'debito'|'credito', banco, ultimos4, titular, titularEsQuienRecoge }
 * - ajusteAcuerdo: el importe pasa a $0 (el original se conserva en costoOriginal),
 *   sin método de pago y sin entrar al corte.
 *
 * Solo se guardan banco, últimos 4 dígitos y titular; nunca el número completo.
 */
export async function pagarEstancias({ estanciaIds, usuario, metodoPago = null, tarjeta = null, ajusteAcuerdo = false }) {
  if (!estanciaIds?.length) throw new Error('Selecciona al menos un concepto para pagar.')
  if (!ajusteAcuerdo) {
    if (!METODOS_PAGO_ESTANCIA[metodoPago]) throw new Error('Elige el método de pago.')
    if (metodoPago === 'tarjeta') {
      const err = validarTarjeta(tarjeta)
      if (err) throw new Error(err)
    }
  }

  const refs = estanciaIds.map((id) => doc(db, 'estancias', id))
  const snaps = await Promise.all(refs.map((r) => getDoc(r)))
  const pagoGrupoId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const lote = writeBatch(db)
  const pagados = []

  snaps.forEach((snap, i) => {
    if (!snap.exists()) throw new Error('Uno de los conceptos ya no existe.')
    const data = snap.data()
    if (!data.horaSalida) throw new Error(`${data.alumnoNombre}: no se puede registrar el pago mientras la estancia siga abierta.`)
    if (data.pagado) return

    const base = {
      pagado: true,
      cargado: true,
      pendiente: false,
      pagadoPor: usuario || 'usuario',
      fechaPagado: serverTimestamp(),
      pagoGrupoId,
    }
    let cambios
    if (ajusteAcuerdo) {
      cambios = { ...base, ajusteAcuerdo: true, costoOriginal: Number(data.costo || 0), costo: 0, metodoPago: 'ajuste_acuerdo' }
    } else if (metodoPago === 'tarjeta') {
      const t = {
        tipo: tarjeta.tipo,
        banco: String(tarjeta.banco).trim(),
        ultimos4: String(tarjeta.ultimos4),
        titular: String(tarjeta.titular).trim(),
        titularEsQuienRecoge: Boolean(tarjeta.titularEsQuienRecoge),
      }
      cambios = { ...base, metodoPago: 'tarjeta', tarjeta: t, tarjetaTipo: t.tipo }
    } else {
      cambios = { ...base, metodoPago: 'efectivo' }
    }
    lote.update(refs[i], cambios)
    pagados.push({ id: estanciaIds[i], costo: Number(data.costo || 0), costoOriginal: Number(data.costo || 0), cambios })
  })

  if (pagados.length === 0) return { pagados: [], pagoGrupoId }
  await lote.commit()
  return { pagados, pagoGrupoId }
}

const aFecha = (v) => (v?.toDate ? v.toDate() : v || null)

/**
 * Estancias pagadas en efectivo o con tarjeta que todavía no se incluyen en un corte.
 * Los "Ajuste acuerdo" (importe $0, sin método de pago) nunca entran.
 */
export async function estanciasPendientesDeCorte() {
  const q = query(collection(db, 'estancias'), where('pagado', '==', true))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        ...x,
        horaEntrada: aFecha(x.horaEntrada),
        horaSalida: aFecha(x.horaSalida),
        fechaPagado: aFecha(x.fechaPagado),
      }
    })
    .filter((e) => !e.ajusteAcuerdo && !e.corteId && metodoEntraAlCorte(e.metodoPago))
    .sort((a, b) => (a.fechaPagado?.getTime() || 0) - (b.fechaPagado?.getTime() || 0))
}

/** Registra el corte y marca cada estancia incluida con corteId/corteEn. */
export async function crearCorteEstancia({ estancias, usuarioEmail, usuarioNombre, plantel }) {
  if (!estancias?.length) throw new Error('No hay cobros para el corte.')
  const monto = (e) => Number(e.costo) || 0
  const suma = (lista) => lista.reduce((t, e) => t + monto(e), 0)
  const efectivo = estancias.filter((e) => e.metodoPago === 'efectivo')
  const tarjeta = estancias.filter((e) => esPagoConTarjeta(e.metodoPago))
  const debito = tarjeta.filter((e) => (e.tarjeta?.tipo || e.tarjetaTipo) === 'debito')
  const credito = tarjeta.filter((e) => (e.tarjeta?.tipo || e.tarjetaTipo) === 'credito')

  const corteRef = await addDoc(collection(db, 'cortes_estancia'), {
    creadoEn: serverTimestamp(),
    creadoPor: usuarioEmail || 'usuario',
    creadoPorNombre: usuarioNombre || usuarioEmail || 'usuario',
    plantel: plantel || '',
    cantidad: estancias.length,
    total: suma(estancias),
    totalEfectivo: suma(efectivo),
    totalTarjeta: suma(tarjeta),
    totalDebito: suma(debito),
    totalCredito: suma(credito),
    detalle: estancias.map((e) => ({
      id: e.id,
      alumno: e.alumnoNombre || '',
      metodoPago: e.metodoPago,
      tarjetaTipo: e.tarjeta?.tipo || e.tarjetaTipo || null,
      banco: e.tarjeta?.banco || null,
      ultimos4: e.tarjeta?.ultimos4 || null,
      titular: e.tarjeta?.titular || null,
      costo: monto(e),
      fechaPagado: e.fechaPagado ? new Date(e.fechaPagado).toISOString() : null,
    })),
  })

  registrarLog({
    user: { email: usuarioEmail, nombre: usuarioNombre },
    accion: 'estancia.corte', modulo: 'estancia', entidad: 'cortes_estancia', entidadId: corteRef.id,
    detalle: { plantel: plantel || '', cantidad: estancias.length, total: suma(estancias), efectivo: suma(efectivo), tarjeta: suma(tarjeta), debito: suma(debito), credito: suma(credito) },
  })

  // Firestore permite 500 escrituras por lote.
  for (let i = 0; i < estancias.length; i += 400) {
    const lote = writeBatch(db)
    estancias.slice(i, i + 400).forEach((e) => {
      lote.update(doc(db, 'estancias', e.id), { corteId: corteRef.id, corteEn: serverTimestamp() })
    })
    await lote.commit()
  }
  return corteRef.id
}

/** Últimos cortes hechos, del más reciente al más antiguo. */
export async function listarCortesEstancia(max = 30) {
  const q = query(collection(db, 'cortes_estancia'), orderBy('creadoEn', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), creadoEn: aFecha(d.data().creadoEn) }))
}
