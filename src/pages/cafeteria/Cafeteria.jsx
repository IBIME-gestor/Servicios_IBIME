import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  listarAlumnosActivos,
  filtrarAlumnos,
  filtrarPorPlantel,
  descripcionAlumno,
  sinPlantelAsignado,
} from '../../lib/alumnos'
import { registrarConsumo, consumosSemanaAlumno } from '../../lib/consumos'
import { consumosDelDia } from '../../lib/cargaRetroactiva'
import { registrarLog } from '../../lib/log'
import { formatoFecha, formatoHora } from '../../lib/fechas'
import CargaMasivaServicios from '../../components/CargaMasivaServicios'
import { tienePermiso } from '../../lib/permisos'

export default function Cafeteria() {
  const { user } = useAuth()
  const [alumnosTodos, setAlumnosTodos] = useState([])
  const [texto, setTexto] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [resumen, setResumen] = useState([])
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [mostrarCargaMasiva, setMostrarCargaMasiva] = useState(false)
  const [consumosHoy, setConsumosHoy] = useState([])
  const [soloMias, setSoloMias] = useState(false)

  useEffect(() => {
    listarAlumnosActivos().then(setAlumnosTodos)
  }, [])

  // Cada usuario solo ve y captura alumnos de su plantel.
  const alumnos = useMemo(() => filtrarPorPlantel(alumnosTodos, user), [alumnosTodos, user])
  const mapaAlumnos = useMemo(() => new Map(alumnos.map((a) => [a.id, a])), [alumnos])

  // Las capturas del día salen de Firestore, así que no se pierden al cambiar de módulo.
  async function cargarCapturasHoy() {
    try {
      setConsumosHoy(await consumosDelDia(new Date()))
    } catch (err) {
      console.error(err)
    }
  }
  useEffect(() => { cargarCapturasHoy() }, [])

  const capturasHoy = useMemo(() => {
    return consumosHoy
      .filter((c) => mapaAlumnos.has(c.alumnoId))
      .filter((c) => (soloMias ? c.registradoPor === user?.uid : true))
      .map((c) => {
        const a = mapaAlumnos.get(c.alumnoId)
        return {
          id: c.id,
          nombre: c.alumnoNombre || a?.nombre || '',
          grupo: c.alumnoGrupo || a?.grupo || '',
          matricula: a?.matricula || '',
          descripcion: descripcionAlumno(a, { matricula: false }),
          tipo: c.tipo,
          hora: c.capturadoEn?.toDate?.() || c.fecha,
          propia: c.registradoPor === user?.uid,
        }
      })
      .sort((x, y) => (y.hora?.getTime?.() || 0) - (x.hora?.getTime?.() || 0))
  }, [consumosHoy, mapaAlumnos, soloMias, user])

  const sugerencias = filtrarAlumnos(alumnos, texto)

  async function seleccionar(alumno) {
    setSeleccionado(alumno)
    setTexto('')
    setAviso('')
    const semana = await consumosSemanaAlumno(alumno.id)
    setResumen(semana)
  }

  async function registrar(tipo) {
    if (!seleccionado || registrando) return
    setRegistrando(true)
    setAviso('')
    try {
      const resultado = await registrarConsumo({
        alumno: seleccionado,
        tipo,
        registradoPor: user.uid,
      })

      if (resultado?.duplicado) {
        setAviso(`Ya está registrado ${tipo === 'desayuno' ? 'el desayuno' : 'la comida'} de ${seleccionado.nombre} para hoy. No se creó otro registro.`)
      } else {
        registrarLog({
          user, accion: `cafeteria.registrar_${tipo}`, modulo: 'cafeteria', entidad: 'consumos',
          alumno: seleccionado, detalle: { tipo },
        })
        await cargarCapturasHoy()
        setAviso(`Registrado: ${tipo === 'desayuno' ? 'Desayuno' : 'Comida'} ✓`)
        const semana = await consumosSemanaAlumno(seleccionado.id)
        setResumen(semana)
      }
    } catch (error) {
      console.error(error)
      setAviso('No se pudo registrar el consumo. Intenta nuevamente.')
    } finally {
      setRegistrando(false)
    }
  }

  function limpiarPanel() {
    // Los registros ya están guardados; esto solo prepara el panel para otra captura.
    setSeleccionado(null)
    setResumen([])
    setTexto('')
    setAviso('')
  }

  return (
    <div className="cafeteria-page">
      <div className="cafeteria-header">
        <div>
          <h1 style={{ marginTop: 0 }}>🍽️ Cafetería</h1>
          <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>
            Busca al alumno y registra su consumo de desayuno o comida. Cada servicio se registra una sola vez por día.
          </p>
        </div>
        {seleccionado && (
          <button type="button" className="btn btn-outline" onClick={limpiarPanel}>
            ✓ Listo, siguiente alumno
          </button>
        )}
      </div>

      {sinPlantelAsignado(user) && (
        <div className="card form-error">
          Tu cuenta aún no tiene un plantel asignado, por eso no ves alumnos. Pide al administrador que te lo asigne.
        </div>
      )}

      {tienePermiso(user, 'cafeteria.carga_masiva') && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setMostrarCargaMasiva((v) => !v)}
          >
            📦 {mostrarCargaMasiva ? 'Ocultar carga masiva' : 'Carga masiva'}
          </button>

          {mostrarCargaMasiva && (
            <div style={{ marginTop: '0.8rem' }}>
              <CargaMasivaServicios tipo="comedor" />
            </div>
          )}
        </div>
      )}

      <div className="cafeteria-layout">
        <div className="cafeteria-captura">
          <div className="cafeteria-search" style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <input
              className="input"
              placeholder="Buscar alumno para registrar consumo…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />

            {sugerencias.length > 0 && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {sugerencias.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => seleccionar(a)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.6rem 0.8rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <strong>{a.nombre}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                      {descripcionAlumno(a)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '0.95rem' }}>
            Alumno seleccionado {seleccionado ? '(1)' : '(0)'}
          </h3>

          {!seleccionado ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
              Selecciona un alumno para capturar su servicio.
            </p>
          ) : (
            <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '0.6rem' }}>
              <div className="cafeteria-selected-row">
                <div>
                  <strong>{seleccionado.nombre}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                    {descripcionAlumno(seleccionado)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setSeleccionado(null)
                    setResumen([])
                    setAviso('')
                  }}
                >
                  Cambiar
                </button>
              </div>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="card cafeteria-register-card">
            <h3 style={{ marginTop: 0 }}>Registrar consumo</h3>

            <div style={{ marginBottom: '1rem' }}>
              <strong>{seleccionado.nombre}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                {descripcionAlumno(seleccionado)}
              </div>
              {seleccionado.tutor && (
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  Tutor: {seleccionado.tutor}{seleccionado.telefonoTutor ? ` · Tel. ${seleccionado.telefonoTutor}` : ''}
                </div>
              )}
            </div>

            <div className="cafeteria-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={registrando}
                onClick={() => registrar('desayuno')}
              >
                Registrar desayuno
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={registrando}
                onClick={() => registrar('comida')}
              >
                Registrar comida
              </button>
            </div>

            {aviso && (
              <p style={{ color: aviso.startsWith('Ya está') ? 'var(--amber-500)' : 'var(--green-600)', fontSize: '0.85rem' }}>
                {aviso}
              </p>
            )}

            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              Resumen de esta semana
            </h3>

            {resumen.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
                Sin consumos registrados esta semana.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {resumen.map((c) => (
                  <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                    <span>{c.tipo === 'desayuno' ? 'Desayuno' : 'Comida'}</span>
                    <span style={{ color: 'var(--ink-muted)', textAlign: 'right' }}>
                      {c.fecha ? `${formatoFecha(c.fecha)} · ${formatoHora(c.fecha)}` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <aside className="card cafeteria-daily-card">
          <div className="cafeteria-daily-header">
            <div>
              <h3 style={{ margin: 0 }}>Capturas de hoy</h3>
              <span>{capturasHoy.length} {capturasHoy.length === 1 ? 'registro' : 'registros'}</span>
            </div>
            <button type="button" className="btn btn-outline cafeteria-clear-btn" onClick={cargarCapturasHoy}>
              Actualizar
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem', padding: '.55rem 0 .2rem' }}>
            <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} />
            Solo mis capturas
          </label>

          {capturasHoy.length === 0 ? (
            <div className="cafeteria-empty-list">
              <span>📋</span>
              <p>Todavía no hay capturas hoy.</p>
              <small>Se guarda al presionar el botón y esta lista se conserva aunque cambies de módulo.</small>
            </div>
          ) : (
            <div className="cafeteria-daily-list">
              {capturasHoy.map((captura) => (
                <div className="cafeteria-daily-item" key={captura.id}>
                  <div className="cafeteria-daily-check">✓</div>
                  <div className="cafeteria-daily-info">
                    <strong>{captura.nombre}</strong>
                    <span>{captura.descripcion || captura.grupo || 'Sin grupo'} · {captura.matricula || 'Sin matrícula'}</span>
                  </div>
                  <div className="cafeteria-daily-service">
                    <strong>{captura.tipo === 'desayuno' ? 'Desayuno' : 'Comida'}</strong>
                    <span>{formatoHora(captura.hora)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
