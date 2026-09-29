import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'

export const TIPOS_PLAN_COMEDOR = [
  { value: 'desayuno', label: 'Desayuno' },
  { value: 'comida', label: 'Comida' },
]

export async function listarPlanesComedor() {
  const q = query(collection(db, 'catalogo_planes_comedor'), orderBy('nombre'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function crearPlanComedor(data, usuario) {
  return addDoc(collection(db, 'catalogo_planes_comedor'), {
    nombre: data.nombre.trim(),
    tipo: data.tipo,
    monto: Number(data.monto),
    diasHabilesIncluidos: Number(data.diasHabilesIncluidos || 0),
    descripcion: data.descripcion?.trim() || '',
    activo: data.activo !== false,
    creadoPor: usuario || 'usuario',
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
}

export async function actualizarPlanComedor(id, data, usuario) {
  return updateDoc(doc(db, 'catalogo_planes_comedor', id), {
    nombre: data.nombre.trim(),
    tipo: data.tipo,
    monto: Number(data.monto),
    diasHabilesIncluidos: Number(data.diasHabilesIncluidos || 0),
    descripcion: data.descripcion?.trim() || '',
    activo: data.activo !== false,
    actualizadoPor: usuario || 'usuario',
    actualizadoEn: serverTimestamp(),
  })
}

export async function cambiarActivoPlanComedor(id, activo, usuario) {
  return updateDoc(doc(db, 'catalogo_planes_comedor', id), {
    activo: Boolean(activo),
    actualizadoPor: usuario || 'usuario',
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarPlanComedor(id) {
  return deleteDoc(doc(db, 'catalogo_planes_comedor', id))
}
