import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'

/** Clave estable de la semana actual, ej. "2026-09-14" (el lunes de esa semana). */
export function claveSemanaActual() {
  return rangoSemanaActual().inicio.toISOString().slice(0, 10)
}

function idCobro(alumnoId) {
  return `${claveSemanaActual()}_${alumnoId}`
}

export async function obtenerCobroAlumno(alumnoId) {
  const snap = await getDoc(doc(db, 'cobros_semana', idCobro(alumnoId)))
  return snap.exists() ? snap.data() : { capturado: false, pagado: false }
}

/**
 * Marca (o desmarca) el cobro de un alumno como capturado. Al marcarlo por
 * primera vez, guarda una "foto" de los montos de esa semana (aunque luego
 * cambien los precios, el registro histórico no se mueve).
 */
export async function marcarCapturado({ alumno, capturado, totalCafeteria, totalEstancia, usuario }) {
  await setDoc(
    doc(db, 'cobros_semana', idCobro(alumno.id)),
    {
      alumnoId: alumno.id,
      alumnoNombre: alumno.nombre,
      semana: claveSemanaActual(),
      capturado,
      totalCafeteria,
      totalEstancia,
      totalGeneral: totalCafeteria + totalEstancia,
      capturadoPor: usuario,
      fechaCapturado: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function marcarPagado({ alumnoId, pagado, usuario }) {
  await setDoc(
    doc(db, 'cobros_semana', idCobro(alumnoId)),
    { pagado, pagadoPor: usuario, fechaPagado: serverTimestamp() },
    { merge: true }
  )
}

/** Todos los registros de cobro de la semana actual (para el panel de Pagos). */
export async function listarCobrosSemana() {
  const q = query(collection(db, 'cobros_semana'), where('semana', '==', claveSemanaActual()))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
