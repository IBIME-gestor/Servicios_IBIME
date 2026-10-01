import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore'
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
  // Un alumno solo puede tener un consumo del mismo tipo por día.
  // La comprobación ocurre antes de guardar para evitar duplicados por doble clic.
  if (await existeConsumoDelDia({ alumnoId: alumno.id, tipo, fechaServicio })) {
    return { creado: false, duplicado: true }
  }

  const config = await obtenerConfigComedor()
  const costo = tipo === 'desayuno' ? config.precioDesayuno : config.precioComida
  await addDoc(collection(db, 'consumos'), {
    alumnoId: alumno.id,
    alumnoNombre: alumno.nombre,
    alumnoGrupo: alumno.grupo || '',
    tipo,
    costo,
    cargado: false,
    pagado: false,
    fecha: fechaServicio ? Timestamp.fromDate(fechaServicio) : serverTimestamp(),
    capturadoEn: serverTimestamp(),
    registradoPor,
    retroactivo: Boolean(retroactivo),
  })
  return { creado: true, duplicado: false }
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
