import { useEffect, useMemo, useState } from 'react'
import { obtenerCalendario, guardarCalendario, fechaISO, contarDiasHabiles, rangoMes } from '../../lib/calendario'

function fechaInput(date) { return fechaISO(date) }
function desdeInput(v) { const [y,m,d] = v.split('-').map(Number); return new Date(y,m-1,d) }

export default function ConfigCalendarioTab() {
  const [vacaciones, setVacaciones] = useState([])
  const [fecha, setFecha] = useState(fechaInput(new Date()))
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true); setError('')
    try { setVacaciones((await obtenerCalendario()).vacaciones || []) } catch (e) { setError(e.message || 'No se pudo cargar el calendario.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const mesActual = useMemo(() => rangoMes(new Date()), [])
  const diasMes = contarDiasHabiles(mesActual.inicio, mesActual.fin, vacaciones)

  async function guardar(lista) {
    setGuardando(true); setError(''); setMensaje('')
    try { await guardarCalendario({ vacaciones: lista }); setVacaciones(lista); setMensaje('Calendario guardado ✓') } catch (e) { setError(e.message || 'No se pudo guardar.') } finally { setGuardando(false) }
  }

  async function agregar(e) {
    e.preventDefault()
    if (!fecha) return
    const next = [...new Set([...vacaciones, fecha])].sort()
    await guardar(next)
  }

  async function quitar(v) { await guardar(vacaciones.filter(x => x !== v)) }

  if (cargando) return <p>Cargando calendario…</p>

  return <div style={{ maxWidth: 900 }}>
    <h2 style={{ marginTop: 0 }}>📅 Calendario y vacaciones</h2>
    <p style={{ color: 'var(--ink-muted)' }}>Los planes mensuales de comedor calculan automáticamente los días de lunes a viernes y descuentan los días que registres aquí.</p>

    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <strong>Mes actual</strong>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{diasMes} días de consumo</div>
      <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>Solo lunes a viernes, menos las fechas marcadas como vacaciones/suspensión.</div>
    </div>

    <form onSubmit={agregar} className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Agregar día sin consumo</h3>
      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ minWidth: 180 }}>Fecha<input className="input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={guardando}>Agregar</button>
      </div>
    </form>

    {mensaje && <div style={{ color: 'var(--green-600)', marginBottom: '0.7rem' }}>{mensaje}</div>}
    {error && <div style={{ color: 'var(--red-600)', marginBottom: '0.7rem' }}>{error}</div>}

    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Fechas registradas</h3>
      {vacaciones.length === 0 ? <p style={{ color: 'var(--ink-muted)' }}>No hay vacaciones o suspensiones configuradas.</p> : <div style={{ display: 'grid', gap: '0.5rem' }}>{vacaciones.map(v => <div key={v} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderTop: '1px solid var(--border)' }}><span>{desdeInput(v).toLocaleDateString('es-MX')}</span><button className="btn btn-outline" type="button" onClick={() => quitar(v)}>Quitar</button></div>)}</div>}
    </div>
  </div>
}
