import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export async function listarUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Guarda permisos y, si se indica, el plantel al que pertenece el usuario. */
export async function actualizarPermisosUsuario(uid, permisos, plantel) {
  const datos = { permisos }
  if (plantel !== undefined) datos.plantel = plantel
  await setDoc(doc(db, 'usuarios', uid), datos, { merge: true })
}

export async function actualizarActivoUsuario(uid, activo) {
  await setDoc(doc(db, 'usuarios', uid), { activo }, { merge: true })
}
