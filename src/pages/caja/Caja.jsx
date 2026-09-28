import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { listarAlumnosActivos } from '../../lib/alumnos'
import { consumosSemanaTodos } from '../../lib/consumos'
import { estanciasSemanaTodas } from '../../lib/estancia'
import { obtenerConfigComedor } from '../../lib/pricingComedor'
import { marcarDetalleCobro } from '../../lib/cobros'
import { formatoFecha, formatoHora } from '../../lib/fechas'

const dinero = (n) => `$${Number(n || 0).toFixed(2)} MXN`

export default function Caja() {
  const { user } = useAuth()
  const [alumnos, setAlumnos] = useState([])
  const [consumos, setConsumos] = useState([])
  const [estancias, setEstancias] = useState([])
  const [configComedor, setConfigComedor] = useState(null)
  const [texto, setTexto] = useState('')
  const [expandirRegistro, setExpandirRegistro] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [modulo, setModulo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState('')

  async function cargar() {
    setCargando(true)
    const [a, c, e, cfg] = await Promise.all([listarAlumnosActivos(), consumosSemanaTodos(), estanciasSemanaTodas(), obtenerConfigComedor()])
    setAlumnos(a)
    setConsumos(c)
    setEstancias(e.filter((x) => x.horaSalida))
    setConfigComedor(cfg)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const actividad = useMemo(() => {
    const mapa = new Map(alumnos.map((a) => [a.id, { ...a, cafeteria: [], estancia: [] }]))
    consumos.forEach((c) => mapa.get(c.alumnoId)?.cafeteria.push(c))
    estancias.forEach((e) => mapa.get(e.alumnoId)?.estancia.push(e))
    return Array.from(mapa.values())
  }, [alumnos, consumos, estancias])

  const alumnosEnRegistro = actividad.filter((a) => a.cafeteria.length || a.estancia.length)
  const filtrados = alumnosEnRegistro.filter((a) => {
    const t = texto.trim().toLowerCase()
    return !t || a.nombre?.toLowerCase().includes(t) || a.matricula?.toLowerCase().includes(t) || a.grupo?.toLowerCase().includes(t)
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))

  function seleccionar(a) {
    setSeleccionadoId(a.id)
    setModulo(null)
  }

  const seleccionado = actividad.find(a => a.id === seleccionadoId) || null
  const cafeteriaSeleccionada = seleccionado?.cafeteria || []
  const estanciaSeleccionada = seleccionado?.estancia || []
  const totalCafeteria = cafeteriaSeleccionada.reduce((s, c) => s + (Number.isFinite(Number(c.costo)) ? Number(c.costo) : (c.tipo === 'desayuno' ? configComedor?.precioDesayuno || 0 : configComedor?.precioComida || 0)), 0)
  const totalEstancia = estanciaSeleccionada.reduce((s, e) => s + (Number(e.costo) || 0), 0)

  async function cambiarEstado(coleccion, id, campo, valor) {
    const key = `${coleccion}-${id}-${campo}`
    setGuardando(key)
    try {
      await marcarDetalleCobro({ coleccion, id, campo, valor, usuario: user.email || user.uid })
      const aplicar = (lista) => lista.map((x) => x.id === id ? { ...x, [campo]: valor } : x)
      if (coleccion === 'consumos') setConsumos(aplicar)
      else setEstancias(aplicar)
    } finally {
      setGuardando('')
    }
  }

  if (cargando) return <p style={{ color: 'var(--ink-muted)' }}>Cargando registro de alumnos…</p>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>💳 Caja</h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.5rem' }}>Dashboard semanal de alumnos con consumo de cafetería y/o estancia.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.8rem', marginBottom: '1.25rem' }}>
        <Kpi titulo="Alumnos" valor={alumnos.length} />
        <Kpi titulo="Con cafetería" valor={actividad.filter(a => a.cafeteria.length).length} />
        <Kpi titulo="Con estancia" valor={actividad.filter(a => a.estancia.length).length} />
        <button className="card" onClick={() => setExpandirRegistro(v => !v)} style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', padding: '1rem' }}>
          <div style={{ fontSize: '1.55rem', fontWeight: 800 }}>{alumnosEnRegistro.length}</div>
          <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>Alumnos en registro {expandirRegistro ? '▲' : '▼'}</div>
        </button>
      </div>

      {expandirRegistro && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <div><strong>Alumnos en registro</strong><div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Solo esta sección es desplegable.</div></div>
            <input className="input" placeholder="Buscar alumno…" value={texto} onChange={e => setTexto(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--ink-muted)', fontSize: '0.78rem' }}><th>Alumno</th><th>Grupo</th><th>Comedor</th><th>Estancia</th><th>Total estimado</th></tr></thead>
              <tbody>
                {filtrados.map(a => {
                  const tc = a.cafeteria.reduce((s,c)=>s+(Number(c.costo)|| (c.tipo==='desayuno'?configComedor?.precioDesayuno||0:configComedor?.precioComida||0)),0)
                  const te = a.estancia.reduce((s,e)=>s+(Number(e.costo)||0),0)
                  return <tr key={a.id} onClick={() => seleccionar(a)} style={{ borderTop:'1px solid var(--border)', cursor:'pointer' }}>
                    <td style={{ padding:'0.65rem 0.4rem' }}><strong>{a.nombre}</strong><div style={{fontSize:'0.75rem',color:'var(--ink-muted)'}}>{a.matricula}</div></td>
                    <td>{a.grado} {a.grupo}</td><td>🍽️ {a.cafeteria.length}</td><td>🏫 {a.estancia.length}</td><td><strong>{dinero(tc+te)}</strong></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {seleccionado && (
        <div className="card" style={{ padding:'1.25rem' }}>
          <div style={{display:'flex',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap'}}>
            <div><h2 style={{margin:'0 0 0.25rem',fontSize:'1.15rem'}}>{seleccionado.nombre}</h2><span style={{fontSize:'0.8rem',color:'var(--ink-muted)'}}>{seleccionado.grado} {seleccionado.grupo} · {seleccionado.matricula} · {seleccionado.correoAlumno || 'sin correo alumno'}</span></div>
            <button className="btn btn-outline" onClick={()=>setSeleccionadoId(null)}>Cerrar</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1.25rem'}}>
            <Modulo titulo="🍽️ Comedor" total={totalCafeteria} activo={modulo==='comedor'} onClick={()=>setModulo(modulo==='comedor'?null:'comedor')} detalle={`${cafeteriaSeleccionada.length} registro(s)`}/>
            <Modulo titulo="🏫 Estancia" total={totalEstancia} activo={modulo==='estancia'} onClick={()=>setModulo(modulo==='estancia'?null:'estancia')} detalle={`${estanciaSeleccionada.length} registro(s)`}/>
          </div>

          <div style={{display:'flex',justifyContent:'space-between',marginTop:'1.25rem',paddingTop:'1rem',borderTop:'1px solid var(--border)'}}><strong>Total estimado</strong><strong style={{fontSize:'1.35rem'}}>{dinero(totalCafeteria+totalEstancia)}</strong></div>

          {modulo==='comedor' && <DetalleComedor rows={cafeteriaSeleccionada} config={configComedor} cambiarEstado={cambiarEstado} guardando={guardando}/>} 
          {modulo==='estancia' && <DetalleEstancia rows={estanciaSeleccionada} cambiarEstado={cambiarEstado} guardando={guardando}/>} 
        </div>
      )}
    </div>
  )
}

function Kpi({titulo,valor}) { return <div className="card" style={{padding:'1rem'}}><div style={{fontSize:'1.55rem',fontWeight:800}}>{valor}</div><div style={{color:'var(--ink-muted)',fontSize:'0.8rem'}}>{titulo}</div></div> }
function Modulo({titulo,total,detalle,activo,onClick}) { return <button onClick={onClick} className="card" style={{padding:'1rem',textAlign:'left',cursor:'pointer',border:`2px solid ${activo?'var(--red-600)':'var(--border)'}`,background:activo?'var(--surface-sunken)':'var(--surface)'}}><div style={{fontWeight:800}}>{titulo}</div><div style={{fontSize:'1.35rem',marginTop:'0.3rem'}}>{dinero(total)}</div><div style={{fontSize:'0.78rem',color:'var(--ink-muted)'}}>{detalle} · {activo?'ocultar detalle':'ver detalle'}</div></button> }

function Check({label,checked,disabled,onChange}) { return <label style={{display:'inline-flex',alignItems:'center',gap:'0.35rem',fontSize:'0.78rem',opacity:disabled?0.5:1}}><input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={e=>onChange(e.target.checked)}/>{label}</label> }

function DetalleComedor({rows,config,cambiarEstado,guardando}) { return <div style={{marginTop:'1rem'}}><h3 style={{fontSize:'0.95rem'}}>Detalle de comedor</h3>{rows.length===0?<p>Sin consumos.</p>:rows.map(c=>{const costo=Number(c.costo)|| (c.tipo==='desayuno'?config?.precioDesayuno||0:config?.precioComida||0); return <div key={c.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'0.8rem',alignItems:'center',padding:'0.65rem 0',borderTop:'1px solid var(--border)'}}><div><strong>{c.tipo==='desayuno'?'Desayuno':'Comida'}</strong><div style={{fontSize:'0.76rem',color:'var(--ink-muted)'}}>{c.fecha?`${formatoFecha(c.fecha)} · ${formatoHora(c.fecha)}`:'—'} · {dinero(costo)}</div></div><Check label="Cargado" checked={c.cargado} disabled={guardando===`consumos-${c.id}-cargado`} onChange={v=>cambiarEstado('consumos',c.id,'cargado',v)}/><Check label="Pagado" checked={c.pagado} disabled={!c.cargado || guardando===`consumos-${c.id}-pagado`} onChange={v=>cambiarEstado('consumos',c.id,'pagado',v)}/></div>})}</div> }
function DetalleEstancia({rows,cambiarEstado,guardando}) { return <div style={{marginTop:'1rem'}}><h3 style={{fontSize:'0.95rem'}}>Detalle de estancia</h3>{rows.length===0?<p>Sin estancias cerradas.</p>:rows.map(e=><div key={e.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'0.8rem',alignItems:'center',padding:'0.65rem 0',borderTop:'1px solid var(--border)'}}><div><strong>{e.horaEntrada?formatoFecha(e.horaEntrada):'—'}</strong><div style={{fontSize:'0.76rem',color:'var(--ink-muted)'}}>{e.horaEntrada?formatoHora(e.horaEntrada):'—'} → {e.horaSalida?formatoHora(e.horaSalida):'—'} · {e.minutos||0} min · {dinero(e.costo)}</div></div><Check label="Cargado" checked={e.cargado} disabled={guardando===`estancias-${e.id}-cargado`} onChange={v=>cambiarEstado('estancias',e.id,'cargado',v)}/><Check label="Pagado" checked={e.pagado} disabled={!e.cargado || guardando===`estancias-${e.id}-pagado`} onChange={v=>cambiarEstado('estancias',e.id,'pagado',v)}/></div>)}</div> }
