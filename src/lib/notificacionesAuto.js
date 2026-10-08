import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { estanciasPendientesAlumno, describirPago, TIPOS_TARJETA } from './estancia'
import { registrarLog } from './log'

/**
 * Correos automáticos de Estancia (se envían con Google Apps Script):
 *  - "ticket": al confirmar un pago, resumen de pago + tiempo + importe.
 *  - "saldo":  al acumular N estancias pendientes (por defecto 3), aviso de saldo.
 *
 * El admin sube el HTML en Admin → Notificaciones. Cada plantilla tiene un
 * BORRADOR (lo que se edita) y una versión PUBLICADA (la que se confirmó).
 * La automatización solo usa la publicada y solo si está activa.
 */

const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL
const ZONA = 'America/Mexico_City'
export const UMBRAL_SALDO_DEFAULT = 3

/* ------------------------------------------------------------------ */
/* Catálogo de campos que se pueden usar en las plantillas             */
/* ------------------------------------------------------------------ */

const CAMPOS_ALUMNO = [
  { clave: 'NOMBRE_ALUMNO', descripcion: 'Nombre del alumno', ejemplo: 'Ana Pérez López' },
  { clave: 'MATRICULA', descripcion: 'Matrícula', ejemplo: '2024-0123' },
  { clave: 'PLANTEL', descripcion: 'Plantel', ejemplo: 'Plantel Norte' },
  { clave: 'NIVEL', descripcion: 'Nivel', ejemplo: 'Primaria' },
  { clave: 'GRADO', descripcion: 'Grado', ejemplo: '3°' },
  { clave: 'GRUPO', descripcion: 'Grupo', ejemplo: 'A' },
  { clave: 'TUTOR', descripcion: 'Nombre del tutor', ejemplo: 'María López' },
]

export const CATALOGO_CAMPOS = {
  ticket: [
    ...CAMPOS_ALUMNO,
    { clave: 'FOLIO', descripcion: 'Folio del pago (agrupa todos los conceptos pagados juntos)', ejemplo: 'LX9A2K-4F7Q1Z' },
    { clave: 'FECHA_PAGO', descripcion: 'Fecha del pago', ejemplo: '08/10/2026' },
    { clave: 'HORA_PAGO', descripcion: 'Hora del pago', ejemplo: '15:42' },
    { clave: 'METODO_PAGO', descripcion: 'Método de pago (Efectivo / Tarjeta débito / Tarjeta crédito)', ejemplo: 'Tarjeta débito' },
    { clave: 'DATOS_TARJETA', descripcion: 'Banco y últimos 4 dígitos (vacío si fue efectivo)', ejemplo: 'BBVA ···· 1234' },
    { clave: 'TITULAR_TARJETA', descripcion: 'Titular de la tarjeta (vacío si fue efectivo)', ejemplo: 'María López' },
    { clave: 'QUIEN_RECOGE', descripcion: 'Quién recogió al alumno', ejemplo: 'María López' },
    { clave: 'NUM_CONCEPTOS', descripcion: 'Cuántas estancias cubre este pago', ejemplo: '2' },
    { clave: 'FILAS_ESTANCIA', descripcion: 'Filas <tr> del desglose (fecha, entrada, salida, tiempo, importe) para tu propia tabla', ejemplo: '<tr>…</tr>', html: true },
    { clave: 'TABLA_ESTANCIA', descripcion: 'Tabla completa del desglose, ya con estilo básico', ejemplo: '<table>…</table>', html: true },
    { clave: 'TIEMPO_TOTAL', descripcion: 'Suma del tiempo de estancia pagado', ejemplo: '2 h 10 min' },
    { clave: 'TOTAL_MINUTOS', descripcion: 'Suma de minutos', ejemplo: '130' },
    { clave: 'TOTAL_PAGADO', descripcion: 'Total pagado en este ticket', ejemplo: '$180.00' },
    { clave: 'SALDO_PENDIENTE', descripcion: 'Lo que el alumno aún debe después de este pago', ejemplo: '$0.00' },
  ],
  saldo: [
    ...CAMPOS_ALUMNO,
    { clave: 'FECHA_HOY', descripcion: 'Fecha en que se envía el aviso', ejemplo: '08/10/2026' },
    { clave: 'NUM_PENDIENTES', descripcion: 'Cuántas estancias están pendientes', ejemplo: '3' },
    { clave: 'FILAS_PENDIENTES', descripcion: 'Filas <tr> del desglose (fecha, entrada, salida, tiempo, importe) para tu propia tabla', ejemplo: '<tr>…</tr>', html: true },
    { clave: 'TABLA_PENDIENTES', descripcion: 'Tabla completa del desglose, ya con estilo básico', ejemplo: '<table>…</table>', html: true },
    { clave: 'TIEMPO_TOTAL', descripcion: 'Suma del tiempo de las estancias pendientes', ejemplo: '3 h 40 min' },
    { clave: 'TOTAL_ADEUDO', descripcion: 'Total adeudado', ejemplo: '$270.00' },
    { clave: 'FECHA_MAS_ANTIGUA', descripcion: 'Fecha de la estancia pendiente más antigua', ejemplo: '02/10/2026' },
    { clave: 'MEDIOS_DE_PAGO', descripcion: 'Medios de pago aceptados', ejemplo: 'efectivo o tarjeta de débito/crédito' },
  ],
}

