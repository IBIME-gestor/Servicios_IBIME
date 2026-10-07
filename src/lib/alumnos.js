import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
} from 'firebase/firestore'
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

/* ------------------------------------------------------------------ */
/* Consulta paginada (25 en 25) para el directorio de Alumnos          */
/* ------------------------------------------------------------------ */

export const TAM_PAGINA = 25
const CATALOGO_VACIO = { planteles: [], niveles: [], grados: [], grupos: [] }
const ordenar = (lista) => Array.from(new Set(lista.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }))

/** Valores disponibles para los filtros (1 sola lectura). null si aún no existe. */
export async function obtenerCatalogoAlumnos() {
  const snap = await getDoc(doc(db, 'config', 'catalogo_alumnos'))
  return snap.exists() ? { ...CATALOGO_VACIO, ...snap.data() } : null
}

/** Suma valores nuevos al catálogo (lo usa la importación de alumnos). */
export async function guardarCatalogoAlumnos(nuevos) {
  const actual = (await obtenerCatalogoAlumnos()) || CATALOGO_VACIO
  const unido = {}
  Object.keys(CATALOGO_VACIO).forEach((k) => { unido[k] = ordenar([...(actual[k] || []), ...(nuevos[k] || [])]) })
  await setDoc(doc(db, 'config', 'catalogo_alumnos'), unido, { merge: true })
  return unido
}

/** Para bases ya importadas: lee todos los alumnos UNA vez y arma el catálogo. */
export async function reconstruirCatalogoAlumnos() {
  const lista = await listarAlumnosActivos()
  const t = (k) => lista.map((a) => String(a[k] ?? '').trim())
  const nuevo = { planteles: ordenar(t('plantel')), niveles: ordenar(t('nivel')), grados: ordenar(t('grado')), grupos: ordenar(t('grupo')) }
  await setDoc(doc(db, 'config', 'catalogo_alumnos'), nuevo)
  return nuevo
}

function condiciones({ plantel, nivel, grado, grupo }) {
  const c = []
  if (plantel) c.push(where('plantel', '==', plantel))
  if (nivel) c.push(where('nivel', '==', nivel))
  if (grado) c.push(where('grado', '==', grado))
  if (grupo) c.push(where('grupo', '==', grupo))
  return c
}

/** Total de alumnos con esos filtros (lectura agregada: muy barata). */
export async function contarAlumnos(filtros) {
  const c = condiciones(filtros)
  if (!c.length) return null
  const snap = await getCountFromServer(query(collection(db, 'alumnos'), ...c))
  return snap.data().count
}

/**
 * Trae UNA página de alumnos (25 por defecto) según los filtros.
 * - Con filtros: igualdades + orden por matrícula (sin índices compuestos).
 * - Con texto: búsqueda por inicio del nombre (campo nombreBusqueda) o matrícula
 *   exacta; los filtros se aplican sobre esos resultados.
 * `cursor` es el último documento de la página anterior.
 */
export async function consultarAlumnosPagina({ plantel = '', nivel = '', grado = '', grupo = '', texto = '', cursor = null, tamano = TAM_PAGINA }) {
  const filtros = { plantel, nivel, grado, grupo }
  const t = normalizar(texto)
  const cumple = (a) =>
    a.activo !== false &&
    (!plantel || a.plantel === plantel) &&
    (!nivel || a.nivel === nivel) &&
    (!grado || a.grado === grado) &&
    (!grupo || a.grupo === grupo)

  let docs = []
  if (t) {
    const partes = [
      where('nombreBusqueda', '>=', t),
      where('nombreBusqueda', '<=', `${t}\uf8ff`),
      orderBy('nombreBusqueda'),
    ]
    if (cursor) partes.push(startAfter(cursor))
    partes.push(limit(tamano + 1))
    docs = (await getDocs(query(collection(db, 'alumnos'), ...partes))).docs
    if (!cursor && /^[\w-]+$/.test(texto.trim())) {
      const porMatricula = await getDoc(doc(db, 'alumnos', texto.trim()))
      if (porMatricula.exists() && !docs.some((d) => d.id === porMatricula.id)) docs = [porMatricula, ...docs]
    }
  } else {
    const partes = [...condiciones(filtros), orderBy(documentId())]
    if (cursor) partes.push(startAfter(cursor))
    partes.push(limit(tamano + 1))
    docs = (await getDocs(query(collection(db, 'alumnos'), ...partes))).docs
  }

  const hayMas = docs.length > tamano
  const pagina = docs.slice(0, tamano)
  const alumnos = pagina
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(cumple)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  return { alumnos, hayMas, ultimo: pagina.length ? pagina[pagina.length - 1] : null }
}
