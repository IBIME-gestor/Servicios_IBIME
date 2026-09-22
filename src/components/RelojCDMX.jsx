import { useEffect, useState } from 'react'

const formateador = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

const formateadorFecha = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export default function RelojCDMX() {
  const [ahora, setAhora] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.95rem' }}>
        {formateador.format(ahora)}
      </span>
      <span style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'capitalize' }}>
        {formateadorFecha.format(ahora)} · CDMX
      </span>
    </div>
  )
}
