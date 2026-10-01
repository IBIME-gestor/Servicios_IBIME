import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export const CONFIG_ESTANCIA_DEFAULT = {
  horaInicio: '14:00',
  minutosGracia: 0,
  costo30Min: 0,
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
    minutosGracia: Number(config.minutosGracia || 0),
    costo30Min: Number(config.costo30Min || 0),
    costo1Hora: Number(config.costo1Hora || 0),
    mensual1Hora: Number(config.mensual1Hora || 0),
    mensual2Horas: Number(config.mensual2Horas || 0),
    mensual3Horas: Number(config.mensual3Horas || 0),
  }, { merge: true })
}

/**
 * Tarifa escalonada:
 * 1-30 min = tarifa de 30 min.
 * 31-60 min = 1 hora.
 * Cada hora adicional suma la tarifa de 1 hora.
 * El bloque sobrante de 1-30 min suma una tarifa de 30 min.
 * Ej.: 1h25 = 1h + 30 min; 2h25 = 2h + 30 min.
 */
export function calcularCostoEstancia(minutosTotales, config = CONFIG_ESTANCIA_DEFAULT) {
  const minutosCobrables = Math.max(0, Number(minutosTotales || 0) - Number(config.minutosGracia || 0))
  if (minutosCobrables === 0) {
    return { minutosCobrables: 0, costo: 0, desglose: 'Dentro del tiempo de gracia, sin costo.' }
  }

  const tarifa30 = Number(config.costo30Min || 0)
  const tarifaHora = Number(config.costo1Hora || 0)
  const horas = Math.floor(minutosCobrables / 60)
  const resto = minutosCobrables % 60
  const bloques30 = resto === 0 ? 0 : 1
  const costo = (horas * tarifaHora) + (bloques30 * tarifa30)

  const partes = []
  if (horas) partes.push(`${horas} h × $${tarifaHora.toFixed(2)}`)
  if (bloques30) partes.push(`30 min × $${tarifa30.toFixed(2)}`)
  const desglose = `${minutosCobrables} min cobrables: ${partes.join(' + ')} = $${costo.toFixed(2)} MXN`

  return { minutosCobrables, horas, bloques30, costo, desglose }
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
