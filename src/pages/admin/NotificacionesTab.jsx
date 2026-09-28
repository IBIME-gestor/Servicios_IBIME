import { useEffect, useState } from 'react'
import { obtenerPlantillaNotificacion, guardarPlantillaNotificacion, prepararNotificacionesSemana } from '../../lib/notificaciones'
import { useAuth } from '../../contexts/AuthContext'

export default function NotificacionesTab() {
  const { user } = useAuth()
  const [plantilla,setPlantilla]=useState('')
  const [asunto,setAsunto]=useState('Resumen semanal de servicios IBIME')
  const [archivo,setArchivo]=useState('')
  const [fechaEnvio,setFechaEnvio]=useState('')
  const [cargando,setCargando]=useState(true)
  const [guardando,setGuardando]=useState(false)
  const [mensaje,setMensaje]=useState('')
  const [error,setError]=useState('')

  useEffect(()=>{ obtenerPlantillaNotificacion().then(d=>{setPlantilla(d.htmlTemplate||'');setAsunto(d.asunto||asunto);setCargando(false)}) },[])

  async function cargarArchivo(e){
    const file=e.target.files?.[0]
    if(!file) return
    setArchivo(file.name); setError('')
    if(!file.name.toLowerCase().endsWith('.html')) { setError('Selecciona un archivo .html.'); return }
    const text=await file.text(); setPlantilla(text)
  }

  async function guardar(){
    setGuardando(true);setMensaje('');setError('')
    try{await guardarPlantillaNotificacion({htmlTemplate:plantilla,asunto,usuario:user.email||user.uid});setMensaje('Plantilla guardada correctamente.')}catch(e){setError(e.message||'No se pudo guardar.')}finally{setGuardando(false)}
  }

  async function programar(){
    setGuardando(true);setMensaje('');setError('')
    try{const res=await prepararNotificacionesSemana({asunto,htmlTemplate:plantilla,usuario:user.email||user.uid,enviarDespues:new Date(fechaEnvio).toISOString()});setMensaje(`${res.creadas || 0} notificación(es) preparadas. Apps Script las enviará cuando llegue la fecha/hora programada.`)}catch(e){setError(e.message||'No se pudo programar el envío.')}finally{setGuardando(false)}
  }

  if(cargando) return <p style={{color:'var(--ink-muted)'}}>Cargando configuración…</p>
  return <div style={{maxWidth:900}}>
    <h2 style={{marginTop:0}}>✉️ Notificaciones</h2>
    <p style={{color:'var(--ink-muted)'}}>Carga la plantilla HTML del correo y prepara el resumen semanal de cafetería y estancia para los padres/tutores.</p>
    <div className="card" style={{padding:'1.25rem',marginBottom:'1.25rem'}}>
      <h3 style={{marginTop:0}}>1. Plantilla HTML</h3>
      <input type="file" accept=".html,text/html" onChange={cargarArchivo}/>
      {archivo && <div style={{fontSize:'0.8rem',color:'var(--ink-muted)',marginTop:'0.4rem'}}>{archivo}</div>}
      <label style={{display:'block',fontSize:'0.82rem',marginTop:'1rem'}}>Asunto<input className="input" value={asunto} onChange={e=>setAsunto(e.target.value)}/></label>
      <label style={{display:'block',fontSize:'0.82rem',marginTop:'0.8rem'}}>HTML<input className="input" value={plantilla} onChange={e=>setPlantilla(e.target.value)} style={{minHeight:180,fontFamily:'monospace'}}/></label>
      <p style={{fontSize:'0.78rem',color:'var(--ink-muted)'}}>Variables disponibles: <code>{'{{NOMBRE_ALUMNO}}'}</code>, <code>{'{{MATRICULA}}'}</code>, <code>{'{{GRADO}}'}</code>, <code>{'{{GRUPO}}'}</code>, <code>{'{{CONSUMOS_CAFETERIA}}'}</code>, <code>{'{{ESTANCIAS}}'}</code>, <code>{'{{TOTAL_COMEDOR}}'}</code>, <code>{'{{TOTAL_ESTANCIA}}'}</code>, <code>{'{{TOTAL_ESTIMADO}}'}</code>, <code>{'{{MENSAJE_COMETA}}'}</code>, <code>{'{{SEMANA}}'}</code>.</p>
      <button className="btn btn-primary" disabled={guardando||!plantilla.trim()} onClick={guardar}>Guardar plantilla</button>
    </div>
    <div className="card" style={{padding:'1.25rem'}}>
      <h3 style={{marginTop:0}}>2. Preparar envío semanal</h3>
      <p style={{fontSize:'0.85rem',color:'var(--ink-muted)'}}>El correo se genera con el detalle del alumno y se enviará desde la cuenta institucional mediante Apps Script. Se toma el correo del padre/madre/tutor guardado en la base.</p>
      <label style={{display:'block',fontSize:'0.82rem'}}>Enviar después de<input className="input" type="datetime-local" value={fechaEnvio} onChange={e=>setFechaEnvio(e.target.value)} style={{maxWidth:280}}/></label>
      <button className="btn btn-primary" style={{marginTop:'0.9rem'}} disabled={guardando||!fechaEnvio||!plantilla.trim()} onClick={programar}>{guardando?'Preparando…':'Preparar semana y programar envío'}</button>
    </div>
    {mensaje&&<p style={{color:'var(--green-600)'}}>{mensaje}</p>}{error&&<p style={{color:'var(--red-600)'}}>{error}</p>}
  </div>
}
