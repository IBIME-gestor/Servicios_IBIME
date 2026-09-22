import { useEffect, useState } from 'react'
import { CONFIG_ESTANCIA_DEFAULT, obtenerConfigEstancia, guardarConfigEstancia, calcularCostoEstancia } from '../../lib/pricing'

export default function ConfigEstanciaTab() {
  const [config, setConfig] = useState(CONFIG_ESTANCIA_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    obtenerConfigEstancia().then(setConfig)
  }, [])

  async function handleGuardar(e) {
    e.preventDefault()
    setGuardando(true)
    setGuardado(false)
    try {
      await guardarConfigEstancia(config)
      setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  const ejemplo60 = calcularCostoEstancia(60, config)
  const ejemplo90 = calcularCostoEstancia(90, config)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '2rem', alignItems: 'start', maxWidth: 900 }}>
      <form onSubmit={handleGuardar} className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Tarifas de estancia</h3>

        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
          Hora en que inicia la estancia escolar
        </label>
        <input
          className="input"
          type="time"
          value={config.horaInicio}
          onChange={(e) => setConfig({ ...config, horaInicio: e.target.value })}
          style={{ marginBottom: '0.9rem' }}
        />

        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
          Minutos de gracia (sin costo)
        </label>
        <input
          className="input"
          type="number"
          min={0}
          value={config.minutosGracia}
          onChange={(e) => setConfig({ ...config, minutosGracia: Number(e.target.value) })}
          style={{ marginBottom: '0.9rem' }}
        />

        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Modo de cobro</label>
        <select
          className="input"
          value={config.modoCobro}
          onChange={(e) => setConfig({ ...config, modoCobro: e.target.value })}
          style={{ marginBottom: '0.9rem' }}
        >
          <option value="fraccion">Por fracción de tiempo (ej. cada 30 min)</option>
          <option value="minuto">Por minuto exacto</option>
        </select>

        {config.modoCobro === 'fraccion' ? (
          <>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Minutos por fracción</label>
            <input
              className="input"
              type="number"
              min={1}
              value={config.minutosPorFraccion}
              onChange={(e) => setConfig({ ...config, minutosPorFraccion: Number(e.target.value) })}
              style={{ marginBottom: '0.9rem' }}
            />
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Costo por fracción (MXN)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={config.costoPorFraccion}
              onChange={(e) => setConfig({ ...config, costoPorFraccion: Number(e.target.value) })}
              style={{ marginBottom: '0.9rem' }}
            />
          </>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Costo por minuto (MXN)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={config.costoPorMinuto}
              onChange={(e) => setConfig({ ...config, costoPorMinuto: Number(e.target.value) })}
              style={{ marginBottom: '0.9rem' }}
            />
          </>
        )}

        <button className="btn btn-primary" disabled={guardando} type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {guardado && <p style={{ color: 'var(--green-600)', fontSize: '0.85rem', marginTop: '0.6rem' }}>Guardado ✓</p>}
      </form>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Vista previa del cálculo</h3>
        <p style={{ fontSize: '0.9rem' }}>
          Alumno con <strong>60 minutos</strong> en estancia: <strong>${ejemplo60.costo}</strong>
          <br />
          <span style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>{ejemplo60.desglose}</span>
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          Alumno con <strong>90 minutos</strong> en estancia: <strong>${ejemplo90.costo}</strong>
          <br />
          <span style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>{ejemplo90.desglose}</span>
        </p>
      </div>
    </div>
  )
}
