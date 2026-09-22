/** Regresa {inicio, fin} de la semana actual (lunes 00:00 a domingo 23:59). */
export function rangoSemanaActual(ref = new Date()) {
  const dia = ref.getDay() // 0=domingo … 6=sábado
  const diffLunes = dia === 0 ? -6 : 1 - dia
  const inicio = new Date(ref)
  inicio.setDate(ref.getDate() + diffLunes)
  inicio.setHours(0, 0, 0, 0)

  const fin = new Date(inicio)
  fin.setDate(inicio.getDate() + 6)
  fin.setHours(23, 59, 59, 999)

  return { inicio, fin }
}

export function formatoFecha(date) {
  return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatoHora(date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
