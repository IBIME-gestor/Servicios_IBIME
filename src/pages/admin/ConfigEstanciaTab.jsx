import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { registrarLog } from '../../lib/log'
import { CONFIG_ESTANCIA_DEFAULT, obtenerConfigEstancia, guardarConfigEstancia, calcularCostoEstancia, clavePlantel } from '../../lib/pricing'
import { obtenerCatalogoAlumnos, listarPlanteles } from '../../lib/alumnos'

const dinero = (n) => `$${Number(n || 0).toFixed(2)} MXN`

export default function ConfigEstanciaTab() {
  const { user } = useAuth()
  const [config, setConfig] = useState(CONFIG_ESTANCIA_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const [planteles, setPlanteles] = useState([])

  useEffect(() => { obtenerConfigEstancia().then(setConfig) }, [])
  useEffect(() => {
    // Planteles: del catálogo de alumnos (1 lectura); si aún no existe, de la lista de alumnos.
    obtenerCatalogoAlumnos()
      .then((c) => (c?.planteles?.length ? c.planteles : listarPlanteles()))
      .then(setPlanteles)
      .catch(() => setPlanteles([]))
  }, [])

  function cambiarHorarioPlantel(plantel, nivel, valor) {
    const clave = clavePlantel(plantel)
    const actual = config.horariosPlantel?.[clave] || {}
    setConfig({ ...config, horariosPlantel: { ...(config.horariosPlantel || {}), [clave]: { ...actual, nombre: plantel, [nivel]: valor } } })
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setGuardando(true); setGuardado(false)
    try { await guardarConfigEstancia(config); registrarLog({ user, accion: 'admin.config_estancia', modulo: 'admin', entidad: 'config', entidadId: 'estancia', detalle: config }); setGuardado(true) } finally { setGuardando(false) }
  }

  const ejemplos = [30, 42, 60, 75, 90, 105, 125].map(min => ({ min, ...calcularCostoEstancia(min, config) }))

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: '1.25rem', alignItems: 'start' }}>
      <form onSubmit={handleGuardar} className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>🏫 Tarifas de estancia</h3>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>El cálculo se hace por bloques: 1-30 min, 31-60 min, y después horas completas con un bloque final de 1-30 o 31-60 min cuando corresponda.</p>

        <h4 style={{ margin: '0 0 0.4rem' }}>Hora de inicio general por nivel</h4>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.78rem', marginTop: 0 }}>Horario base. Cada plantel puede tener su propio horario en la sección de abajo; si no lo tiene, se usa este.</p>
        <HoraNivel label="Preescolar" value={config.horaInicioPreescolar} onChange={v => setConfig({ ...config, horaInicioPreescolar: v })} />
        <HoraNivel label="Primaria" value={config.horaInicioPrimaria} onChange={v => setConfig({ ...config, horaInicioPrimaria: v })} />
        <HoraNivel label="Secundaria" value={config.horaInicioSecundaria} onChange={v => setConfig({ ...config, horaInicioSecundaria: v })} />
        <HoraNivel label="Otro / sin nivel reconocido (respaldo)" value={config.horaInicio} onChange={v => setConfig({ ...config, horaInicio: v })} />

        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Minutos de gracia</label>
        <input className="input" type="number" min={0} value={config.minutosGracia} onChange={e => setConfig({ ...config, minutosGracia: Number(e.target.value) })} style={{ marginBottom: '0.8rem' }} />

        <Tarifa label="Estancia de 1 a 30 minutos" value={config.costo30Min} onChange={v => setConfig({ ...config, costo30Min: Number(v) })} />
        <Tarifa label="Estancia de 31 a 60 minutos (si lo dejas en 0 se cobra como 1 hora)" value={config.costo31a60Min} onChange={v => setConfig({ ...config, costo31a60Min: Number(v) })} />
        <Tarifa label="Estancia por 1 hora" value={config.costo1Hora} onChange={v => setConfig({ ...config, costo1Hora: Number(v) })} />

        <h4 style={{ marginBottom: '0.6rem' }}>Mensualidades</h4>
        <Tarifa label="Estancia mensual por 1 hora diaria" value={config.mensual1Hora} onChange={v => setConfig({ ...config, mensual1Hora: Number(v) })} />
        <Tarifa label="Estancia mensual por 2 horas diarias" value={config.mensual2Horas} onChange={v => setConfig({ ...config, mensual2Horas: Number(v) })} />
        <Tarifa label="Estancia mensual por 3 horas diarias" value={config.mensual3Horas} onChange={v => setConfig({ ...config, mensual3Horas: Number(v) })} />

        <button className="btn btn-primary" disabled={guardando} type="submit" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
        {guardado && <p style={{ color: 'var(--green-600)', fontSize: '0.85rem', marginBottom: 0 }}>Guardado ✓</p>}
      </form>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Vista previa</h3>
        {ejemplos.map(e => <div key={e.min} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}><strong>{e.min} minutos</strong><div style={{ fontSize: '0.9rem' }}>{dinero(e.costo)}</div><div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>{e.desglose}</div></div>)}
        <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'var(--surface-sunken)', borderRadius: 8, fontSize: '0.82rem' }}>
          <strong>Ejemplos:</strong> 42 min = bloque de 31 a 60. 1 h 25 min = <strong>1 hora + 30 minutos</strong>. 1 h 45 min = 1 hora + bloque de 31 a 60.
        </div>
      </div>
    </div>

    <div className="card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
      <h3 style={{ marginTop: 0 }}>🏫 Horario de inicio por plantel y nivel</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem', marginTop: 0 }}>
        El mismo nivel puede empezar a distinta hora según el plantel. Deja una casilla vacía para usar el horario general del nivel
        (se muestra como sugerencia). Aplica a las estancias que se registren desde ahora; las ya abiertas conservan su hora.
      </p>
      {planteles.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>No hay planteles registrados todavía. Se llenan al importar alumnos.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                <th style={{ padding: '0.4rem' }}>Plantel</th>
                <th style={{ padding: '0.4rem' }}>Preescolar</th>
                <th style={{ padding: '0.4rem' }}>Primaria</th>
                <th style={{ padding: '0.4rem' }}>Secundaria</th>
              </tr>
            </thead>
            <tbody>
              {planteles.map((pl) => {
                const h = config.horariosPlantel?.[clavePlantel(pl)] || {}
                return (
                  <tr key={pl} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.4rem', fontWeight: 700 }}>{pl}</td>
                    {[['preescolar', config.horaInicioPreescolar], ['primaria', config.horaInicioPrimaria], ['secundaria', config.horaInicioSecundaria]].map(([nivel, general]) => (
                      <td key={nivel} style={{ padding: '0.4rem' }}>
                        <input className="input" type="time" value={h[nivel] || ''} onChange={(e) => cambiarHorarioPlantel(pl, nivel, e.target.value)} style={{ minWidth: 120 }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', marginTop: 2 }}>{h[nivel] ? 'Propio' : `General ${general || '—'}`}</div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn btn-primary" disabled={guardando} type="button" onClick={handleGuardar} style={{ marginTop: '1rem' }}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
      {guardado && <span style={{ color: 'var(--green-600)', fontSize: '0.85rem', marginLeft: '0.8rem' }}>Guardado ✓</span>}
    </div>
    </>
  )
}

function Tarifa({ label, value, onChange }) {
  return <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.8rem' }}>{label}<input className="input" type="number" min={0} step="0.01" value={value ?? 0} onChange={e => onChange(e.target.value)} style={{ marginTop: '0.3rem' }} /></label>
}

function HoraNivel({ label, value, onChange }) {
  return <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.8rem' }}>{label}<input className="input" type="time" value={value || ''} onChange={e => onChange(e.target.value)} style={{ marginTop: '0.3rem' }} /></label>
}
