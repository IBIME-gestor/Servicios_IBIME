import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'
import { calcularCostoEstancia, calcularMinutosEstancia, configParaEstancia, horaInicioPorNivel, obtenerConfigEstancia } from './pricing'
import { subirArchivoADrive } from './googleDrive'

/** Registra la llegada de un alumno a estancia (abre el registro). */
export async function iniciarEstancia({ alumno, registradoPor, horaEntrada = null, retroactivo = false }) {
  // Según el nivel del alumno se define desde qué hora corre su estancia.
  const config = await obtenerConfigEstancia()
  const ref = await addDoc(collection(db, 'estancias'), {
    alumnoId: alumno.id,
    alumnoNombre: alumno.nombre,
    alumnoGrupo: alumno.grupo || '',
    alumnoNivel: alumno.nivel || '',
    horaInicioConteo: horaInicioPorNivel(alumno.nivel, config),
    horaEntrada: horaEntrada ? Timestamp.fromDate(horaEntrada) : serverTimestamp(),
    horaSalida: null,
    minutos: null,
    costo: null,
    cargado: false,
    pagado: false,
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
 * Marca una estancia cerrada como pagada desde el módulo de Estancia.
 * Con `ajusteAcuerdo` el importe pasa a $0 (el original se conserva en
 * costoOriginal), no se pide método de pago y NO entra a acciones de Caja
 * ni al corte: solo queda en el historial.
 */
export async function marcarEstanciaPagada({ estanciaId, usuario, metodoPago = null, ajusteAcuerdo = false }) {
  const ref = doc(db, 'estancias', estanciaId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La estancia ya no existe.')
  const data = snap.data()
  if (!data.horaSalida) throw new Error('No se puede registrar el pago mientras la estancia siga abierta.')
  if (data.pagado) return { ...data, pagado: true }

  const base = { pagado: true, cargado: true, pagadoPor: usuario || 'usuario', fechaPagado: serverTimestamp() }
  if (ajusteAcuerdo) {
    const cambios = {
      ...base,
      ajusteAcuerdo: true,
      costoOriginal: Number(data.costo || 0),
      costo: 0,
      metodoPago: 'ajuste_acuerdo',
    }
    await updateDoc(ref, cambios)
    return { ...data, ...cambios }
  }
  await updateDoc(ref, { ...base, ...(metodoPago ? { metodoPago } : {}) })
  return { ...data, pagado: true, metodoPago }
}
