import * as XLSX from 'xlsx'
import { writeBatch, doc, collection } from 'firebase/firestore'
import { db } from '../firebase'
import { normalizar } from './alumnos'

/**
 * Columnas esperadas del Excel de alumnos:
 * MATRICULA | NOMBRE | CORREO | PLANTEL | NIVEL | GRADO | GRUPO |
 * TUTOR RESPONSABLE | TELEFONO TUTOR RESPONSABLE
 */
export const CAMPOS_ALUMNO = [
  { clave: 'matricula', etiqueta: 'Matrícula (identificador único)', requerido: true, sinonimos: ['matricula'] },
  { clave: 'nombre', etiqueta: 'Nombre del alumno', requerido: true, sinonimos: ['nombre', 'nombre del alumno', 'alumno'] },
  { clave: 'correoAlumno', etiqueta: 'Correo', requerido: false, sinonimos: ['correo', 'correo alumno', 'correo del alumno', 'email'] },
  { clave: 'plantel', etiqueta: 'Plantel', requerido: true, sinonimos: ['plantel'] },
  { clave: 'nivel', etiqueta: 'Nivel', requerido: false, sinonimos: ['nivel'] },
  { clave: 'grado', etiqueta: 'Grado', requerido: false, sinonimos: ['grado'] },
  { clave: 'grupo', etiqueta: 'Grupo', requerido: false, sinonimos: ['grupo'] },
  { clave: 'tutor', etiqueta: 'Tutor responsable', requerido: false, sinonimos: ['tutor responsable', 'tutor'] },
  {
    clave: 'telefonoTutor',
    etiqueta: 'Teléfono del tutor responsable',
    requerido: false,
    sinonimos: ['telefono tutor responsable', 'telefono del tutor responsable', 'telefono tutor', 'telefono'],
  },
]

/** Empareja automáticamente los encabezados del Excel con los campos. */
export function detectarMapeo(headers) {
  const mapeo = {}
  const usados = new Set()
  CAMPOS_ALUMNO.forEach((campo) => {
    const encontrado = headers.find((h) => !usados.has(h) && campo.sinonimos.includes(normalizar(h)))
    if (encontrado) {
      mapeo[campo.clave] = encontrado
      usados.add(encontrado)
    }
  })
  return mapeo
}

/** Lee un archivo .xlsx/.xls y regresa { headers, rows } con los datos crudos. */
export function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const hoja = wb.Sheets[wb.SheetNames[0]]
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
        const headers = filas.length ? Object.keys(filas[0]) : []
        resolve({ headers, rows: filas })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const texto = (fila, columna) => (columna ? String(fila[columna] ?? '').trim() : '')

/**
 * Importa alumnos a Firestore aplicando un mapeo de columnas.
 * El documento usa la matrícula como id, así que volver a cargar el mismo
 * Excel actualiza datos en lugar de duplicar alumnos.
 */
export async function importarAlumnos(rows, mapeo) {
  const batchSize = 400 // límite de Firestore: 500 por batch
  let importados = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize)
    const batch = writeBatch(db)
    let enLote = 0

    lote.forEach((fila) => {
      const matricula = texto(fila, mapeo.matricula).replace(/\//g, '-')
      if (!matricula) return // sin matrícula no se puede identificar al alumno

      batch.set(
        doc(collection(db, 'alumnos'), matricula),
        {
          matricula,
          nombre: texto(fila, mapeo.nombre),
          correoAlumno: texto(fila, mapeo.correoAlumno),
          plantel: texto(fila, mapeo.plantel),
          nivel: texto(fila, mapeo.nivel),
          grado: texto(fila, mapeo.grado),
          grupo: texto(fila, mapeo.grupo),
          tutor: texto(fila, mapeo.tutor),
          telefonoTutor: texto(fila, mapeo.telefonoTutor),
          activo: true,
        },
        { merge: true }
      )
      enLote++
      importados++
    })

    if (enLote > 0) await batch.commit()
  }

  return importados
}
