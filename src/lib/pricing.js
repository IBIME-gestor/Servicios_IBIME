import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { normalizar } from './alumnos'

export const CONFIG_ESTANCIA_DEFAULT = {
  horaInicio: '14:00', // respaldo si el alumno no tiene nivel reconocido
  horaInicioPreescolar: '14:00',
  horaInicioPrimaria: '14:00',
  horaInicioSecundaria: '14:00',
  horariosPorPlantel: {},
  minutosGracia: 0,
  costo30Min: 0,
  costo31a60Min: 0, // si queda en 0 se usa la tarifa de 1 hora
  costo1Hora: 0,
  mensual1Hora: 0,
  mensual2Horas: 0,
  mensual3Horas: 0,
}

export async function obtenerConfigEstancia() {
  const ref = doc(db, 'config', 'estancia')
  const snap = await getDoc(ref)
  return snap.exists() ? { ...CONFIG_ESTANCIA_DEFAULT, ...snap.data() } : CONFIG_ESTANCIA_DEFAULT
}

export async function guardarConfigEstancia(config) {
  const ref = doc(db, 'config', 'estancia')
  await setDoc(ref, {
    ...config,
    horaInicioPreescolar: config.horaInicioPreescolar || config.horaInicio || '14:00',
    horaInicioPrimaria: config.horaInicioPrimaria || config.horaInicio || '14:00',
    horaInicioSecundaria: config.horaInicioSecundaria || config.horaInicio || '14:00',
    minutosGracia: Number(config.minutosGracia || 0),
    costo30Min: Number(config.costo30Min || 0),
    costo31a60Min: Number(config.costo31a60Min || 0),
    costo1Hora: Number(config.costo1Hora || 0),
    mensual1Hora: Number(config.mensual1Hora || 0),
    mensual2Horas: Number(config.mensual2Horas || 0),
    mensual3Horas: Number(config.mensual3Horas || 0),
  }, { merge: true })
}

/**
 * Tarifa escalonada:
 * 1-30 min  = tarifa de 30 min.
 * 31-60 min = tarifa de 31 a 60 min (si no se configura, la de 1 hora).
 * Cada hora completa suma la tarifa de 1 hora y el sobrante se cobra por bloque:
 *   sobrante 1-30 min = tarifa de 30 min; sobrante 31-59 min = tarifa de 31 a 60 min.
 * Ej.: 42 min = bloque 31-60; 1h25 = 1h + 30 min; 1h45 = 1h + bloque 31-60.
 */
export function calcularCostoEstancia(minutosTotales, config = CONFIG_ESTANCIA_DEFAULT) {
  const minutosCobrables = Math.max(0, Number(minutosTotales || 0) - Number(config.minutosGracia || 0))
  if (minutosCobrables === 0) {
    return { minutosCobrables: 0, costo: 0, desglose: 'Dentro del tiempo de gracia, sin costo.' }
  }

  const tarifa30 = Number(config.costo30Min || 0)
  const tarifaHora = Number(config.costo1Hora || 0)
  const tarifa31a60 = Number(config.costo31a60Min || 0) || tarifaHora
  const horas = Math.floor(minutosCobrables / 60)
  const resto = minutosCobrables % 60
  const bloques30 = resto >= 1 && resto <= 30 ? 1 : 0
  const bloques31a60 = resto >= 31 ? 1 : 0
  const costo = (horas * tarifaHora) + (bloques30 * tarifa30) + (bloques31a60 * tarifa31a60)

  const partes = []
  if (horas) partes.push(`${horas} h × $${tarifaHora.toFixed(2)}`)
  if (bloques30) partes.push(`1-30 min × $${tarifa30.toFixed(2)}`)
  if (bloques31a60) partes.push(`31-60 min × $${tarifa31a60.toFixed(2)}`)
  const desglose = `${minutosCobrables} min cobrables: ${partes.join(' + ')} = $${costo.toFixed(2)} MXN`

  return { minutosCobrables, horas, bloques30, bloques31a60, costo, desglose }
}

export function obtenerTarifaMensualEstancia(horas, config = CONFIG_ESTANCIA_DEFAULT) {
  const h = Number(horas)
  if (h === 1) return Number(config.mensual1Hora || 0)
  if (h === 2) return Number(config.mensual2Horas || 0)
  if (h === 3) return Number(config.mensual3Horas || 0)
  return 0
}

export function minutosEntre(inicio, fin) {
  return Math.round((fin.getTime() - inicio.getTime()) / 60000)
}

/** Clasifica el nivel del alumno: 'preescolar' | 'primaria' | 'secundaria' | null. */
export function claveNivelEstancia(nivel) {
  const n = normalizar(nivel)
  if (!n) return null
  if (/(prees|kinder|maternal|jardin)/.test(n)) return 'preescolar'
  if (n.includes('prim')) return 'primaria'
  if (n.includes('sec')) return 'secundaria'
  return null
}

/** Hora ("HH:MM") en que empieza a contar la estancia para un nivel. */
export function horaInicioPorNivel(nivel, config = CONFIG_ESTANCIA_DEFAULT, plantel = '') {
  const clave = claveNivelEstancia(nivel)
  const plantelClave = normalizar(plantel)
  const horariosPlantel = config.horariosPorPlantel || {}
  const configuracionPlantel = Object.entries(horariosPlantel).find(([nombre]) => normalizar(nombre) === plantelClave)?.[1]
  const porNivelPlantel = configuracionPlantel?.[clave]
  if (porNivelPlantel) return porNivelPlantel
  const porNivel = {
    preescolar: config.horaInicioPreescolar,
    primaria: config.horaInicioPrimaria,
    secundaria: config.horaInicioSecundaria,
  }[clave]
  return porNivel || config.horaInicio || '00:00'
}

/**
 * Config lista para calcular una estancia concreta. Si el registro ya guardó
 * la hora de inicio con la que se abrió (horaInicioConteo), esa manda; si no,
 * se deduce del nivel del alumno (alumnoNivel).
 */
export function configParaEstancia(estancia, config = CONFIG_ESTANCIA_DEFAULT) {
  const hora = estancia?.horaInicioConteo || horaInicioPorNivel(estancia?.alumnoNivel, config, estancia?.alumnoPlantel)
  return { ...config, horaInicio: hora }
}

/**
 * Momento a partir del cual empieza a correr la estancia: la hora de inicio
 * configurada (ya resuelta por nivel en config.horaInicio) del día indicado.
 */
export function inicioEfectivoEstancia(horaEntrada, fecha, config = CONFIG_ESTANCIA_DEFAULT) {
  const entrada = new Date(horaEntrada)
  const inicio = new Date(fecha || entrada)
  const [horas, minutos] = String(config.horaInicio || '00:00').split(':').map(Number)
  inicio.setHours(Number.isFinite(horas) ? horas : 0, Number.isFinite(minutos) ? minutos : 0, 0, 0)
  return inicio
}

/** `config` debe venir de configParaEstancia() para respetar el horario del nivel. */
export function calcularMinutosEstancia(horaEntrada, ahora, config = CONFIG_ESTANCIA_DEFAULT) {
  const fin = new Date(ahora)
  const inicio = inicioEfectivoEstancia(horaEntrada, fin, config)
  return Math.max(0, minutosEntre(inicio, fin))
}
