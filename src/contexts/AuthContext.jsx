import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { PERMISO_ADMIN, PERMISOS_COLABORADOR } from '../lib/permisos'

// Dominio de Google Workspace del colegio, ej. "colegioibime.edu.mx".
// Cualquier cuenta fuera de este dominio se rechaza aunque tenga sesión
// válida de Google, para que no entre cualquiera con Gmail personal.
const DOMINIO_PERMITIDO = import.meta.env.VITE_WORKSPACE_DOMAIN

// Correos que entran como administrador automáticamente la primera vez
// que inician sesión (sin que nadie tenga que editarlos a mano en
// Firestore). Varios correos separados por coma, ej.
// VITE_ADMIN_EMAILS=direccion@colegio.edu.mx,sistemas@colegio.edu.mx
const CORREOS_ADMIN = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // { uid, email, nombre, permisos: string[] }
  const [loading, setLoading] = useState(true)
  const [errorDominio, setErrorDominio] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null)
        setLoading(false)
        return
      }

      // Verificación de dominio también en el cliente (además del `hd` que
      // ya filtra en la pantalla de Google, por si alguien intenta forzarlo).
      const dominioCuenta = fbUser.email.split('@')[1]
      if (DOMINIO_PERMITIDO && dominioCuenta !== DOMINIO_PERMITIDO) {
        await signOut(auth)
        setErrorDominio(`Solo cuentas @${DOMINIO_PERMITIDO} pueden entrar.`)
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const perfilRef = doc(db, 'usuarios', fbUser.uid)
        const perfilSnap = await getDoc(perfilRef)
        const esAdminPorCorreo = CORREOS_ADMIN.includes(fbUser.email.toLowerCase())

        if (!perfilSnap.exists()) {
          // Primera vez que esta persona entra: admin automático si su
          // correo está en VITE_ADMIN_EMAILS; si no, colaborador (solo ver
          // alumnos). El administrador puede ajustarle permisos después.
          const permisosIniciales = esAdminPorCorreo ? [PERMISO_ADMIN] : PERMISOS_COLABORADOR
          await setDoc(perfilRef, {
            nombre: fbUser.displayName || fbUser.email,
            email: fbUser.email,
            permisos: permisosIniciales,
            activo: true,
            creado: serverTimestamp(),
          })
          setUser({ uid: fbUser.uid, email: fbUser.email, nombre: fbUser.displayName || fbUser.email, permisos: permisosIniciales })
        } else {
          const perfil = perfilSnap.data()
          if (perfil.activo === false) {
            await signOut(auth)
            setErrorDominio('Tu cuenta fue desactivada por el administrador.')
            setUser(null)
            setLoading(false)
            return
          }
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            nombre: perfil.nombre || fbUser.displayName || fbUser.email,
            permisos: perfil.permisos || PERMISOS_COLABORADOR,
          })
        }
      } catch (err) {
        console.error('Error leyendo/creando perfil de usuario:', err)
        setUser({ uid: fbUser.uid, email: fbUser.email, nombre: fbUser.email, permisos: [] })
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const loginConGoogle = () => {
    const provider = new GoogleAuthProvider()
    // Restringe la propia pantalla de selección de cuenta de Google al dominio,
    // así la mayoría de la gente ni siquiera ve su cuenta personal como opción.
    if (DOMINIO_PERMITIDO) provider.setCustomParameters({ hd: DOMINIO_PERMITIDO })
    return signInWithPopup(auth, provider)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, loginConGoogle, logout, errorDominio, setErrorDominio }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
