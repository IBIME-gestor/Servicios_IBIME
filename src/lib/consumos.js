import { collection, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'
import { obtenerConfigComedor, calcularTotalComedor } from './pricingComedor'

export async function existeConsumoDelDia({ alumnoId, tipo, fechaServicio = null }) {
  const fecha = fechaServicio || new Date()
  const inicio = new Date(fecha)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(fecha)
  fin.setHours(23, 59, 59, 999)

  // Evitamos una consulta compuesta adicional de Firestore: filtramos el día
  // en memoria después de traer los consumos del alumno y tipo.
  const q = query(
    collection(db, 'consumos'),
    where('alumnoId', '==', alumnoId),
    where('tipo', '==', tipo),
  )
  const snap = await getDocs(q)
  return snap.docs.some((doc) => {
    const fecha = doc.data().fecha?.toDate?.()
    return fecha && fecha >= inicio && fecha <= fin
  })
}

export async function registrarConsumo({ alumno, tipo, registradoPor, fechaServicio = null, retroactivo = false }) {
  // La clave del documento hace que la operación sea idempotente:
  // un alumno solo puede tener un desayuno y una comida por día, incluso
  // si se hacen dos clics casi simultáneos o dos terminales intentan capturarlo.
  const fecha = fechaServicio ? new Date(fechaServicio) : new Date()
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  const claveDia = `${y}-${m}-${d}`
  const id = `${alumno.id}_${tipo}_${claveDia}`
  const ref = doc(db, 'consumos', id)

  const config = await obtenerConfigComedor()
  const costo = tipo === 'desayuno' ? config.precioDesayuno : config.precioComida

  const creado = await runTransaction(db, async (transaction) => {
    const existente = await transaction.get(ref)
    if (existente.exists()) return false

    transaction.set(ref, {
      alumnoId: alumno.id,
      alumnoNombre: alumno.nombre,
      alumnoGrupo: alumno.grupo || '',
      tipo,
      costo,
      cargado: false,
      pagado: false,
      fecha: Timestamp.fromDate(fecha),
      capturadoEn: serverTimestamp(),
      registradoPor,
      retroactivo: Boolean(retroactivo),
    })
    return true
  })

  return { creado, duplicado: !creado }
}

export async function consumosSemanaAlumno(alumnoId) {
  const { inicio, fin } = rangoSemanaActual()
  const q = query(collection(db, 'consumos'), where('alumnoId', '==', alumnoId), where('fecha', '>=', Timestamp.fromDate(inicio)), where('fecha', '<=', Timestamp.fromDate(fin)), orderBy('fecha', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate() }))
}

export async function consumosSemanaTodos() {
  const { inicio, fin } = rangoSemanaActual()
  const q = query(collection(db, 'consumos'), where('fecha', '>=', Timestamp.fromDate(inicio)), where('fecha', '<=', Timestamp.fromDate(fin)), orderBy('fecha', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate() }))
}

export function costoConsumo(consumo, config) {
  if (Number.isFinite(Number(consumo?.costo))) return Number(consumo.costo)
  return calcularTotalComedor([consumo], config).total
}
