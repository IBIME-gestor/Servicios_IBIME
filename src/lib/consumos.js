import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'

export async function registrarConsumo({ alumno, tipo, registradoPor, fechaServicio = null, retroactivo = false }) {
  await addDoc(collection(db, 'consumos'), {
    alumnoId: alumno.id,
    alumnoNombre: alumno.nombre,
    alumnoGrupo: alumno.grupo || '',
    tipo, // 'desayuno' | 'comida'
    fecha: fechaServicio ? Timestamp.fromDate(fechaServicio) : serverTimestamp(),
    // Auditoría: cuándo se hizo realmente la captura.
    capturadoEn: serverTimestamp(),
    registradoPor,
    retroactivo: Boolean(retroactivo),
  })
}

/** Consumos de un alumno en la semana actual, más recientes primero. */
export async function consumosSemanaAlumno(alumnoId) {
  const { inicio, fin } = rangoSemanaActual()
  const q = query(
    collection(db, 'consumos'),
    where('alumnoId', '==', alumnoId),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate() }))
}

/** Todos los consumos de la semana actual (para el concentrado de Caja). */
export async function consumosSemanaTodos() {
  const { inicio, fin } = rangoSemanaActual()
  const q = query(
    collection(db, 'consumos'),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate() }))
}