export const TIPOS_NOTIFICACION = {
  ticket: {
    clave: 'ticket',
    titulo: 'Ticket de pago',
    icono: '🧾',
    descripcion: 'Se envía automáticamente cuando se confirma un pago de estancia (efectivo o tarjeta).',
    asuntoDefault: 'Ticket de pago de estancia IBIME · {{NOMBRE_ALUMNO}}',
  },
  saldo: {
    clave: 'saldo',
    titulo: 'Saldo pendiente',
    icono: '⏳',
    descripcion: 'Se envía automáticamente cuando el alumno acumula el número de estancias pendientes que configures.',
    asuntoDefault: 'Saldo pendiente de estancia IBIME · {{NOMBRE_ALUMNO}}',
  },
}

const CAMPOS_HTML = new Set(['FILAS_ESTANCIA', 'TABLA_ESTANCIA', 'FILAS_PENDIENTES', 'TABLA_PENDIENTES'])

/* ------------------------------------------------------------------ */
/* Configuración guardada (config/notificaciones_auto)                  */
/* ------------------------------------------------------------------ */

const vacio = (tipo) => ({
  borrador: { asunto: TIPOS_NOTIFICACION[tipo].asuntoDefault, html: '', campos: [] },
  publicada: null,
  activa: false,
  ...(tipo === 'saldo' ? { umbral: UMBRAL_SALDO_DEFAULT } : {}),
})

export async function obtenerConfigAuto() {
  const snap = await getDoc(doc(db, 'config', 'notificaciones_auto'))
  const d = snap.exists() ? snap.data() : {}
  return {
    ticket: { ...vacio('ticket'), ...(d.ticket || {}) },
    saldo: { ...vacio('saldo'), ...(d.saldo || {}) },
  }
}

export async function guardarBorradorAuto({ tipo, asunto, html, campos, umbral, usuario }) {
  await setDoc(doc(db, 'config', 'notificaciones_auto'), {
    [tipo]: {
      borrador: { asunto, html, campos, actualizadoPor: usuario, actualizadoEn: serverTimestamp() },
      ...(tipo === 'saldo' ? { umbral: Math.max(1, Number(umbral) || UMBRAL_SALDO_DEFAULT) } : {}),
    },
  }, { merge: true })
}

/** Confirma la plantilla: copia el borrador a "publicada" y activa la automatización. */
export async function confirmarPlantillaAuto({ tipo, asunto, html, campos, umbral, usuario }) {
  if (!String(html || '').trim()) throw new Error('Primero sube o pega el HTML de la plantilla.')
  if (!String(asunto || '').trim()) throw new Error('Escribe el asunto del correo.')
  const base = { asunto, html, campos }
  await setDoc(doc(db, 'config', 'notificaciones_auto'), {
    [tipo]: {
      borrador: { ...base, actualizadoPor: usuario, actualizadoEn: serverTimestamp() },
      publicada: { ...base, confirmadoPor: usuario, confirmadoEn: serverTimestamp() },
      activa: true,
      ...(tipo === 'saldo' ? { umbral: Math.max(1, Number(umbral) || UMBRAL_SALDO_DEFAULT) } : {}),
    },
  }, { merge: true })
}

export async function cambiarActivaAuto({ tipo, activa }) {
  await setDoc(doc(db, 'config', 'notificaciones_auto'), { [tipo]: { activa: Boolean(activa) } }, { merge: true })
}

/** Variables {{ASÍ}} que aparecen en un HTML. */
export function extraerVariables(texto) {
  const set = new Set()
  String(texto || '').replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, k) => { set.add(k); return '' })
  return Array.from(set)
}

