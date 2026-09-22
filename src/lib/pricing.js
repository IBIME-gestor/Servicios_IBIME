import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Configuración por defecto de estancia. El administrador la edita desde
// el módulo de Estancia > Configuración, y se guarda en
// Firestore: config/estancia
export const CONFIG_ESTANCIA_DEFAULT = {
  horaInicio: '14:00', // a partir de esta hora empieza a contar la estancia
  minutosGracia: 15, // minutos gratis antes de empezar a cobrar
  modoCobro: 'fraccion', // "fraccion" (cada X minutos) | "minuto" (por minuto exacto)
  minutosPorFraccion: 15, // si modoCobro = "fraccion"
  costoPorFraccion: 15, // $ por cada fracción de minutosPorFraccion
  costoPorMinuto: 1, // $ por minuto, si modoCobro = "minuto"
}

export async function obtenerConfigEstancia() {
  const ref = doc(db, 'config', 'estancia')
  const snap = await getDoc(ref)
  return snap.exists() ? { ...CONFIG_ESTANCIA_DEFAULT, ...snap.data() } : CONFIG_ESTANCIA_DEFAULT
}

export async function guardarConfigEstancia(config) {
  const ref = doc(db, 'config', 'estancia')
  await setDoc(ref, config, { merge: true })
}

/**
 * Calcula el costo de una estancia.
 * @param {number} minutosTotales - minutos entre horaInicio (o llegada) y la hora de retiro
 * @param {object} config - CONFIG_ESTANCIA_DEFAULT o la cargada de Firestore
 * @returns {{minutosCobrables: number, costo: number, desglose: string}}
 */
export function calcularCostoEstancia(minutosTotales, config = CONFIG_ESTANCIA_DEFAULT) {
  const minutosCobrables = Math.max(0, minutosTotales - config.minutosGracia)

  if (minutosCobrables === 0) {
    return { minutosCobrables: 0, costo: 0, desglose: 'Dentro del tiempo de gracia, sin costo.' }
  }

  if (config.modoCobro === 'minuto') {
    const costo = minutosCobrables * config.costoPorMinuto
    return {
      minutosCobrables,
      costo,
      desglose: `${minutosCobrables} min × $${config.costoPorMinuto} MXN/min = $${costo} MXN`,
    }
  }

  // modo "fraccion": redondea hacia arriba a la siguiente fracción completa
  const fracciones = Math.ceil(minutosCobrables / config.minutosPorFraccion)
  const costo = fracciones * config.costoPorFraccion
  return {
    minutosCobrables,
    costo,
    desglose: `${fracciones} fracción(es) de ${config.minutosPorFraccion} min × $${config.costoPorFraccion} MXN = $${costo} MXN`,
  }
}

/** Minutos transcurridos entre dos objetos Date (o timestamps de Firestore ya convertidos a Date). */
export function minutosEntre(inicio, fin) {
  return Math.round((fin.getTime() - inicio.getTime()) / 60000)
}
