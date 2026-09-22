import { useEffect, useState } from 'react'
import { consumosSemanaTodos } from '../../lib/consumos'
import { estanciasSemanaTodas } from '../../lib/estancia'
import { listarCobrosSemana } from '../../lib/cobros'
import { obtenerConfigComedor, calcularTotalComedor } from '../../lib/pricingComedor'

export default function DashboardPagos() {
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    async function cargar() {
      const [consumos, estancias, cobros, configComedor] = await Promise.all([
        consumosSemanaTodos(),
        estanciasSemanaTodas(),
        listarCobrosSemana(),
        obtenerConfigComedor(),
      ])

      const estanciasCerradas = estancias.filter((e) => e.horaSalida)

      // Agrupa por alumno para saber cuántos alumnos distintos hay en cada módulo.
      const alumnosEstancia = new Set(estanciasCerradas.map((e) => e.alumnoId))
      const alumnosCafeteria = new Set(consumos.map((c) => c.alumnoId))

      const totalEsperadoEstancia = estanciasCerradas.reduce((s, e) => s + (e.costo || 0), 0)

      const consumosPorAlumno = {}
      consumos.forEach((c) => {
        consumosPorAlumno[c.alumnoId] = consumosPorAlumno[c.alumnoId] || []
        consumosPorAlumno[c.alumnoId].push(c)
      })
      const totalEsperadoCafeteria = Object.values(consumosPorAlumno).reduce(
        (s, lista) => s + calcularTotalComedor(lista, configComedor).total,
        0
      )

      const cobrosCapturados = cobros.filter((c) => c.capturado)
      const cobrosPagados = cobros.filter((c) => c.pagado)
      const totalRealEstancia = cobrosPagados.reduce((s, c) => s + (c.totalEstancia || 0), 0)
      const totalRealCafeteria = cobrosPagados.reduce((s, c) => s + (c.totalCafeteria || 0), 0)

      setDatos({
        estancia: {
          alumnos: alumnosEstancia.size,
          capturados: cobrosCapturados.filter((c) => c.totalEstancia > 0).length,
          pagados: cobrosPagados.filter((c) => c.totalEstancia > 0).length,
          totalEsperado: totalEsperadoEstancia,
          totalReal: totalRealEstancia,
        },
        cafeteria: {
          alumnos: alumnosCafeteria.size,
          capturados: cobrosCapturados.filter((c) => c.totalCafeteria > 0).length,
          pagados: cobrosPagados.filter((c) => c.totalCafeteria > 0).length,
          totalEsperado: totalEsperadoCafeteria,
          totalReal: totalRealCafeteria,
        },
      })
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <p style={{ color: 'var(--ink-muted)' }}>Cargando…</p>

  return (
    <div>
      <p style={{ color: 'var(--ink-muted)', marginTop: 0, marginBottom: '1.5rem' }}>
        Datos de la semana actual (lunes a domingo). "Real cobrado" solo cuenta lo que Caja ya marcó como pagado.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <BloqueModulo titulo="🏫 Estancia" color="var(--mod-estancia)" datos={datos.estancia} />
        <BloqueModulo titulo="🍽️ Cafetería" color="var(--mod-cafeteria)" datos={datos.cafeteria} />
      </div>
    </div>
  )
}

function BloqueModulo({ titulo, color, datos }) {
  const faltante = datos.totalEsperado - datos.totalReal
  return (
    <div className="card" style={{ padding: '1.25rem', borderTop: `3px solid ${color}` }}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem', marginBottom: '1.1rem' }}>
        <Estadistica etiqueta="Alumnos con actividad" valor={datos.alumnos} />
        <Estadistica etiqueta="Con concepto cargado" valor={datos.capturados} />
        <Estadistica etiqueta="Con pago verificado" valor={datos.pagados} />
        <Estadistica etiqueta="Sin verificar pago" valor={datos.capturados - datos.pagados} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
        <FilaMonto etiqueta="Total que se debió cobrar" valor={datos.totalEsperado} />
        <FilaMonto etiqueta="Dinero real cobrado" valor={datos.totalReal} destacado />
        <FilaMonto etiqueta="Diferencia / pendiente" valor={faltante} alerta={faltante > 0} />
      </div>
    </div>
  )
}

function Estadistica({ etiqueta, valor }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{valor}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{etiqueta}</div>
    </div>
  )
}

function FilaMonto({ etiqueta, valor, destacado, alerta }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: destacado ? '1.05rem' : '0.9rem' }}>
      <span style={{ color: destacado ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: destacado ? 700 : 400 }}>{etiqueta}</span>
      <strong style={{ color: alerta ? 'var(--red-600)' : destacado ? 'var(--green-600)' : 'var(--ink)' }}>
        ${valor} MXN
      </strong>
    </div>
  )
}
