import * as XLSX from 'xlsx'
import { writeBatch, doc, collection } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Lee un archivo .xlsx/.xls y regresa { headers, rows } con los datos crudos.
 * No asumimos nombres de columna fijos porque cada plantel puede traer su
 * Excel con encabezados distintos — el usuario los mapea en pantalla
 * (ver AdminDashboard > Importar alumnos).
 */
export function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const hoja = wb.Sheets[wb.SheetNames[0]]
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
        const headers = filas.length ? Object.keys(filas[0]) : []
        resolve({ headers, rows: filas })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

/**
 * Importa alumnos a Firestore aplicando un mapeo de columnas.
 * @param {Array<object>} rows - filas crudas del Excel (de leerExcel)
 * @param {{nombre: string, grado: string, grupo: string, matricula: string, contacto?: string}} mapeo
 *   valores = nombre de la columna real en el Excel del usuario
 */
export async function importarAlumnos(rows, mapeo) {
  const batchSize = 400 // límite de Firestore es 500 por batch, dejamos margen
  let importados = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize)
    const batch = writeBatch(db)

    lote.forEach((fila) => {
      const matricula = String(fila[mapeo.matricula] ?? '').trim()
      if (!matricula) return // sin matrícula no se puede identificar al alumno de forma única

      const ref = doc(collection(db, 'alumnos'), matricula)
      batch.set(
        ref,
        {
          matricula,
          nombre: String(fila[mapeo.nombre] ?? '').trim(),
          grado: mapeo.grado ? String(fila[mapeo.grado] ?? '').trim() : '',
          grupo: mapeo.grupo ? String(fila[mapeo.grupo] ?? '').trim() : '',
          contacto: mapeo.contacto ? String(fila[mapeo.contacto] ?? '').trim() : '',
          activo: true,
        },
        { merge: true }
      )
      importados++
    })

    await batch.commit()
  }

  return importados
}
