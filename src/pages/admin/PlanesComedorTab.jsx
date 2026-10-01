import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  TIPOS_PLAN_COMEDOR,
  listarPlanesComedor,
  crearPlanComedor,
  actualizarPlanComedor,
  cambiarActivoPlanComedor,
  eliminarPlanComedor,
} from '../../lib/planesComedor'

const VACIO = {
  nombre: '',
  tipo: 'desayuno',
  monto: '',
  descripcion: '',
  activo: true,
}

const dinero = (n) => `$${Number(n || 0).toFixed(2)} MXN`

export default function PlanesComedorTab() {
  const { user } = useAuth()
  const [planes, setPlanes] = useState([])
  const [form, setForm] = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      setPlanes(await listarPlanesComedor())
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cargar los planes de comedor.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  function abrirNuevo() {
    setEditando(null)
    setForm(VACIO)
    setMostrarForm(true)
    setError('')
  }

  function editar(plan) {
    setEditando(plan.id)
    setForm({
      nombre: plan.nombre || '',
      tipo: plan.tipo || 'desayuno',
      monto: plan.monto ?? '',
      descripcion: plan.descripcion || '',
      activo: plan.activo !== false,
    })
    setMostrarForm(true)
    setError('')
  }

  function cancelar() {
    setMostrarForm(false)
    setEditando(null)
    setForm(VACIO)
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const monto = Number(form.monto)
    if (!form.nombre.trim()) return setError('Captura el nombre del plan.')
    if (!Number.isFinite(monto) || monto <= 0) return setError('Captura un precio válido.')

    setGuardando(true)
    try {
      const usuario = user?.email || user?.uid || 'usuario'
      if (editando) await actualizarPlanComedor(editando, form, usuario)
      else await crearPlanComedor(form, usuario)
      await cargar()
      cancelar()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible guardar el plan.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternar(plan) {
    try {
      await cambiarActivoPlanComedor(plan.id, plan.activo === false, user?.email || user?.uid || 'usuario')
      await cargar()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible cambiar el estado del plan.')
    }
  }

  async function eliminar(plan) {
    if (!window.confirm(`¿Eliminar el plan "${plan.nombre}"? Esta acción no afecta las mensualidades ya asignadas.`)) return
    try {
      await eliminarPlanComedor(plan.id)
      await cargar()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible eliminar el plan.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🍽️ Planes de comedor</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-muted)' }}>
            Catálogo de precios. Al asignarlo a un alumno, el sistema calcula automáticamente los días de lunes a viernes del mes y descuenta las vacaciones configuradas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo plan</button>
      </div>

      {error && <div className="card" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', border: '1px solid #ef4444', color: '#b91c1c' }}>⚠️ {error}</div>}

      {mostrarForm && (
        <form onSubmit={guardar} className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--surface-sunken)' }}>
          <h3 style={{ marginTop: 0 }}>{editando ? 'Editar plan' : 'Nuevo plan'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.8rem' }}>
            <label><span>Nombre del plan</span><input className="input" value={form.nombre} placeholder="Ej. Desayuno mensual" onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
            <label><span>Concepto</span><select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{TIPOS_PLAN_COMEDOR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <label><span>Precio</span><input className="input" type="number" min="0" step="0.01" value={form.monto} placeholder="0.00" onChange={e => setForm({ ...form, monto: e.target.value })} /></label>
          </div>
          <label style={{ display: 'block', marginTop: '0.8rem' }}><span>Descripción</span><textarea className="input" rows="3" value={form.descripcion} placeholder="Qué incluye el plan…" onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.8rem' }}><input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} /> Plan activo</label>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plan'}</button>
            <button type="button" className="btn btn-outline" onClick={cancelar}>Cancelar</button>
          </div>
        </form>
      )}

      {cargando ? <p style={{ color: 'var(--ink-muted)' }}>Cargando planes…</p> : planes.length === 0 ? (
        <div className="card" style={{ padding: '1.2rem' }}>No hay planes creados todavía. Usa <strong>+ Nuevo plan</strong> para crear el primero.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {planes.map(plan => (
            <div key={plan.id} className="card" style={{ padding: '1rem', opacity: plan.activo === false ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{plan.nombre}</div>
                  <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    {plan.tipo === 'desayuno' ? '🍳 Desayuno' : '🍲 Comida'} · {plan.activo === false ? 'Inactivo' : 'Activo'}
                  </div>
                  {plan.descripcion && <div style={{ marginTop: '0.45rem', fontSize: '0.85rem' }}>{plan.descripcion}</div>}
                </div>
                <strong style={{ fontSize: '1.15rem' }}>{dinero(plan.monto)}</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                <button className="btn btn-outline" onClick={() => editar(plan)}>Editar</button>
                <button className="btn btn-outline" onClick={() => alternar(plan)}>{plan.activo === false ? 'Activar' : 'Desactivar'}</button>
                <button className="btn btn-outline" onClick={() => eliminar(plan)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
