import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { consumosSemanaTodos, costoConsumo } from './consumos'
import { estanciasSemanaTodas } from './estancia'
import { obtenerConfigComedor } from './pricingComedor'
import { listarAlumnosActivos } from './alumnos'

const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL

export async function obtenerPlantillaNotificacion() {
  const snap = await getDoc(doc(db, 'config', 'notificaciones'))
  return snap.exists() ? snap.data() : { htmlTemplate: '', asunto: 'Resumen semanal de servicios IBIME' }
}

export async function guardarPlantillaNotificacion({ htmlTemplate, asunto, usuario }) {
  await setDoc(doc(db, 'config', 'notificaciones'), {
    htmlTemplate,
    asunto,
    actualizadoPor: usuario,
    actualizadoEn: serverTimestamp(),
  }, { merge: true })
}

function semanaActual() {
  const now = new Date()
  const day = now.getDay() || 7
  const lunes = new Date(now)
  lunes.setDate(now.getDate() - day + 1)
  lunes.setHours(0,0,0,0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate()+6)
  domingo.setHours(23,59,59,999)
  return { lunes, domingo, clave: lunes.toISOString().slice(0,10) }
}

function reemplazarPlantilla(template, alumno, detalles, totals) {
  const consumosHtml = detalles.consumos.map(c => `<tr><td>${c.fecha}</td><td>${c.tipo}</td><td>$${c.costo.toFixed(2)}</td></tr>`).join('')
  const estanciasHtml = detalles.estancias.map(e => `<tr><td>${e.fecha}</td><td>${e.entrada} - ${e.salida}</td><td>${e.minutos} min</td><td>$${e.costo.toFixed(2)}</td></tr>`).join('')
  const valores = {
    NOMBRE_ALUMNO: alumno.nombre || '', MATRICULA: alumno.matricula || '', GRADO: alumno.grado || '', GRUPO: alumno.grupo || '',
    CORREO_ALUMNO: alumno.correoAlumno || '', CONSUMOS_CAFETERIA: consumosHtml, ESTANCIAS: estanciasHtml,
    TOTAL_COMEDOR: totals.comedor.toFixed(2), TOTAL_ESTANCIA: totals.estancia.toFixed(2), TOTAL_ESTIMADO: totals.total.toFixed(2),
    MENSAJE_COMETA: 'Verifique en Cometa que el saldo ya esté disponible para realizar el pago.',
    SEMANA: `${detalles.semanaInicio} al ${detalles.semanaFin}`,
  }
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => valores[key] ?? '')
}

export async function prepararNotificacionesSemana({ asunto, htmlTemplate, usuario, enviarDespues }) {
  if (!APPSCRIPT_URL) throw new Error('Falta configurar VITE_APPSCRIPT_URL.')
  if (!htmlTemplate?.trim()) throw new Error('Primero carga una plantilla HTML.')
  const [alumnos, consumos, estancias, config] = await Promise.all([listarAlumnosActivos(), consumosSemanaTodos(), estanciasSemanaTodas(), obtenerConfigComedor()])
  const { lunes, domingo, clave } = semanaActual()
  const payload = alumnos.filter(a => a.contacto).map(alumno => {
    const cs = consumos.filter(c => c.alumnoId === alumno.id)
    const es = estancias.filter(e => e.alumnoId === alumno.id && e.horaSalida)
    const consumosDet = cs.map(c => ({ fecha: c.fecha?.toLocaleDateString('es-MX') || '', tipo: c.tipo === 'desayuno' ? 'Desayuno' : 'Comida', costo: costoConsumo(c, config) }))
    const estanciasDet = es.map(e => ({ fecha: e.horaEntrada?.toLocaleDateString('es-MX') || '', entrada: e.horaEntrada?.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) || '', salida: e.horaSalida?.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) || '', minutos: e.minutos || 0, costo: Number(e.costo)||0 }))
    const comedor = consumosDet.reduce((s,c)=>s+c.costo,0)
    const estancia = estanciasDet.reduce((s,e)=>s+e.costo,0)
    return {
      to: alumno.contacto,
      subject: asunto || 'Resumen semanal de servicios IBIME',
      htmlBody: reemplazarPlantilla(htmlTemplate, alumno, { consumos: consumosDet, estancias: estanciasDet, semanaInicio: lunes.toLocaleDateString('es-MX'), semanaFin: domingo.toLocaleDateString('es-MX') }, { comedor, estancia, total: comedor+estancia }),
      alumnoId: alumno.id,
      semana: clave,
    }
  })
  const res = await fetch(APPSCRIPT_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({ action:'programarNotificaciones', enviarDespues, usuario, notificaciones:payload }) })
  if (!res.ok) throw new Error(`Apps Script respondió ${res.status}.`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'No se pudieron programar las notificaciones.')
  return data
}