/* ------------------------------------------------------------------ */
/* Armado del correo                                                    */
/* ------------------------------------------------------------------ */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const dinero = (n) => `$${Number(n || 0).toFixed(2)}`
const fmtFecha = (d) => (d ? new Date(d).toLocaleDateString('es-MX', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
const fmtHora = (d) => (d ? new Date(d).toLocaleTimeString('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }) : '')
const tiempoTexto = (min) => {
  const t = Number(min || 0)
  const h = Math.floor(t / 60)
  const m = t % 60
  return h === 0 ? `${m} min` : `${h} h ${m} min`
}
const aFecha = (v) => (v?.toDate ? v.toDate() : v || null)

const TD = 'padding:7px 9px;border-bottom:1px solid #e5e7eb;'
function filasHtml(estancias) {
  return estancias.map((e) => (
    `<tr><td style="${TD}">${esc(fmtFecha(e.horaEntrada))}</td><td style="${TD}">${esc(fmtHora(e.horaEntrada))}</td>` +
    `<td style="${TD}">${esc(fmtHora(e.horaSalida))}</td><td style="${TD}">${esc(tiempoTexto(e.minutos))}</td>` +
    `<td style="${TD}text-align:right;">${esc(dinero(e.costo))}</td></tr>`
  )).join('')
}
function tablaHtml(estancias, total) {
  const TH = 'padding:8px 9px;text-align:left;background:#f3f4f6;font-size:12px;'
  return (
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
    `<thead><tr><th style="${TH}">Fecha</th><th style="${TH}">Entrada</th><th style="${TH}">Salida</th><th style="${TH}">Tiempo</th><th style="${TH}text-align:right;">Importe</th></tr></thead>` +
    `<tbody>${filasHtml(estancias)}</tbody>` +
    `<tfoot><tr><td colspan="4" style="padding:9px;font-weight:bold;">Total</td><td style="padding:9px;font-weight:bold;text-align:right;">${esc(dinero(total))}</td></tr></tfoot></table>`
  )
}

function camposAlumno(alumno) {
  return {
    NOMBRE_ALUMNO: alumno?.nombre || '',
    MATRICULA: alumno?.matricula || '',
    PLANTEL: alumno?.plantel || '',
    NIVEL: alumno?.nivel || '',
    GRADO: alumno?.grado || '',
    GRUPO: alumno?.grupo || '',
    TUTOR: alumno?.tutor || '',
  }
}

export function valoresTicket({ alumno, estancias, saldoPendiente = 0 }) {
  const primera = estancias[0] || {}
  const total = estancias.reduce((t, e) => t + (Number(e.costo) || 0), 0)
  const minutos = estancias.reduce((t, e) => t + (Number(e.minutos) || 0), 0)
  const pagadoEn = aFecha(primera.fechaPagado) || new Date()
  const t = primera.tarjeta || {}
  const tipoTarjeta = TIPOS_TARJETA[t.tipo || primera.tarjetaTipo]?.etiqueta
  return {
    ...camposAlumno(alumno),
    FOLIO: String(primera.pagoGrupoId || primera.id || '').toUpperCase(),
    FECHA_PAGO: fmtFecha(pagadoEn),
    HORA_PAGO: fmtHora(pagadoEn),
    METODO_PAGO: primera.metodoPago === 'efectivo' ? 'Efectivo' : primera.metodoPago === 'tarjeta' ? `Tarjeta${tipoTarjeta ? ` ${tipoTarjeta.toLowerCase()}` : ''}` : describirPago(primera),
    DATOS_TARJETA: [t.banco, t.ultimos4 ? `···· ${t.ultimos4}` : ''].filter(Boolean).join(' '),
    TITULAR_TARJETA: t.titular || '',
    QUIEN_RECOGE: primera.retiradoPor || '',
    NUM_CONCEPTOS: String(estancias.length),
    FILAS_ESTANCIA: filasHtml(estancias),
    TABLA_ESTANCIA: tablaHtml(estancias, total),
    TIEMPO_TOTAL: tiempoTexto(minutos),
    TOTAL_MINUTOS: String(minutos),
    TOTAL_PAGADO: dinero(total),
    SALDO_PENDIENTE: dinero(saldoPendiente),
  }
}

export function valoresSaldo({ alumno, pendientes }) {
  const total = pendientes.reduce((t, e) => t + (Number(e.costo) || 0), 0)
  const minutos = pendientes.reduce((t, e) => t + (Number(e.minutos) || 0), 0)
  return {
    ...camposAlumno(alumno),
    FECHA_HOY: fmtFecha(new Date()),
    NUM_PENDIENTES: String(pendientes.length),
    FILAS_PENDIENTES: filasHtml(pendientes),
    TABLA_PENDIENTES: tablaHtml(pendientes, total),
    TIEMPO_TOTAL: tiempoTexto(minutos),
    TOTAL_ADEUDO: dinero(total),
    FECHA_MAS_ANTIGUA: fmtFecha(pendientes[0]?.horaEntrada),
    MEDIOS_DE_PAGO: 'efectivo o tarjeta de débito/crédito',
  }
}

/**
 * Llena la plantilla SOLO con los campos habilitados por el admin.
 * Los valores de texto se escapan; las tablas ya vienen armadas y escapadas.
 * Una variable no habilitada o desconocida queda vacía.
 */
export function renderPlantilla(texto, valores, camposPermitidos, { comoHtml = true } = {}) {
  const permitidos = new Set(camposPermitidos || [])
  return String(texto || '').replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, k) => {
    if (!permitidos.has(k) || !(k in valores)) return ''
    const v = valores[k]
    if (!comoHtml) return CAMPOS_HTML.has(k) ? '' : String(v ?? '')
    return CAMPOS_HTML.has(k) ? String(v ?? '') : esc(v)
  })
}

/** Datos de ejemplo para la vista previa y el correo de prueba. */
export function datosEjemplo(tipo) {
  const alumno = { nombre: 'Ana Pérez López', matricula: '2024-0123', plantel: 'Plantel Norte', nivel: 'Primaria', grado: '3°', grupo: 'A', tutor: 'María López' }
  const base = (n, costo, minutos) => {
    const e = new Date(); e.setDate(e.getDate() - n); e.setHours(14, 0, 0, 0)
    const s = new Date(e); s.setMinutes(minutos)
    return { id: `x${n}`, horaEntrada: e, horaSalida: s, minutos, costo }
  }
  if (tipo === 'ticket') {
    const estancias = [
      { ...base(0, 90, 70), metodoPago: 'tarjeta', tarjeta: { tipo: 'debito', banco: 'BBVA', ultimos4: '1234', titular: 'María López' }, retiradoPor: 'María López', pagoGrupoId: 'ejemplo-123', fechaPagado: new Date() },
      { ...base(3, 60, 45), metodoPago: 'tarjeta', tarjeta: { tipo: 'debito', banco: 'BBVA', ultimos4: '1234', titular: 'María López' }, retiradoPor: 'María López', pagoGrupoId: 'ejemplo-123', fechaPagado: new Date() },
    ]
    return valoresTicket({ alumno, estancias, saldoPendiente: 0 })
  }
  return valoresSaldo({ alumno, pendientes: [base(6, 90, 70), base(4, 60, 45), base(2, 120, 100)] })
}

/* ------------------------------------------------------------------ */
/* Envío por Apps Script                                                */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const destinatariosAlumno = (a) =>
  Array.from(new Set([a?.correoTutor, a?.correoAlumno].map((x) => String(x || '').trim().toLowerCase()).filter((x) => EMAIL_RE.test(x))))

/** Envía un correo con la acción `enviarCorreo` del Apps Script. Lanza error si falla. */
export async function enviarCorreoAppsScript({ to, subject, htmlBody, tipo }) {
  if (!APPSCRIPT_URL) throw new Error('Falta configurar VITE_APPSCRIPT_URL.')
  const res = await fetch(APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'enviarCorreo', to, subject, htmlBody, tipo }),
  })
  if (!res.ok) throw new Error(`Apps Script respondió ${res.status}.`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'El Apps Script no pudo enviar el correo.')
  return data
}

