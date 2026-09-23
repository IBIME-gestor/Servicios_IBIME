import {
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { registrarConsumo } from './consumos'
import { iniciarEstancia, finalizarEstancia } from './estancia'

function limitesDelDia(fecha) {
  const inicio = new Date(fecha)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(fecha)
  fin.setHours(23, 59, 59, 999)
  return { inicio, fin }
}

/**
 * Devuelve los IDs de alumnos que ya tienen ese servicio registrado en la fecha.
 * Se consulta por día y se filtra en cliente para no depender de índices compuestos.
 */
export async function consumosDelDia(fecha) {
  const { inicio, fin } = limitesDelDia(fecha)
  const q = query(
    collection(db, 'consumos'),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), fecha: d.data().fecha?.toDate() }))
}

export async function estanciasDelDia(fecha) {
  const { inicio, fin } = limitesDelDia(fecha)
  const q = query(
    collection(db, 'estancias'),
    where('horaEntrada', '>=', Timestamp.fromDate(inicio)),
    where('horaEntrada', '<=', Timestamp.fromDate(fin)),
    orderBy('horaEntrada', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    horaEntrada: d.data().horaEntrada?.toDate(),
    horaSalida: d.data().horaSalida?.toDate() || null,
  }))
}

export async function registrarConsumosRetroactivos({ alumnos, tipo, fecha, hora, registradoPor }) {
  const existentes = await consumosDelDia(fecha)
  const existentesIds = new Set(
    existentes
      .filter((x) => x.tipo === tipo)
      .map((x) => x.alumnoId)
  )
  const fechaHora = new Date(fecha)
  fechaHora.setHours(hora.horas, hora.minutos, 0, 0)

  const pendientes = alumnos.filter((a) => !existentesIds.has(a.id))
  for (const alumno of pendientes) {
    await registrarConsumo({
      alumno,
      tipo,
      registradoPor,
      fechaServicio: fechaHora,
      retroactivo: true,
    })
  }

  return {
    creados: pendientes.length,
    omitidos: alumnos.length - pendientes.length,
  }
}

export async function registrarEstanciaRetroactiva({
  alumno,
  fecha,
  horaEntrada,
  horaSalida,
  retiradoPor,
  registradoPor,
}) {
  const existentes = await estanciasDelDia(fecha)
  if (existentes.some((x) => x.alumnoId === alumno.id)) {
    return { creado: false, motivo: 'ya-existe' }
  }

  const entrada = new Date(fecha)
  entrada.setHours(horaEntrada.horas, horaEntrada.minutos, 0, 0)
  const salida = new Date(fecha)
  salida.setHours(horaSalida.horas, horaSalida.minutos, 0, 0)

  if (salida <= entrada) throw new Error('La hora de retiro debe ser posterior a la entrada.')

  const estanciaId = await iniciarEstancia({
    alumno,
    registradoPor,
    horaEntrada: entrada,
    retroactivo: true,
  })

  await finalizarEstancia({
    estanciaId,
    retiradoPor: retiradoPor || 'Captura administrativa retroactiva',
    horaSalida: salida,
    retroactivo: true,
  })

  return { creado: true }
}
