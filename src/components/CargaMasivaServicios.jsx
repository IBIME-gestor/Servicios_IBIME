import { useEffect, useMemo, useState } from 'react'
import { listarAlumnosActivos, filtrarAlumnos, filtrarPorPlantel, descripcionAlumno } from '../lib/alumnos'
import {
  registrarConsumosRetroactivos,
  registrarEstanciaRetroactiva,
} from '../lib/cargaRetroactiva'
import { useAuth } from '../contexts/AuthContext'
import { registrarLog } from '../lib/log'
import { tienePermiso } from '../lib/permisos'

function fechaLocalInput(date = new Date()) {
  const d = new Date(date)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function dateFromInput(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function horaObj(value) {
  const [h, m] = value.split(':').map(Number)

  return {
    horas: h,
    minutos: m,
  }
}

export default function CargaMasivaServicios({ tipo = 'comedor' }) {
  const { user } = useAuth()

  const [alumnos, setAlumnos] = useState([])
  const [texto, setTexto] = useState('')
  const [seleccionados, setSeleccionados] = useState([])

  const [fecha, setFecha] = useState(fechaLocalInput())
  const [tipoComedor, setTipoComedor] = useState('desayuno')

  const [hora, setHora] = useState(
    tipo === 'comedor' ? '08:00' : '14:00'
  )

  const [horaSalida, setHoraSalida] = useState('17:00')
  const [retiradoPor, setRetiradoPor] = useState('Carga masiva')

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true

    listarAlumnosActivos()
      .then((lista) => {
        if (activo) setAlumnos(filtrarPorPlantel(lista, user))
      })
      .catch((e) => {
        if (activo) {
          setError(
            e.message || 'No se pudo cargar la lista de alumnos.'
          )
        }
      })

    return () => {
      activo = false
    }
  }, [])

  const sugerencias = useMemo(() => {
    return filtrarAlumnos(alumnos, texto).filter(
      (a) => !seleccionados.some((x) => x.id === a.id)
    )
  }, [alumnos, texto, seleccionados])

  // La carga masiva pertenece exclusivamente a Administración.
  if (!tienePermiso(user, 'admin.cargas_masivas')) {
    return null
  }

  function agregar(alumno) {
    setSeleccionados((prev) => [...prev, alumno])
    setTexto('')
    setError('')
  }

  function quitar(id) {
    setSeleccionados((prev) => prev.filter((a) => a.id !== id))
  }

  async function guardar() {
    if (!seleccionados.length) {
      setError('Agrega al menos un alumno a la carga.')
      return
    }

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      if (tipo === 'comedor') {
        const resultado = await registrarConsumosRetroactivos({
          alumnos: seleccionados,
          tipo: tipoComedor,
          fecha: dateFromInput(fecha),
          hora: horaObj(hora),
          registradoPor: user.uid,
        })

        setMensaje(
          `${resultado.creados} registro(s) creado(s). ` +
            `${resultado.omitidos} ya existían y se omitieron.`
        )
      } else {
        let creados = 0
        let omitidos = 0

        for (const alumno of seleccionados) {
          const resultado = await registrarEstanciaRetroactiva({
            alumno,
            fecha: dateFromInput(fecha),
            horaEntrada: horaObj(hora),
            horaSalida: horaObj(horaSalida),
            retiradoPor,
            registradoPor: user.uid,
          })

          if (resultado.creado) {
            creados += 1
          } else {
            omitidos += 1
          }
        }

        setMensaje(
          `${creados} estancia(s) creadas. ` +
            `${omitidos} ya existían y se omitieron.`
        )
      }

      registrarLog({ user, accion: `carga_masiva.${tipo}`, modulo: tipo === 'estancia' ? 'estancia' : 'comedor', entidad: tipo === 'estancia' ? 'estancias' : 'consumos', detalle: { alumnos: seleccionados.map((a) => a.matricula || a.id), cantidad: seleccionados.length } })
      setSeleccionados([])
      setTexto('')
    } catch (e) {
      setError(
        e.message || 'No se pudo realizar la carga masiva.'
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: '1rem',
        borderLeft: '3px solid var(--red-600)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0,1fr) minmax(300px,420px)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div>
          <h3 style={{ marginTop: 0 }}>
            📦 Carga masiva de{' '}
            {tipo === 'comedor' ? 'comedor' : 'estancia'}
          </h3>

          <p
            style={{
              color: 'var(--ink-muted)',
              fontSize: '0.8rem',
            }}
          >
            Selecciona alumnos y déjalos en la cola. Al guardar,
            los registros se crean en Firestore con la fecha del
            servicio.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2,minmax(0,1fr))',
              gap: '0.6rem',
            }}
          >
            <label>
              Fecha
              <input
                className="input"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>

            {tipo === 'comedor' ? (
              <label>
                Servicio
                <select
                  className="input"
                  value={tipoComedor}
                  onChange={(e) =>
                    setTipoComedor(e.target.value)
                  }
                >
                  <option value="desayuno">
                    Desayuno
                  </option>
                  <option value="comida">
                    Comida
                  </option>
                </select>
              </label>
            ) : (
              <label>
                Entrada
                <input
                  className="input"
                  type="time"
                  value={hora}
                  onChange={(e) =>
                    setHora(e.target.value)
                  }
                />
              </label>
            )}

            {tipo === 'comedor' ? (
              <label>
                Hora
                <input
                  className="input"
                  type="time"
                  value={hora}
                  onChange={(e) =>
                    setHora(e.target.value)
                  }
                />
              </label>
            ) : (
              <label>
                Retiro
                <input
                  className="input"
                  type="time"
                  value={horaSalida}
                  onChange={(e) =>
                    setHoraSalida(e.target.value)
                  }
                />
              </label>
            )}

            {tipo === 'estancia' && (
              <label>
                Quién retira
                <input
                  className="input"
                  value={retiradoPor}
                  onChange={(e) =>
                    setRetiradoPor(e.target.value)
                  }
                />
              </label>
            )}
          </div>

          <div
            style={{
              marginTop: '0.8rem',
              position: 'relative',
            }}
          >
            <input
              className="input"
              placeholder="Buscar alumno por nombre, matrícula o grupo…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />

            {sugerencias.length > 0 && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  left: 0,
                  right: 0,
                  top: '105%',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {sugerencias
                  .slice(0, 30)
                  .map((alumno) => (
                    <button
                      key={alumno.id}
                      type="button"
                      onClick={() => agregar(alumno)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.55rem',
                        border: 0,
                        borderBottom:
                          '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{alumno.nombre}</strong>

                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--ink-muted)',
                        }}
                      >
                        {descripcionAlumno(alumno)}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-sunken)',
            borderRadius: 10,
            padding: '0.8rem',
            minHeight: 220,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <strong>Cola de carga</strong>

            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--ink-muted)',
              }}
            >
              {seleccionados.length} alumno(s)
            </span>
          </div>

          <div
            style={{
              marginTop: '0.6rem',
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {seleccionados.length === 0 ? (
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--ink-muted)',
                }}
              >
                Los alumnos que selecciones se formarán aquí,
                del lado derecho.
              </p>
            ) : (
              seleccionados.map((alumno) => (
                <div
                  key={alumno.id}
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0',
                    borderTop:
                      '1px solid var(--border)',
                  }}
                >
                  <div>
                    <strong
                      style={{ fontSize: '0.8rem' }}
                    >
                      {alumno.nombre}
                    </strong>

                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      {alumno.matricula}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => quitar(alumno.id)}
                  >
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              marginTop: '0.8rem',
            }}
            disabled={
              guardando || !seleccionados.length
            }
            onClick={guardar}
          >
            {guardando
              ? 'Guardando…'
              : 'Guardar carga masiva'}
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          style={{
            marginTop: '0.8rem',
            color: 'var(--green-600)',
            fontSize: '0.82rem',
          }}
        >
          ✓ {mensaje}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '0.8rem',
            color: 'var(--red-600)',
            fontSize: '0.82rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
