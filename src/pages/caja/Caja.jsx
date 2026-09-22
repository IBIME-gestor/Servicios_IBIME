import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos, filtrarAlumnos } from '../../lib/alumnos'
import { consumosSemanaAlumno } from '../../lib/consumos'
import { estanciasSemanaAlumno } from '../../lib/estancia'
import { obtenerConfigComedor, calcularTotalComedor } from '../../lib/pricingComedor'
import { obtenerCobroAlumno, marcarCapturado, marcarPagado } from '../../lib/cobros'
import { formatoFecha } from '../../lib/fechas'

export default function Caja() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [consumos, setConsumos] = useState([])
  const [estancias, setEstancias] = useState([])
  const [configComedor, setConfigComedor] = useState(null)
  const [cobro, setCobro] = useState({ capturado: false, pagado: false })
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnos)
    obtenerConfigComedor().then(setConfigComedor)
  }, [])

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function seleccionar(alumno) {
    setSeleccionado(alumno)
    setTexto('')
    setCargando(true)
    try {
      const [c, e, cb] = await Promise.all([
        consumosSemanaAlumno(alumno.id),
        estanciasSemanaAlumno(alumno.id),
        obtenerCobroAlumno(alumno.id),
      ])
      setConsumos(c)
      setEstancias(e.filter((x) => x.horaSalida))
      setCobro(cb)
    } finally {
      setCargando(false)
    }
  }

  const { desayunos, comidas, total: totalCafeteria } = calcularTotalComedor(consumos, configComedor || undefined)
  const totalEstancia = estancias.reduce((sum, e) => sum + (e.costo || 0), 0)
  const totalGeneral = totalCafeteria + totalEstancia

  async function alternarCapturado(marcar) {
    setGuardando(true)
    try {
      await marcarCapturado({ alumno: seleccionado, capturado: marcar, totalCafeteria, totalEstancia, usuario: user.email })
      setCobro((prev) => ({ ...prev, capturado: marcar }))
    } finally {
      setGuardando(false)
    }
  }

  async function alternarPagado(marcar) {
    setGuardando(true)
    try {
      await marcarPagado({ alumnoId: seleccionado.id, pagado: marcar, usuario: user.email })
      setCobro((prev) => ({ ...prev, pagado: marcar }))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>💳 Caja · Concentrado semanal</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>
        Busca al alumno para ver su resumen de la semana (cafetería + estancia) y hacer el cobro.
      </p>

      <div style={{ position: 'relative', maxWidth: 420, marginBottom: '1.5rem' }}>
        <input
          className="input"
          placeholder="Buscar alumno…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {sugerencias.length > 0 && (
          <div className="card" style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 5, maxHeight: 260, overflowY: 'auto' }}>
            {sugerencias.map((a) => (
              <button
                key={a.id}
                onClick={() => seleccionar(a)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              >
                <strong>{a.nombre}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{a.grado} {a.grupo} · {a.matricula}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {seleccionado && !cargando && (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 620 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{seleccionado.nombre}</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
            {seleccionado.grado} {seleccionado.grupo} · {seleccionado.matricula}
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.25rem 0' }}>
            <div style={{ borderLeft: '3px solid var(--mod-cafeteria)', paddingLeft: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>🍽️ Cafetería esta semana</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${totalCafeteria} MXN</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{desayunos} desayuno(s) · {comidas} comida(s)</div>
            </div>
            <div style={{ borderLeft: '3px solid var(--mod-estancia)', paddingLeft: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>🏫 Estancia esta semana</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${totalEstancia} MXN</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{estancias.length} sesión(es)</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginBottom: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>Total a cobrar</strong>
            <strong style={{ fontSize: '1.3rem', color: 'var(--red-600)' }}>${totalGeneral} MXN</strong>
          </div>

          <div style={{ background: 'var(--surface-sunken)', borderRadius: 6, padding: '0.9rem 1rem', marginBottom: '1.1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.6rem' }}>
              <input
                type="checkbox"
                checked={cobro.capturado}
                disabled={guardando}
                onChange={(e) => alternarCapturado(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Ya se capturó el cobro</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: cobro.capturado ? 'pointer' : 'not-allowed', opacity: cobro.capturado ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={cobro.pagado}
                disabled={guardando || !cobro.capturado}
                onChange={(e) => alternarPagado(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Ya está pagado (verificado)</span>
            </label>
          </div>

          {consumos.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>Desglose cafetería</h3>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1rem' }}>
                {consumos.map((c) => (
                  <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{c.tipo === 'desayuno' ? 'Desayuno' : 'Comida'}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>{c.fecha ? formatoFecha(c.fecha) : '—'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {estancias.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>Desglose estancia</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {estancias.map((e) => (
                  <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{e.horaEntrada ? formatoFecha(e.horaEntrada) : '—'} · {e.minutos} min</span>
                    <span style={{ fontWeight: 600 }}>${e.costo} MXN</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
