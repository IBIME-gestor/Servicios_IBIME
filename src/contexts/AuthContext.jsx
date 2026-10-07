import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { PERMISO_ADMIN, PERMISOS_COLABORADOR, normalizarPermisos } from '../lib/permisos'
import { registrarLog } from '../lib/log'

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
  const [user, setUser] = useState(null) // { uid, email, nombre, permisos: string[], plantel: string }
  const [loading, setLoading] = useState(true)
  const [errorDominio, setErrorDominio] = useState('')

  useEffect(() => {
    let unsubPerfil = null

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubPerfil) {
        unsubPerfil()
        unsubPerfil = null
      }

      if (!fbUser) {
        setUser(null)
        setLoading(false)
        return
      }

      setLoading(true)

      const dominioCuenta = (fbUser.email || '').split('@')[1]?.toLowerCase()
      if (DOMINIO_PERMITIDO && dominioCuenta !== DOMINIO_PERMITIDO.toLowerCase()) {
        await signOut(auth)
        setErrorDominio(`Solo cuentas @${DOMINIO_PERMITIDO} pueden entrar.`)
        setUser(null)
        setLoading(false)
        return
      }

      const perfilRef = doc(db, 'usuarios', fbUser.uid)
      const esAdminPorCorreo = CORREOS_ADMIN.includes((fbUser.email || '').toLowerCase())

      try {
        const perfilSnap = await getDoc(perfilRef)

        if (!perfilSnap.exists()) {
          const permisosIniciales = esAdminPorCorreo ? [PERMISO_ADMIN] : [...PERMISOS_COLABORADOR]
          await setDoc(perfilRef, {
            nombre: fbUser.displayName || fbUser.email,
            email: fbUser.email,
            permisos: permisosIniciales,
            activo: true,
            creado: serverTimestamp(),
          })
        }

        // Escucha el perfil en tiempo real. Así, si el administrador asigna
        // caja.ver mientras la persona ya está dentro, su sesión recibe el
        // permiso inmediatamente sin depender de cerrar sesión o borrar caché.
        unsubPerfil = onSnapshot(perfilRef, async (snap) => {
          if (!snap.exists()) {
            setUser(null)
            setLoading(false)
            return
          }

          const perfil = snap.data()
          if (perfil.activo === false) {
            await signOut(auth)
            setErrorDominio('Tu cuenta fue desactivada por el administrador.')
            setUser(null)
            setLoading(false)
            return
          }

          const permisos = normalizarPermisos(perfil.permisos)
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            nombre: perfil.nombre || fbUser.displayName || fbUser.email,
            permisos,
            plantel: perfil.plantel || '',
          })
          setLoading(false)
        }, (err) => {
          console.error('Error escuchando perfil de usuario:', err)
          setUser({ uid: fbUser.uid, email: fbUser.email, nombre: fbUser.email, permisos: [], plantel: '' })
          setLoading(false)
        })
      } catch (err) {
        console.error('Error leyendo/creando perfil de usuario:', err)
        setUser({ uid: fbUser.uid, email: fbUser.email, nombre: fbUser.email, permisos: [], plantel: '' })
        setLoading(false)
      }
    })

    return () => {
      if (unsubPerfil) unsubPerfil()
      unsubAuth()
    }
  }, [])

  const loginConGoogle = () => {
    const provider = new GoogleAuthProvider()
    // Restringe la propia pantalla de selección de cuenta de Google al dominio,
    // así la mayoría de la gente ni siquiera ve su cuenta personal como opción.
    if (DOMINIO_PERMITIDO) provider.setCustomParameters({ hd: DOMINIO_PERMITIDO })
    return signInWithPopup(auth, provider).then((res) => {
      registrarLog({ user: { email: res.user.email, uid: res.user.uid, nombre: res.user.displayName }, accion: 'sesion.inicio', modulo: 'sesion' })
      return res
    })
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
