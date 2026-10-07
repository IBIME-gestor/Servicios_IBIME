import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../contexts/AuthContext'
import { plantelesDe, puedeVerTodosLosPlanteles, normalizar } from '../../lib/alumnos'
import {
  METODOS_PAGO_ESTANCIA,
  crearCorteEstancia,
  estanciasPendientesDeCorte,
  listarCortesEstancia,
} from '../../lib/estancia'
import { formatoFecha, formatoHora } from '../../lib/fechas'

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`
const fechaCompleta = (d) => (d ? `${formatoFecha(d)} · ${formatoHora(d)}` : '—')

function descargarExcel({ nombreArchivo, filas, totales }) {
  const hoja = XLSX.utils.json_to_sheet([
    ...filas,
    {},
    { Alumno: 'TOTAL EFECTIVO', Monto: totales.efectivo },
    { Alumno: 'TOTAL COMETA', Monto: totales.cometa },
    { Alumno: 'TOTAL', Monto: totales.total },
  ])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Corte estancia')
  XLSX.writeFile(libro, nombreArchivo)
}

function MetodoPill({ metodo }) {
  const m = METODOS_PAGO_ESTANCIA[metodo]
  return <span className="status-pill">{m ? `${m.icono} ${m.etiqueta}` : '—'}</span>
}

function Total({ titulo, valor, detalle }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{titulo}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{valor}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{detalle}</div>
    </div>
  )
}

/**
 * Corte de estancia: reúne lo cobrado en efectivo o cargado a Cometa que aún
 * no se ha entregado. Al hacer el corte queda registrado y esos cobros ya no
 * se vuelven a contar.
 */
export default function CorteEstancia({ alumnos }) {
  const { user } = useAuth()
  const verTodos = puedeVerTodosLosPlanteles(user)
  const [pendientes, setPendientes] = useState([])
  const [cortes, setCortes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [haciendoCorte, setHaciendoCorte] = useState(false)
  const [plantelFiltro, setPlantelFiltro] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      const [p, c] = await Promise.all([estanciasPendientesDeCorte(), listarCortesEstancia()])
      setPendientes(p)
      setCortes(c)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar la información del corte.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const mapaAlumnos = useMemo(() => new Map(alumnos.map((a) => [a.id, a])), [alumnos])
  const planteles = useMemo(() => plantelesDe(alumnos), [alumnos])

  // Solo entran al corte las estancias de alumnos del plantel que el usuario puede ver.
  const delCorte = useMemo(() => {
    const filtro = normalizar(plantelFiltro)
    return pendientes.filter((e) => {
      const alumno = mapaAlumnos.get(e.alumnoId)
      if (verTodos && !filtro) return true
      if (!alumno) return false
      return !filtro || normalizar(alumno.plantel) === filtro
    })
  }, [pendientes, mapaAlumnos, verTodos, plantelFiltro])

  const suma = (lista) => lista.reduce((t, e) => t + (Number(e.costo) || 0), 0)
  const efectivo = delCorte.filter((e) => e.metodoPago === 'efectivo')
  const cometa = delCorte.filter((e) => e.metodoPago === 'cometa')
  const totales = { efectivo: suma(efectivo), cometa: suma(cometa), total: suma(delCorte) }

  const etiquetaPlantel = verTodos ? plantelFiltro || 'Todos' : user?.plantel || ''

  async function hacerCorte() {
    if (delCorte.length === 0 || haciendoCorte) return
    const ok = window.confirm(
      `Se hará el corte de ${delCorte.length} cobro(s) por ${dinero(totales.total)} ` +
        `(Efectivo ${dinero(totales.efectivo)} · Cometa ${dinero(totales.cometa)}).\n\n` +
        'Después de esto no volverán a aparecer como pendientes. ¿Continuar?'
    )
    if (!ok) return
    setHaciendoCorte(true)
    setError('')
    setAviso('')
    try {
      await crearCorteEstancia({
        estancias: delCorte,
        usuarioEmail: user?.email || user?.uid,
        usuarioNombre: user?.nombre,
        plantel: etiquetaPlantel,
      })
      setAviso(`Corte realizado: ${dinero(totales.total)} (${delCorte.length} cobros).`)
      await cargar()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible hacer el corte.')
    } finally {
      setHaciendoCorte(false)
    }
  }

  function excelPendientes() {
    descargarExcel({
      nombreArchivo: `corte_estancia_pendiente_${new Date().toISOString().slice(0, 10)}.xlsx`,
      filas: delCorte.map((e) => ({
        Alumno: e.alumnoNombre,
        Plantel: mapaAlumnos.get(e.alumnoId)?.plantel || '',
        'Fecha de pago': e.fechaPagado ? e.fechaPagado.toLocaleString('es-MX') : '',
        Método: METODOS_PAGO_ESTANCIA[e.metodoPago]?.etiqueta || e.metodoPago,
        Monto: Number(e.costo) || 0,
      })),
      totales,
    })
  }

  function excelCorte(c) {
    const ef = (c.detalle || []).filter((d) => d.metodoPago === 'efectivo')
    const co = (c.detalle || []).filter((d) => d.metodoPago === 'cometa')
    descargarExcel({
      nombreArchivo: `corte_estancia_${c.creadoEn ? c.creadoEn.toISOString().slice(0, 10) : c.id}.xlsx`,
      filas: (c.detalle || []).map((d) => ({
        Alumno: d.alumno,
        'Fecha de pago': d.fechaPagado ? new Date(d.fechaPagado).toLocaleString('es-MX') : '',
        Método: METODOS_PAGO_ESTANCIA[d.metodoPago]?.etiqueta || d.metodoPago,
        Monto: d.costo,
      })),
      totales: {
        efectivo: ef.reduce((t, d) => t + d.costo, 0),
        cometa: co.reduce((t, d) => t + d.costo, 0),
        total: c.total,
      },
    })
  }

  if (cargando) return <p className="page-muted">Cargando corte…</p>

  return (
    <div>
      <p className="page-muted" style={{ marginTop: 0 }}>
        Aquí aparece lo cobrado en <strong>efectivo</strong> o cargado a <strong>Cometa</strong> desde Estancia y que
        aún no has entregado. Estos pagos son fuera de Caja; al hacer el corte quedan registrados como entregados.
      </p>

      {error && <div className="card form-error">⚠️ {error}</div>}
      {aviso && <p style={{ color: 'var(--green-600)', fontWeight: 700 }}>{aviso}</p>}

      {verTodos && planteles.length > 0 && (
        <div style={{ maxWidth: 300, marginBottom: '1rem' }}>
          <label className="field-label">Plantel</label>
          <select className="input" value={plantelFiltro} onChange={(e) => setPlantelFiltro(e.target.value)}>
            <option value="">Todos los planteles</option>
            {planteles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
        <Total titulo="💵 Efectivo" valor={dinero(totales.efectivo)} detalle={`${efectivo.length} cobro(s)`} />
        <Total titulo="💳 Cometa" valor={dinero(totales.cometa)} detalle={`${cometa.length} cobro(s)`} />
        <Total titulo="Total del corte" valor={dinero(totales.total)} detalle={`${delCorte.length} cobro(s) · ${etiquetaPlantel || 'sin plantel'}`} />
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div className="section-heading">
          <div><h3 style={{ margin: 0 }}>Pendiente de entregar</h3><span>{delCorte.length} cobro(s)</span></div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-small" onClick={cargar}>Actualizar</button>
            <button className="btn btn-outline btn-small" disabled={delCorte.length === 0} onClick={excelPendientes}>Descargar Excel</button>
            <button className="btn btn-primary btn-small" disabled={delCorte.length === 0 || haciendoCorte} onClick={hacerCorte}>
              {haciendoCorte ? 'Haciendo corte…' : 'Hacer corte'}
            </button>
          </div>
        </div>

        {delCorte.length === 0 ? (
          <p className="page-muted">No hay cobros pendientes de corte.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                  <th style={{ padding: '0.4rem' }}>Alumno</th>
                  <th style={{ padding: '0.4rem' }}>Pagado</th>
                  <th style={{ padding: '0.4rem' }}>Método</th>
                  <th style={{ padding: '0.4rem', textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {delCorte.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.45rem 0.4rem' }}>
                      <strong>{e.alumnoNombre}</strong>
                      {mapaAlumnos.get(e.alumnoId)?.plantel && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{mapaAlumnos.get(e.alumnoId).plantel}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.45rem 0.4rem' }}>{fechaCompleta(e.fechaPagado)}</td>
                    <td style={{ padding: '0.45rem 0.4rem' }}><MetodoPill metodo={e.metodoPago} /></td>
                    <td style={{ padding: '0.45rem 0.4rem', textAlign: 'right' }}><strong>{dinero(e.costo)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <div className="section-heading">
          <div><h3 style={{ margin: 0 }}>Cortes anteriores</h3><span>Últimos {cortes.length}</span></div>
        </div>
        {cortes.length === 0 ? (
          <p className="page-muted">Todavía no se ha hecho ningún corte.</p>
        ) : (
          cortes.map((c) => (
            <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '0.6rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong>{fechaCompleta(c.creadoEn)}</strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                    {c.creadoPorNombre} · {c.plantel} · {c.cantidad} cobro(s)
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                  <div><strong>{dinero(c.total)}</strong></div>
                  <div style={{ color: 'var(--ink-muted)' }}>💵 {dinero(c.totalEfectivo)} · 💳 {dinero(c.totalCometa)}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-outline btn-small" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                    {abierto === c.id ? 'Ocultar' : 'Ver detalle'}
                  </button>
                  <button className="btn btn-outline btn-small" onClick={() => excelCorte(c)}>Excel</button>
                </div>
              </div>
              {abierto === c.id && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.84rem' }}>
                  {(c.detalle || []).map((d) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', padding: '0.2rem 0' }}>
                      <span>{d.alumno}</span>
                      <span><MetodoPill metodo={d.metodoPago} /> <strong>{dinero(d.costo)}</strong></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
