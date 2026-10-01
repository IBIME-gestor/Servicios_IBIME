import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const DEFAULT_CALENDARIO = { vacaciones: [] }

export async function obtenerCalendario() {
  const snap = await getDoc(doc(db, 'config', 'calendario'))
  return snap.exists() ? { ...DEFAULT_CALENDARIO, ...snap.data() } : DEFAULT_CALENDARIO
}

export async function guardarCalendario(data) {
  await setDoc(doc(db, 'config', 'calendario'), {
    vacaciones: Array.isArray(data.vacaciones) ? data.vacaciones : [],
  }, { merge: true })
}

export function normalizarFechaLocal(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function fechaISO(date) {
  const d = normalizarFechaLocal(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function esDiaHabil(date, vacaciones = []) {
  const d = normalizarFechaLocal(date)
  const dia = d.getDay()
  if (dia === 0 || dia === 6) return false
  return !vacaciones.includes(fechaISO(d))
}

export function contarDiasHabiles(inicio, fin, vacaciones = []) {
  let total = 0
  const d = normalizarFechaLocal(inicio)
  const ultimo = normalizarFechaLocal(fin)
  while (d <= ultimo) {
    if (esDiaHabil(d, vacaciones)) total += 1
    d.setDate(d.getDate() + 1)
  }
  return total
}

export function rangoMes(date = new Date()) {
  const d = normalizarFechaLocal(date)
  return {
    inicio: new Date(d.getFullYear(), d.getMonth(), 1),
    fin: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}
