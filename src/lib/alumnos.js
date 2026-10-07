import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { PERMISO_ADMIN } from './permisos'

/** Valor especial de plantel: el usuario ve todos los planteles. */
export const PLANTEL_TODOS = '*'

/** Minúsculas y sin acentos, para comparar textos sin importar cómo se escribieron. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export async function listarAlumnosActivos() {
  const q = query(collection(db, 'alumnos'), where('activo', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** ¿El usuario puede ver todos los planteles? (administrador o plantel "*"). */
export function puedeVerTodosLosPlanteles(user) {
  return Boolean(user?.permisos?.includes(PERMISO_ADMIN) || user?.plantel === PLANTEL_TODOS)
}

/** ¿El usuario no es admin y no tiene plantel asignado? Entonces no ve alumnos. */
export function sinPlantelAsignado(user) {
  return !puedeVerTodosLosPlanteles(user) && !String(user?.plantel || '').trim()
}

/** Deja solo los alumnos del plantel del usuario. */
export function filtrarPorPlantel(alumnos, user) {
  if (puedeVerTodosLosPlanteles(user)) return alumnos
  const mio = normalizar(user?.plantel)
  if (!mio) return []
  return alumnos.filter((a) => normalizar(a.plantel) === mio)
}

/** Lista de planteles distintos (ordenados) a partir de una lista de alumnos. */
export function plantelesDe(alumnos) {
  return Array.from(new Set(alumnos.map((a) => String(a.plantel || '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es')
  )
}

export async function listarPlanteles() {
  return plantelesDe(await listarAlumnosActivos())
}

/** "Primaria · 3° A" — nivel, grado y grupo en una sola línea. */
export function gradoGrupo(a) {
  return [a?.nivel, [a?.grado, a?.grupo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

/** "Plantel Norte · Primaria · 3° A · 12345" — descripción corta y uniforme del alumno. */
export function descripcionAlumno(a, { matricula = true } = {}) {
  if (!a) return ''
  return [a.plantel, gradoGrupo(a), matricula ? a.matricula : '']
    .filter(Boolean)
    .join(' · ')
}

export function filtrarAlumnos(alumnos, texto) {
  const t = normalizar(texto)
  if (!t) return []
  return alumnos
    .filter(
      (a) =>
        normalizar(a.nombre).includes(t) ||
        normalizar(a.matricula).includes(t) ||
        normalizar(a.grupo).includes(t) ||
        normalizar(a.tutor).includes(t)
    )
    .slice(0, 15)
}
