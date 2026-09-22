import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Trae todos los alumnos activos. Para el tamaño típico de un plantel
 * (cientos a pocos miles de alumnos) es más simple y rápido traer todo y
 * filtrar en el cliente que armar búsquedas parciales en Firestore.
 */
export async function listarAlumnosActivos() {
  const q = query(collection(db, 'alumnos'), where('activo', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function filtrarAlumnos(alumnos, texto) {
  const t = texto.trim().toLowerCase()
  if (!t) return []
  return alumnos
    .filter(
      (a) =>
        a.nombre?.toLowerCase().includes(t) ||
        a.matricula?.toLowerCase().includes(t) ||
        a.grupo?.toLowerCase().includes(t)
    )
    .slice(0, 15)
}