async function plantillaActiva(tipo) {
  const cfg = await obtenerConfigAuto()
  const t = cfg[tipo]
  if (!t.activa || !t.publicada?.html) return null
  return { ...t.publicada, umbral: t.umbral }
}

/** Un solo punto de salida: arma, envía, y deja rastro en la bitácora. */
async function enviarAutomatico({ tipo, plantilla, valores, alumno, user, entidadId, accion }) {
  const to = destinatariosAlumno(alumno)
  if (to.length === 0) return { estado: 'omitido', motivo: 'sin_correo', mensaje: `${alumno?.nombre || 'El alumno'} no tiene correo capturado; no se envió el correo.` }
  const campos = plantilla.campos || []
  const subject = renderPlantilla(plantilla.asunto, valores, campos, { comoHtml: false })
  const htmlBody = renderPlantilla(plantilla.html, valores, campos)
  try {
    await enviarCorreoAppsScript({ to: to.join(','), subject, htmlBody, tipo })
    registrarLog({ user, accion, modulo: 'estancia', entidad: 'estancias', entidadId, alumno, detalle: { tipo, to: to.join(','), enviado: true } })
    return { estado: 'enviado', to, mensaje: `Correo enviado a ${to.join(', ')}.` }
  } catch (err) {
    console.error(err)
    registrarLog({ user, accion: `${accion}_error`, modulo: 'estancia', entidad: 'estancias', entidadId, alumno, detalle: { tipo, to: to.join(','), enviado: false, error: String(err?.message || err) } })
    return { estado: 'error', mensaje: `No se pudo enviar el correo a ${to.join(', ')}: ${err?.message || err}` }
  }
}

