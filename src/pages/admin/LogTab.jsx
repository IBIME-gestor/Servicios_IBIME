import { Fragment, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '../../firebase'
import { normalizar } from '../../lib/alumnos'

const fmt = (d) => (d ? d.toLocaleString('es-MX') : '—')

export default function LogTab() {
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [modulo, setModulo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierto, setAbierto] = useState(null)

  async function cargar() {
    setCargando(true); setError('')
    try {
      const snap = await getDocs(query(collection(db, 'log'), orderBy('creadoEn', 'desc'), limit(500)))
      setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data(), creadoEn: d.data().creadoEn?.toDate?.() || null })))
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible leer la bitácora. ¿Tienes el permiso admin.log y publicaste las reglas de Firestore?')
    } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const modulos = useMemo(() => Array.from(new Set(registros.map((r) => r.modulo).filter(Boolean))).sort(), [registros])
  const filtrados = registros.filter((r) => {
    if (modulo && r.modulo !== modulo) return false
    if (desde && (r.fechaDia || '') < desde) return false
    if (hasta && (r.fechaDia || '') > hasta) return false
    const t = normalizar(texto)
    if (!t) return true
    return [r.usuarioEmail, r.usuarioNombre, r.accion, r.alumnoNombre, r.alumnoMatricula, r.entidadId].some((v) => normalizar(v).includes(t))
  })

  function excel() {
    const filas = filtrados.map((r) => ({
      Fecha: fmt(r.creadoEn), Correo: r.usuarioEmail, Usuario: r.usuarioNombre, Rol: r.usuarioRol, 'Plantel usuario': r.usuarioPlantel,
      Módulo: r.modulo, Acción: r.accion, Alumno: r.alumnoNombre, Matrícula: r.alumnoMatricula, 'Plantel alumno': r.alumnoPlantel,
      Entidad: r.entidad, 'ID registro': r.entidadId, Detalle: JSON.stringify(r.detalle || {}),
    }))
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Bitácora')
    XLSX.writeFile(libro, `bitacora_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="card" style={{ padding: '1.1rem' }}>
      <div className="section-heading">
        <div><h3 style={{ margin: 0 }}>🕵️ Bitácora de movimientos</h3><span>Últimos {registros.length} · inmutable, solo lectura</span></div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-outline btn-small" onClick={cargar}>Actualizar</button>
          <button className="btn btn-outline btn-small" disabled={!filtrados.length} onClick={excel}>Descargar Excel</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '.8rem 0' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Correo, alumno, acción…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={modulo} onChange={(e) => setModulo(e.target.value)}>
          <option value="">Todos los módulos</option>
          {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 160 }} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input className="input" style={{ maxWidth: 160 }} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      {error && <div className="form-error">⚠️ {error}</div>}
      {cargando ? <p className="page-muted">Cargando…</p> : filtrados.length === 0 ? <p className="page-muted">Sin movimientos con esos filtros.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="caja-table" style={{ width: '100%' }}>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Alumno</th><th /></tr></thead>
            <tbody>
              {filtrados.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{fmt(r.creadoEn)}</td>
                    <td><strong>{r.usuarioEmail}</strong><small>{r.usuarioRol} · {r.usuarioPlantel || 'sin plantel'}</small></td>
                    <td>{r.modulo}</td><td>{r.accion}</td>
                    <td>{r.alumnoNombre || '—'}{r.alumnoMatricula ? <small>{r.alumnoMatricula}</small> : null}</td>
                    <td><button className="btn btn-outline btn-small" onClick={() => setAbierto(abierto === r.id ? null : r.id)}>{abierto === r.id ? '−' : '+'}</button></td>
                  </tr>
                  {abierto === r.id && (
                    <tr><td colSpan={6}><pre style={{ margin: 0, fontSize: '.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify({ entidad: r.entidad, entidadId: r.entidadId, detalle: r.detalle, uid: r.usuarioUid, dispositivo: r.dispositivo }, null, 2)}</pre></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
