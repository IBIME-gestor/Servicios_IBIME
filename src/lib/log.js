import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { PERMISO_ADMIN } from './permisos'

const fechaDia = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function registrarLog({ user, accion, modulo, entidad = '', entidadId = '', alumno = null, detalle = {} }) {
  try {
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) return
    const id = `${email}__${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const limpio = JSON.parse(JSON.stringify(detalle || {})) // sin undefined
    await setDoc(doc(db, 'log', id), {
      usuarioEmail: email,
      usuarioUid: user?.uid || '',
      usuarioNombre: user?.nombre || '',
      usuarioPlantel: user?.plantel || '',
      usuarioRol: user?.permisos?.includes(PERMISO_ADMIN) ? 'Administrador' : 'Colaborador',
      accion,
      modulo,
      entidad,
      entidadId,
      alumnoId: alumno?.id || alumno?.alumnoId || '',
      alumnoNombre: alumno?.nombre || alumno?.alumnoNombre || '',
      alumnoMatricula: alumno?.matricula || '',
      alumnoPlantel: alumno?.plantel || '',
      alumnoNivel: alumno?.nivel || alumno?.alumnoNivel || '',
      detalle: limpio,
      fechaDia: fechaDia(),
      creadoEn: serverTimestamp(),
      dispositivo: String(navigator?.userAgent || '').slice(0, 200),
    })
  } catch (err) {
    console.warn('No se pudo registrar en la bitácora:', err)
  }
}
