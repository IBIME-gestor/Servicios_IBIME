import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export const CONFIG_COMEDOR_DEFAULT = {
  precioDesayuno: 25,
  precioComida: 45,
}

export async function obtenerConfigComedor() {
  const ref = doc(db, 'config', 'comedor')
  const snap = await getDoc(ref)
  return snap.exists() ? { ...CONFIG_COMEDOR_DEFAULT, ...snap.data() } : CONFIG_COMEDOR_DEFAULT
}

export async function guardarConfigComedor(config) {
  const ref = doc(db, 'config', 'comedor')
  await setDoc(ref, config, { merge: true })
}

/** Calcula el total de cafetería de una lista de consumos (de lib/consumos.js), en MXN. */
export function calcularTotalComedor(consumos, config = CONFIG_COMEDOR_DEFAULT) {
  const desayunos = consumos.filter((c) => c.tipo === 'desayuno').length
  const comidas = consumos.filter((c) => c.tipo === 'comida').length
  return {
    desayunos,
    comidas,
    total: desayunos * config.precioDesayuno + comidas * config.precioComida,
  }
}
