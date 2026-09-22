import { useEffect, useState } from 'react'
import { CONFIG_COMEDOR_DEFAULT, obtenerConfigComedor, guardarConfigComedor } from '../../lib/pricingComedor'

export default function ConfigComedorTab() {
  const [config, setConfig] = useState(CONFIG_COMEDOR_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    obtenerConfigComedor().then(setConfig)
  }, [])

  async function handleGuardar(e) {
    e.preventDefault()
    setGuardando(true)
    setGuardado(false)
    try {
      await guardarConfigComedor(config)
      setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleGuardar} className="card" style={{ padding: '1.25rem', maxWidth: 380 }}>
      <h3 style={{ marginTop: 0 }}>🍽️ Precios de comedor</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem', marginTop: '-0.5rem' }}>
        Se usan para calcular el total de cafetería en Caja y en el panel de Pagos.
      </p>

      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Precio del desayuno (MXN)</label>
      <input
        className="input"
        type="number"
        min={0}
        value={config.precioDesayuno}
        onChange={(e) => setConfig({ ...config, precioDesayuno: Number(e.target.value) })}
        style={{ marginBottom: '0.9rem' }}
      />

      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Precio de la comida (MXN)</label>
      <input
        className="input"
        type="number"
        min={0}
        value={config.precioComida}
        onChange={(e) => setConfig({ ...config, precioComida: Number(e.target.value) })}
        style={{ marginBottom: '1rem' }}
      />

      <button className="btn btn-primary" disabled={guardando} type="submit" style={{ width: '100%', justifyContent: 'center' }}>
        {guardando ? 'Guardando…' : 'Guardar precios'}
      </button>
      {guardado && <p style={{ color: 'var(--green-600)', fontSize: '0.85rem', marginTop: '0.6rem' }}>Guardado ✓</p>}
    </form>
  )
}
