import { useEffect, useState } from 'react'
import { consumosSemanaTodos, costoConsumo } from '../../lib/consumos'
import { estanciasSemanaTodas } from '../../lib/estancia'
import { obtenerConfigComedor } from '../../lib/pricingComedor'

const dinero = n => `$${Number(n || 0).toFixed(2)} MXN`

export default function DashboardPagos() {
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  async function cargar() {
    setCargando(true)
    const [consumos, estancias, config] = await Promise.all([consumosSemanaTodos(), estanciasSemanaTodas(), obtenerConfigComedor()])
    const cerradas = estancias.filter(e => e.horaSalida)
    const cafeteria = consumos.map(c => ({ ...c, costoCalculado: costoConsumo(c, config) }))
    const totalCaf = cafeteria.reduce((s,c)=>s+c.costoCalculado,0)
    const totalEst = cerradas.reduce((s,e)=>s+(Number(e.costo)||0),0)
    const pagCaf = cafeteria.filter(c=>c.pagado).reduce((s,c)=>s+c.costoCalculado,0)
    const pagEst = cerradas.filter(e=>e.pagado).reduce((s,e)=>s+(Number(e.costo)||0),0)
    const cargCaf = cafeteria.filter(c=>c.cargado).reduce((s,c)=>s+c.costoCalculado,0)
    const cargEst = cerradas.filter(e=>e.cargado).reduce((s,e)=>s+(Number(e.costo)||0),0)
    setDatos({
      cafeteria:{registros:cafeteria.length,cargados:cafeteria.filter(c=>c.cargado).length,pagados:cafeteria.filter(c=>c.pagado).length,total:totalCaf,cargado:cargCaf,pagado:pagCaf},
      estancia:{registros:cerradas.length,cargados:cerradas.filter(e=>e.cargado).length,pagados:cerradas.filter(e=>e.pagado).length,total:totalEst,cargado:cargEst,pagado:pagEst},
    })
    setCargando(false)
  }

  useEffect(()=>{cargar()},[])
  if(cargando) return <p style={{color:'var(--ink-muted)'}}>Cargando pagos…</p>
  const pendienteCaf = datos.cafeteria.total-datos.cafeteria.pagado
  const pendienteEst = datos.estancia.total-datos.estancia.pagado
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap',marginBottom:'1.25rem'}}>
      <div><h2 style={{margin:0}}>Pagos</h2><p style={{color:'var(--ink-muted)',margin:'0.25rem 0 0'}}>Solo los detalles marcados como <strong>Pagado</strong> se acumulan como dinero cobrado.</p></div>
      <button className="btn btn-outline" onClick={cargar}>Actualizar</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
      <Bloque titulo="🍽️ Comedor" datos={datos.cafeteria}/>
      <Bloque titulo="🏫 Estancia" datos={datos.estancia}/>
    </div>
    <div className="card" style={{marginTop:'1.25rem',padding:'1.25rem'}}>
      <h3 style={{marginTop:0}}>Resumen de dinero cobrado</h3>
      <Fila label="Comedor pagado" value={datos.cafeteria.pagado}/>
      <Fila label="Estancia pagada" value={datos.estancia.pagado}/>
      <Fila label="TOTAL COBRADO" value={datos.cafeteria.pagado+datos.estancia.pagado} fuerte/>
      <div style={{marginTop:'0.7rem',paddingTop:'0.7rem',borderTop:'1px solid var(--border)',color:'var(--ink-muted)',fontSize:'0.82rem'}}>Pendiente estimado: {dinero(pendienteCaf+pendienteEst)}</div>
    </div>
  </div>
}
function Bloque({titulo,datos}) { return <div className="card" style={{padding:'1.25rem'}}><h3 style={{marginTop:0}}>{titulo}</h3><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.8rem',marginBottom:'1rem'}}><Mini n={datos.registros} t="Registros"/><Mini n={datos.cargados} t="Cargados"/><Mini n={datos.pagados} t="Pagados"/></div><Fila label="Total estimado" value={datos.total}/><Fila label="Cargado" value={datos.cargado}/><Fila label="Pagado / cobrado" value={datos.pagado} fuerte/><Fila label="Pendiente" value={datos.total-datos.pagado}/></div> }
function Mini({n,t}) { return <div><div style={{fontSize:'1.35rem',fontWeight:800}}>{n}</div><div style={{fontSize:'0.75rem',color:'var(--ink-muted)'}}>{t}</div></div> }
function Fila({label,value,fuerte}) { return <div style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',fontWeight:fuerte?800:500}}><span>{label}</span><span>{dinero(value)}</span></div> }
