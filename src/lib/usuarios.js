import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export async function listarUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function actualizarPermisosUsuario(uid, permisos) {
  await setDoc(doc(db, 'usuarios', uid), { permisos }, { merge: true })
}

export async function actualizarActivoUsuario(uid, activo) {
  await setDoc(doc(db, 'usuarios', uid), { activo }, { merge: true })
}
