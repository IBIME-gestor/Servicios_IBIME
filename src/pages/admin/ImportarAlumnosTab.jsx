
import { useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { registrarLog } from '../../lib/log'
import { leerExcel, importarAlumnos, detectarMapeo, CAMPOS_ALUMNO } from '../../lib/excelImport'

export default function ImportarAlumnosTab() {
  const { user } = useAuth()
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapeo, setMapeo] = useState({})
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')

  async function handleArchivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setResultado('')
    setError('')
    try {
      const { headers, rows } = await leerExcel(file)
      setHeaders(headers)
      setRows(rows)
      setMapeo(detectarMapeo(headers))
    } catch (err) {
      console.error(err)
      setHeaders([])
      setRows([])
      setError('No se pudo leer el archivo. Verifica que sea un .xlsx o .xls válido.')
    }
  }

  async function handleImportar() {
    setImportando(true)
    setResultado('')
    setError('')
    try {
      const total = await importarAlumnos(rows, mapeo)
      registrarLog({ user, accion: 'admin.importar_alumnos', modulo: 'admin', entidad: 'alumnos', detalle: { total } })
      setResultado(`Se importaron ${total} alumnos correctamente.`)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Ocurrió un error al importar. Revisa el mapeo de columnas.')
    } finally {
      setImportando(false)
    }
  }

  const faltantes = CAMPOS_ALUMNO.filter((c) => c.requerido && !mapeo[c.clave])
  const listoParaImportar = faltantes.length === 0 && rows.length > 0

  // Resumen por plantel para validar el archivo antes de importar.
  const resumenPlanteles = useMemo(() => {
    if (!mapeo.plantel) return []
    const conteo = new Map()
    rows.forEach((fila) => {
      const p = String(fila[mapeo.plantel] ?? '').trim() || '(sin plantel)'
      conteo.set(p, (conteo.get(p) || 0) + 1)
    })
    return Array.from(conteo.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [rows, mapeo.plantel])

  return (
    <div style={{ maxWidth: 680 }}>
      <h3 style={{ marginTop: 0 }}>Cargar base de alumnos (.xlsx / .xls)</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
        Encabezados esperados en la primera hoja:
      </p>
      <p style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 0 }}>
        MATRICULA · NOMBRE · CORREO (alumno) · CORREO TUTOR · PLANTEL · NIVEL · GRADO · GRUPO · TUTOR RESPONSABLE · TELEFONO TUTOR RESPONSABLE
      </p>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
        Si un alumno con la misma matrícula ya existe, se actualizan sus datos (no se duplica).
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ marginBottom: '1.25rem' }} />

      {error && <div className="card form-error">⚠️ {error}</div>}

      {headers.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h4 style={{ marginTop: 0, fontSize: '0.95rem' }}>
            Columnas detectadas ({rows.length} filas)
          </h4>
          {faltantes.length > 0 && (
            <p style={{ color: 'var(--red-600)', fontSize: '0.85rem' }}>
              Falta emparejar: {faltantes.map((c) => c.etiqueta).join(', ')}.
            </p>
          )}
          {CAMPOS_ALUMNO.map((c) => (
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

          {resumenPlanteles.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '0.85rem' }}>Alumnos por plantel en el archivo</strong>
              {resumenPlanteles.map(([plantel, n]) => (
                <div key={plantel} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.2rem 0' }}>
                  <span>{plantel}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}
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
