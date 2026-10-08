import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { rangoSemanaActual } from './fechas'

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

export async function marcarCapturado({ alumno, capturado, totalCafeteria, totalEstancia, usuario }) {
  await setDoc(doc(db, 'cobros_semana', idCobro(alumno.id)), {
    alumnoId: alumno.id,
    alumnoNombre: alumno.nombre,
    semana: claveSemanaActual(),
    capturado,
    totalCafeteria,
    totalEstancia,
    totalGeneral: totalCafeteria + totalEstancia,
    capturadoPor: usuario,
    fechaCapturado: serverTimestamp(),
  }, { merge: true })
}

export async function marcarPagado({ alumnoId, pagado, usuario }) {
  await setDoc(doc(db, 'cobros_semana', idCobro(alumnoId)), {
    pagado, pagadoPor: usuario, fechaPagado: serverTimestamp()
  }, { merge: true })
}

export async function listarCobrosSemana() {
  const q = query(collection(db, 'cobros_semana'), where('semana', '==', claveSemanaActual()))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Marca el estado de cobro de un detalle individual de comedor o estancia. */
export async function marcarDetalleCobro({ coleccion, id, campo, valor, usuario, pago = null }) {
  if (!['cargado', 'pagado'].includes(campo)) throw new Error('Estado de cobro no válido.')
  if (!id || !coleccion) throw new Error('Falta identificar el detalle.')
  const payload = { [campo]: Boolean(valor), [`${campo}Por`]: usuario, [`fecha${campo[0].toUpperCase()}${campo.slice(1)}`]: serverTimestamp() }
  if (campo === 'pagado' && valor && pago) {
    payload.metodoPago = pago.metodoPago
    payload.datosPago = pago.datosPago || null
  }
  if (campo === 'pagado' && !valor) {
    payload.metodoPago = null
    payload.datosPago = null
  }
  await updateDoc(doc(db, coleccion, id), payload)
}
