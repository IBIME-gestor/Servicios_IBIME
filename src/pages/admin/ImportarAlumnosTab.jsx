import { useState } from 'react'
import { leerExcel, importarAlumnos } from '../../lib/excelImport'

const CAMPOS = [
  { clave: 'nombre', etiqueta: 'Nombre del alumno', requerido: true },
  { clave: 'matricula', etiqueta: 'Matrícula (identificador único)', requerido: true },
  { clave: 'grado', etiqueta: 'Grado', requerido: false },
  { clave: 'grupo', etiqueta: 'Grupo', requerido: false },
  { clave: 'contacto', etiqueta: 'Contacto de padres', requerido: false },
]

export default function ImportarAlumnosTab() {
  const [archivo, setArchivo] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapeo, setMapeo] = useState({})
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState('')

  async function handleArchivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setArchivo(file)
    setResultado('')
    const { headers, rows } = await leerExcel(file)
    setHeaders(headers)
    setRows(rows)

    // intenta adivinar el mapeo por nombre de columna parecido
    const adivinado = {}
    CAMPOS.forEach((c) => {
      const match = headers.find((h) => h.toLowerCase().includes(c.clave.slice(0, 4)))
      if (match) adivinado[c.clave] = match
    })
    setMapeo(adivinado)
  }

  async function handleImportar() {
    setImportando(true)
    setResultado('')
    try {
      const total = await importarAlumnos(rows, mapeo)
      setResultado(`Se importaron ${total} alumnos correctamente.`)
    } catch (err) {
      setResultado('Ocurrió un error al importar. Revisa el mapeo de columnas.')
    } finally {
      setImportando(false)
    }
  }

  const listoParaImportar = mapeo.nombre && mapeo.matricula && rows.length > 0

  return (
    <div style={{ maxWidth: 640 }}>
      <h3 style={{ marginTop: 0 }}>Cargar base de alumnos (.xlsx / .xls)</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
        Si un alumno con la misma matrícula ya existe, se actualizan sus datos (no se duplica).
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ marginBottom: '1.25rem' }} />

      {headers.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h4 style={{ marginTop: 0, fontSize: '0.95rem' }}>
            Empareja las columnas de tu Excel ({rows.length} filas detectadas)
          </h4>
          {CAMPOS.map((c) => (
            <div key={c.clave} style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                {c.etiqueta} {c.requerido && <span style={{ color: 'var(--red-600)' }}>*</span>}
              </label>
              <select
                className="input"
                value={mapeo[c.clave] || ''}
                onChange={(e) => setMapeo({ ...mapeo, [c.clave]: e.target.value })}
              >
                <option value="">— No usar —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <button className="btn btn-primary" disabled={!listoParaImportar || importando} onClick={handleImportar}>
          {importando ? 'Importando…' : `Importar ${rows.length} alumnos`}
        </button>
      )}

      {resultado && <p style={{ marginTop: '1rem', color: 'var(--green-600)' }}>{resultado}</p>}
    </div>
  )
}