async function pendientesRestantes(alumnoId) {
  try {
    return await estanciasPendientesAlumno(alumnoId)
  } catch {
    return []
  }
}

/**
 * Ticket de pago. Vuelve a leer las estancias ya guardadas para que el
 * resumen (tiempo, importe, método) coincida exactamente con lo registrado.
 */
export async function notificarTicketPago({ estanciaIds, alumno, user }) {
  const plantilla = await plantillaActiva('ticket')
  if (!plantilla) return { estado: 'omitido', motivo: 'sin_plantilla' }

  const snaps = await Promise.all(estanciaIds.map((id) => getDoc(doc(db, 'estancias', id))))
  const estancias = snaps
    .filter((s) => s.exists())
    .map((s) => ({ id: s.id, ...s.data(), horaEntrada: aFecha(s.data().horaEntrada), horaSalida: aFecha(s.data().horaSalida), fechaPagado: aFecha(s.data().fechaPagado) }))
    .filter((e) => e.pagado && !e.ajusteAcuerdo)
    .sort((a, b) => (a.horaEntrada?.getTime() || 0) - (b.horaEntrada?.getTime() || 0))
  if (estancias.length === 0) return { estado: 'omitido', motivo: 'sin_importe' }

  const restantes = await pendientesRestantes(alumno.id)
  const saldo = restantes.reduce((t, e) => t + (Number(e.costo) || 0), 0)
  const res = await enviarAutomatico({
    tipo: 'ticket', plantilla, alumno, user, entidadId: estancias[0].id, accion: 'notificacion.ticket_pago',
    valores: valoresTicket({ alumno, estancias, saldoPendiente: saldo }),
  })
  if (res.estado === 'enviado') await marcarEnviado(estancias.map((e) => e.id), 'ticketEnviadoEn')
  return res
}

/**
 * Aviso de saldo pendiente: se envía cuando el alumno junta `umbral` estancias
 * pendientes (3 por defecto). Si luego se suma otra pendiente, se manda un aviso
 * actualizado; si no hay nada nuevo desde el último aviso, no se repite.
 */
export async function notificarSaldoPendiente({ alumno, user }) {
  const plantilla = await plantillaActiva('saldo')
  if (!plantilla) return { estado: 'omitido', motivo: 'sin_plantilla' }
  const umbral = Math.max(1, Number(plantilla.umbral) || UMBRAL_SALDO_DEFAULT)

  const pendientes = await estanciasPendientesAlumno(alumno.id)
  if (pendientes.length < umbral) return { estado: 'omitido', motivo: 'bajo_umbral' }
  if (!pendientes.some((p) => !p.saldoNotificadoEn)) return { estado: 'omitido', motivo: 'ya_notificado' }

  const res = await enviarAutomatico({
    tipo: 'saldo', plantilla, alumno, user, entidadId: pendientes[pendientes.length - 1].id, accion: 'notificacion.saldo_pendiente',
    valores: valoresSaldo({ alumno, pendientes }),
  })
  if (res.estado === 'enviado') await marcarEnviado(pendientes.map((e) => e.id), 'saldoNotificadoEn')
  return res
}

async function marcarEnviado(ids, campo) {
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const lote = writeBatch(db)
      ids.slice(i, i + 400).forEach((id) => lote.update(doc(db, 'estancias', id), { [campo]: serverTimestamp() }))
      await lote.commit()
    }
  } catch (err) {
    console.warn('No se pudo marcar el correo como enviado:', err)
  }
}
