import { useEffect, useMemo, useState } from 'react'
import { listarAlumnosActivos, filtrarAlumnos } from '../../lib/alumnos'
import {
  registrarConsumosRetroactivos,
  registrarEstanciaRetroactiva,
  consumosDelDia,
  estanciasDelDia,
} from '../../lib/cargaRetroactiva'
import { useAuth } from '../../contexts/AuthContext'
import { formatoFecha, formatoHora } from '../../lib/fechas'

function horaInicial() {
  const d = new Date()
  return { horas: d.getHours(), minutos: d.getMinutes() }
}

function fechaLocalInput(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateFromInput(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function horaObj(value) {
  const [h, m] = value.split(':').map(Number)
  return { horas: h, minutos: m }
}

export default function CargaRetroactivaTab() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [fecha, setFecha] = useState(fechaLocalInput(new Date(Date.now() - 86400000)))
  const hoy = fechaLocalInput(new Date())
  const [tipo, setTipo] = useState('desayuno')
  const [hora, setHora] = useState('08:00')
  const [texto, setTexto] = useState('')
  const [seleccionados, setSeleccionados] = useState([])
  const [estado, setEstado] = useState({ cargando: false, mensaje: '', error: '' })

  const [alumnoEstancia, setAlumnoEstancia] = useState(null)
  const [textoEstancia, setTextoEstancia] = useState('')
  const [horaEntrada, setHoraEntrada] = useState('14:00')
  const [horaSalida, setHoraSalida] = useState('17:00')
  const [retiradoPor, setRetiradoPor] = useState('Captura administrativa retroactiva')

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnos)
  }, [])

  const sugerencias = useMemo(() => filtrarAlumnos(alumnos, texto), [alumnos, texto])
  const sugerenciasEstancia = useMemo(() => filtrarAlumnos(alumnos, textoEstancia), [alumnos, textoEstancia])

  function alternarAlumno(alumno) {
    setSeleccionados((prev) => prev.some((x) => x.id === alumno.id)
      ? prev.filter((x) => x.id !== alumno.id)
      : [...prev, alumno])
  }

  async function guardarComedor() {
    if (!seleccionados.length) {
      setEstado({ cargando: false, mensaje: '', error: 'Selecciona al menos un alumno.' })
      return
    }
    setEstado({ cargando: true, mensaje: '', error: '' })
    try {
      const res = await registrarConsumosRetroactivos({
        alumnos: seleccionados,
        tipo,
        fecha: dateFromInput(fecha),
        hora: horaObj(hora),
        registradoPor: user.uid,
      })
      setEstado({
        cargando: false,
        mensaje: `${res.creados} registro(s) creado(s) para ${tipo === 'desayuno' ? 'desayuno' : 'comida'}. ${res.omitidos} ya existían y se omitieron.`,
        error: '',
      })
      setSeleccionados([])
    } catch (e) {
      setEstado({ cargando: false, mensaje: '', error: e.message || 'No se pudo guardar la carga retroactiva.' })
    }
  }

  async function guardarEstancia() {
    if (!alumnoEstancia) {
      setEstado({ cargando: false, mensaje: '', error: 'Selecciona un alumno.' })
      return
    }
    setEstado({ cargando: true, mensaje: '', error: '' })
    try {
      const res = await registrarEstanciaRetroactiva({
        alumno: alumnoEstancia,
        fecha: dateFromInput(fecha),
        horaEntrada: horaObj(horaEntrada),
        horaSalida: horaObj(horaSalida),
        retiradoPor,
        registradoPor: user.uid,
      })
      setEstado({
        cargando: false,
        mensaje: res.creado ? `Estancia de ${alumnoEstancia.nombre} registrada en ${fecha}.` : 'Ese alumno ya tiene una estancia registrada en esa fecha; no se duplicó.',
        error: '',
      })
      if (res.creado) {
        setAlumnoEstancia(null)
        setTextoEstancia('')
      }
    } catch (e) {
      setEstado({ cargando: false, mensaje: '', error: e.message || 'No se pudo guardar la estancia.' })
    }
  }

  async function revisarDia() {
    if (!fecha) return
    setEstado({ cargando: true, mensaje: '', error: '' })
    try {
      const [c, e] = await Promise.all([consumosDelDia(dateFromInput(fecha)), estanciasDelDia(dateFromInput(fecha))])
      setEstado({
        cargando: false,
        mensaje: `Ese día ya existen ${c.length} consumo(s) de comedor y ${e.length} estancia(s).`,
        error: '',
      })
    } catch (err) {
      setEstado({ cargando: false, mensaje: '', error: err.message || 'No se pudo consultar la fecha.' })
    }
  }

  return (
    <div style={{ maxWidth: 1050 }}>
      <h2 style={{ marginTop: 0 }}>🕘 Carga retroactiva</h2>
      <p style={{ color: 'var(--ink-muted)', maxWidth: 800 }}>
        Permite al administrador capturar un servicio de una fecha pasada como si se hubiera registrado ese día.
        La fecha/hora del servicio se conserva y, por separado, Firestore guarda cuándo se hizo realmente la captura.
      </p>

      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderLeft: '3px solid var(--red-600)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.3rem' }}>Fecha que se va a simular</label>
            <input className="input" type="date" max={hoy} value={fecha} onChange={(e) => { setFecha(e.target.value); setEstado({ cargando: false, mensaje: '', error: '' }) }} />
          </div>
          <div>
            <strong style={{ fontSize: '0.9rem' }}>Modo administrador</strong>
            <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              Lo que captures aquí aparecerá en reportes/caja con la fecha seleccionada, no con la fecha de hoy.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
        <section className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginTop: 0 }}>🍽️ Comedor</h3>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
            Selecciona varios alumnos y registra desayuno o comida con la hora aproximada del día simulado.
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="desayuno">Desayuno</option>
              <option value="comida">Comida</option>
            </select>
            <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ maxWidth: 150 }} />
          </div>

          <input
            className="input"
            placeholder="Buscar alumno por nombre, matrícula o grupo…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />

          {sugerencias.length > 0 && (
            <div className="card" style={{ marginTop: '0.5rem', maxHeight: 220, overflowY: 'auto' }}>
              {sugerencias.map((a) => {
                const checked = seleccionados.some((x) => x.id === a.id)
                return (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} onChange={() => alternarAlumno(a)} />
                    <span><strong>{a.nombre}</strong><br /><small>{a.grado} {a.grupo} · {a.matricula}</small></span>
                  </label>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}>
            <strong>{seleccionados.length}</strong> alumno(s) seleccionados
          </div>

          <button className="btn btn-primary" style={{ marginTop: '0.9rem' }} disabled={estado.cargando} onClick={guardarComedor}>
            {estado.cargando ? 'Guardando…' : 'Guardar comedor de ese día'}
          </button>
        </section>

        <section className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginTop: 0 }}>🏫 Estancia</h3>
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
            Captura una sesión completa indicando entrada y retiro. El sistema calcula el costo con la configuración de estancia.
          </p>

          <input
            className="input"
            placeholder="Buscar alumno…"
            value={textoEstancia}
            onChange={(e) => setTextoEstancia(e.target.value)}
          />

          {sugerenciasEstancia.length > 0 && (
            <div className="card" style={{ marginTop: '0.5rem', maxHeight: 180, overflowY: 'auto' }}>
              {sugerenciasEstancia.map((a) => (
                <button key={a.id} onClick={() => { setAlumnoEstancia(a); setTextoEstancia(a.nombre) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 0.4rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                  <strong>{a.nombre}</strong>
                  <br /><small>{a.grado} {a.grupo} · {a.matricula}</small>
                </button>
              ))}
            </div>
          )}

          {alumnoEstancia && (
            <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'var(--surface-sunken)', borderRadius: 6 }}>
              <strong>{alumnoEstancia.nombre}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{alumnoEstancia.grado} {alumnoEstancia.grupo} · {alumnoEstancia.matricula}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginTop: '0.8rem' }}>
            <label style={{ fontSize: '0.82rem' }}>Entrada
              <input className="input" type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
            </label>
            <label style={{ fontSize: '0.82rem' }}>Retiro
              <input className="input" type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} />
            </label>
          </div>

          <label style={{ display: 'block', fontSize: '0.82rem', marginTop: '0.8rem' }}>
            Quién retira
            <input className="input" value={retiradoPor} onChange={(e) => setRetiradoPor(e.target.value)} />
          </label>

          <button className="btn btn-primary" style={{ marginTop: '0.9rem' }} disabled={estado.cargando} onClick={guardarEstancia}>
            {estado.cargando ? 'Guardando…' : 'Guardar estancia de ese día'}
          </button>
        </section>
      </div>

      <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1.25rem' }}>
        <button className="btn btn-outline" disabled={estado.cargando} onClick={revisarDia}>
          Revisar qué ya existe en esta fecha
        </button>
        {estado.mensaje && <p style={{ color: 'var(--green-600)', marginBottom: 0 }}>{estado.mensaje}</p>}
        {estado.error && <p style={{ color: 'var(--red-600)', marginBottom: 0 }}>{estado.error}</p>}
      </div>
    </div>
  )
}
