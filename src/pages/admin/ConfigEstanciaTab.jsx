import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { registrarLog } from '../../lib/log'
import { CONFIG_ESTANCIA_DEFAULT, obtenerConfigEstancia, guardarConfigEstancia, calcularCostoEstancia, clavePlantel, claveHorario, horaPropiaNivel, nivelAplicaEstancia, horaInicioConfigurada } from '../../lib/pricing'
import { obtenerCatalogoAlumnos, reconstruirCatalogoAlumnos } from '../../lib/alumnos'

const dinero = (n) => `$${Number(n || 0).toFixed(2)} MXN`

export default function ConfigEstanciaTab() {
  const { user } = useAuth()
  const [config, setConfig] = useState(CONFIG_ESTANCIA_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const [catalogo, setCatalogo] = useState(null)
  const [cargandoCat, setCargandoCat] = useState(true)
  const [actualizando, setActualizando] = useState(false)

  useEffect(() => { obtenerConfigEstancia().then(setConfig) }, [])
  useEffect(() => {
    obtenerCatalogoAlumnos().then(setCatalogo).catch(() => setCatalogo(null)).finally(() => setCargandoCat(false))
  }, [])

  async function actualizarEstructura() {
    setActualizando(true)
    try { setCatalogo(await reconstruirCatalogoAlumnos()) } finally { setActualizando(false) }
  }

  // Árbol plantel › nivel › grados, armado con el catálogo de alumnos.
  const arbol = useMemo(() => {
    const planteles = new Map()
    ;(catalogo?.combinaciones || []).forEach(({ plantel, nivel, grado }) => {
      if (!plantel) return
      if (!planteles.has(plantel)) planteles.set(plantel, new Map())
      const niveles = planteles.get(plantel)
      if (nivel) {
        if (!niveles.has(nivel)) niveles.set(nivel, new Set())
        if (grado) niveles.get(nivel).add(grado)
      }
    })
    return Array.from(planteles, ([plantel, niveles]) => ({
      plantel,
      niveles: Array.from(niveles, ([nivel, grados]) => ({ nivel, grados: Array.from(grados).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })) }))
        .sort((a, b) => a.nivel.localeCompare(b.nivel, 'es')),
    })).sort((a, b) => a.plantel.localeCompare(b.plantel, 'es'))
  }, [catalogo])

  const todosLosNiveles = useMemo(() => Array.from(new Set((catalogo?.combinaciones || []).map((c) => c.nivel).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [catalogo])

  function alternarNivel(nivel) {
    const k = clavePlantel(nivel)
    const actuales = Array.isArray(config.nivelesEstancia) ? config.nivelesEstancia : todosLosNiveles.map(clavePlantel)
    const siguientes = actuales.includes(k) ? actuales.filter((x) => x !== k) : [...actuales, k]
    setConfig({ ...config, nivelesEstancia: siguientes })
  }

  function cambiarHorario(clave, valor) {
    setConfig({ ...config, horarios: { ...(config.horarios || {}), [clave]: valor } })
  }

  // Estado de cada plantel: qué grados aplican y cuáles ya tienen hora (propia o heredada del nivel/plantel).
  const estado = useMemo(() => arbol.map(({ plantel, niveles }) => {
    const aplican = niveles.filter((n) => nivelAplicaEstancia(n.nivel, config))
    const faltantes = []
    aplican.forEach(({ nivel, grados }) => {
      if (grados.length === 0) {
        if (!horaInicioConfigurada({ plantel, nivel }, config)) faltantes.push(`${nivel}`)
      } else {
        grados.forEach((grado) => { if (!horaInicioConfigurada({ plantel, nivel, grado }, config)) faltantes.push(`${nivel} › ${grado}`) })
      }
    })
    return { plantel, aplican: aplican.length, faltantes }
  }), [arbol, config])

  const planteleIncompletos = estado.filter((e) => e.aplican > 0 && e.faltantes.length > 0).length
  const planteleConEstancia = estado.filter((e) => e.aplican > 0).length

  async function handleGuardar(e) {
    e?.preventDefault?.()
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
      <h3 style={{ marginTop: 0 }}>🎒 Niveles que tienen estancia</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem', marginTop: 0 }}>
        Marca solo los niveles donde se ofrece estancia. Los alumnos de un nivel sin marcar no participan: no aparecen para registrar llegada ni se les pide horario.
        Esta configuración es independiente de Comedor.
      </p>
      {todosLosNiveles.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>Todavía no hay niveles registrados. Se llenan al importar alumnos.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {todosLosNiveles.map((nivel) => {
            const activo = nivelAplicaEstancia(nivel, config)
            return (
              <label key={nivel} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.8rem', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: activo ? 'var(--surface-sunken)' : 'transparent', fontWeight: activo ? 700 : 400 }}>
                <input type="checkbox" checked={activo} onChange={() => alternarNivel(nivel)} />
                {nivel}
              </label>
            )
          })}
        </div>
      )}
    </div>

    <div className="card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
      <h3 style={{ marginTop: 0 }}>🏫 Horario de inicio por plantel › nivel › grado</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem', marginTop: 0 }}>
        Se captura en cascada, de lo general a lo específico: la hora del <strong>plantel</strong> aplica a todos sus niveles y grados; la hora de un <strong>nivel</strong> aplica a todos sus grados;
        la de un <strong>grado</strong> es solo para ese grado. Lo más específico siempre manda. Cada plantel debe quedar completo (todos sus grados con hora, propia o heredada); mientras falte alguno,
        no se podrá registrar estancia a esos alumnos. Aplica a las estancias que se registren desde ahora; las ya abiertas conservan su hora.
      </p>

      {cargandoCat ? (
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>Cargando planteles…</p>
      ) : arbol.length === 0 ? (
        <div style={{ fontSize: '0.85rem' }}>
          <p style={{ color: 'var(--ink-muted)' }}>No hay estructura de planteles, niveles y grados todavía. Se llena al importar alumnos; si ya los importaste, léela de la base actual:</p>
          <button className="btn" type="button" disabled={actualizando} onClick={actualizarEstructura}>{actualizando ? 'Leyendo alumnos…' : 'Cargar estructura desde alumnos'}</button>
        </div>
      ) : (
        <>
          <div style={{ padding: '0.7rem 0.9rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 700, background: planteleIncompletos ? '#fef3c7' : '#dcfce7', color: planteleIncompletos ? '#92400e' : '#166534' }}>
            {planteleConEstancia === 0
              ? 'Ningún nivel tiene estancia: marca al menos uno arriba.'
              : planteleIncompletos
                ? `⚠️ Faltan horarios en ${planteleIncompletos} de ${planteleConEstancia} planteles. Complétalos para que la estancia funcione en todos.`
                : `✅ Los ${planteleConEstancia} planteles con estancia tienen su horario de inicio completo.`}
          </div>

          {arbol.map(({ plantel, niveles }) => {
            const est = estado.find((e) => e.plantel === plantel)
            const sinEstancia = est.aplican === 0
            const completo = !sinEstancia && est.faltantes.length === 0
            const hPlantel = config.horarios?.[claveHorario(plantel)] || ''
            return (
              <details key={plantel} open={!sinEstancia && !completo} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: '0.7rem', padding: '0.2rem 0.9rem' }}>
                <summary style={{ cursor: 'pointer', padding: '0.7rem 0', display: 'flex', alignItems: 'center', gap: '0.7rem', fontWeight: 700 }}>
                  <span style={{ flex: 1 }}>{plantel}</span>
                  {sinEstancia
                    ? <Badge color="#475569" bg="#e2e8f0">Sin estancia</Badge>
                    : completo
                      ? <Badge color="#166534" bg="#dcfce7">✓ Completo</Badge>
                      : <Badge color="#92400e" bg="#fef3c7">Faltan {est.faltantes.length}</Badge>}
                </summary>

                {sinEstancia ? (
                  <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Ninguno de los niveles de este plantel tiene estancia.</p>
                ) : (
                  <div style={{ paddingBottom: '0.8rem' }}>
                    <FilaHora etiqueta={`Todo el plantel ${plantel}`} nota="Aplica a todos los niveles y grados que no tengan hora propia" valor={hPlantel} onChange={(v) => cambiarHorario(claveHorario(plantel), v)} fuerte />
                    {niveles.map(({ nivel, grados }) => {
                      if (!nivelAplicaEstancia(nivel, config)) {
                        return <div key={nivel} style={{ marginLeft: '1.2rem', padding: '0.4rem 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>{nivel}: sin estancia</div>
                      }
                      const hNivel = horaPropiaNivel(config, plantel, nivel)
                      const heredadaNivel = hNivel || hPlantel
                      return (
                        <div key={nivel} style={{ marginLeft: '1.2rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.9rem', marginTop: '0.4rem' }}>
                          <FilaHora etiqueta={`Nivel ${nivel}`} nota={`Aplica a ${grados.length ? 'todos sus grados' : 'este nivel'}`} valor={hNivel} heredado={hPlantel ? `Hereda ${hPlantel} del plantel` : ''} onChange={(v) => cambiarHorario(claveHorario(plantel, nivel), v)} />
                          {grados.map((grado) => {
                            const hGrado = config.horarios?.[claveHorario(plantel, nivel, grado)] || ''
                            return (
                              <div key={grado} style={{ marginLeft: '1.2rem' }}>
                                <FilaHora etiqueta={`Grado ${grado}`} valor={hGrado} heredado={heredadaNivel ? `Hereda ${heredadaNivel}` : ''} onChange={(v) => cambiarHorario(claveHorario(plantel, nivel, grado), v)} />
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                    {!completo && <p style={{ color: '#92400e', fontSize: '0.8rem', marginBottom: 0 }}>Sin horario: {est.faltantes.join(', ')}</p>}
                  </div>
                )}
              </details>
            )
          })}
          <button className="btn" type="button" disabled={actualizando} onClick={actualizarEstructura} style={{ fontSize: '0.78rem' }}>{actualizando ? 'Leyendo alumnos…' : '↻ Actualizar planteles/niveles/grados desde alumnos'}</button>
        </>
      )}
      <div style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" disabled={guardando} type="button" onClick={handleGuardar}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
        {guardado && <span style={{ color: 'var(--green-600)', fontSize: '0.85rem', marginLeft: '0.8rem' }}>Guardado ✓</span>}
      </div>
    </div>
    </>
  )
}

function Tarifa({ label, value, onChange }) {
  return <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.8rem' }}>{label}<input className="input" type="number" min={0} step="0.01" value={value ?? 0} onChange={e => onChange(e.target.value)} style={{ marginTop: '0.3rem' }} /></label>
}

function Badge({ children, color, bg }) {
  return <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 999, color, background: bg }}>{children}</span>
}

function FilaHora({ etiqueta, nota, valor, heredado, onChange, fuerte }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', padding: '0.35rem 0' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: fuerte ? 700 : 600 }}>{etiqueta}</div>
        {(nota || (!valor && heredado)) && <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{valor ? nota : (heredado || nota)}</div>}
      </div>
      <input className="input" type="time" value={valor || ''} onChange={(e) => onChange(e.target.value)} style={{ width: 130 }} />
      {valor && <button type="button" className="btn" onClick={() => onChange('')} title="Quitar y heredar" style={{ fontSize: '0.75rem' }}>Heredar</button>}
    </div>
  )
}
