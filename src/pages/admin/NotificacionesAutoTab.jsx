import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { registrarLog } from '../../lib/log'
import {
  CATALOGO_CAMPOS,
  TIPOS_NOTIFICACION,
  UMBRAL_SALDO_DEFAULT,
  obtenerConfigAuto,
  guardarBorradorAuto,
  confirmarPlantillaAuto,
  cambiarActivaAuto,
  extraerVariables,
  renderPlantilla,
  datosEjemplo,
  enviarCorreoAppsScript,
} from '../../lib/notificacionesAuto'

const formatoFechaHora = (v) => {
  const d = v?.toDate ? v.toDate() : v
  return d ? new Date(d).toLocaleString('es-MX') : ''
}

/**
 * Plantilla de correo automático (ticket de pago o saldo pendiente).
 * Flujo: subir HTML → elegir campos → vista previa → (opcional) correo de prueba → Confirmar y activar.
 */
export default function NotificacionesAutoTab({ tipo }) {
  const { user } = useAuth()
  const info = TIPOS_NOTIFICACION[tipo]
  const catalogo = CATALOGO_CAMPOS[tipo]
  const clavesCatalogo = useMemo(() => new Set(catalogo.map((c) => c.clave)), [catalogo])

  const [cargando, setCargando] = useState(true)
  const [cfg, setCfg] = useState(null) // config completa de este tipo (borrador, publicada, activa)
  const [asunto, setAsunto] = useState(info.asuntoDefault)
  const [html, setHtml] = useState('')
  const [campos, setCampos] = useState([])
  const [umbral, setUmbral] = useState(UMBRAL_SALDO_DEFAULT)
  const [archivo, setArchivo] = useState('')
  const [correoPrueba, setCorreoPrueba] = useState(user?.email || '')
  const [trabajando, setTrabajando] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const todo = await obtenerConfigAuto()
      const t = todo[tipo]
      setCfg(t)
      setAsunto(t.borrador?.asunto || info.asuntoDefault)
      setHtml(t.borrador?.html || '')
      setCampos(t.borrador?.campos || [])
      if (tipo === 'saldo') setUmbral(t.umbral || UMBRAL_SALDO_DEFAULT)
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la configuración.')
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, [tipo])

  const usadas = useMemo(() => extraerVariables(`${asunto}\n${html}`), [asunto, html])
  const desconocidas = usadas.filter((k) => !clavesCatalogo.has(k))
  const sinHabilitar = usadas.filter((k) => clavesCatalogo.has(k) && !campos.includes(k))
  const hayCambios = cfg && (
    !cfg.publicada ||
    cfg.publicada.html !== html ||
    cfg.publicada.asunto !== asunto ||
    JSON.stringify([...(cfg.publicada.campos || [])].sort()) !== JSON.stringify([...campos].sort()) ||
    (tipo === 'saldo' && Number(cfg.umbral) !== Number(umbral))
  )

  const ejemplo = useMemo(() => datosEjemplo(tipo), [tipo])
  const vistaPrevia = useMemo(() => renderPlantilla(html, ejemplo, campos), [html, ejemplo, campos])
  const asuntoPrevio = useMemo(() => renderPlantilla(asunto, ejemplo, campos, { comoHtml: false }), [asunto, ejemplo, campos])

  async function cargarArchivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setMensaje('')
    if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
      setError('Selecciona un archivo .html.')
      return
    }
    const texto = await file.text()
    setArchivo(file.name)
    setHtml(texto)
    // Al subir, se habilitan automáticamente los campos que la plantilla ya usa.
    setCampos(extraerVariables(`${asunto}\n${texto}`).filter((k) => clavesCatalogo.has(k)))
  }

  function alternarCampo(clave) {
    setCampos((lista) => (lista.includes(clave) ? lista.filter((k) => k !== clave) : [...lista, clave]))
  }

  async function copiar(clave) {
    try {
      await navigator.clipboard.writeText(`{{${clave}}}`)
      setCopiado(clave)
      setTimeout(() => setCopiado(''), 1200)
    } catch { /* sin permiso de portapapeles */ }
  }

  const correo = user?.email || user?.uid || 'usuario'

  async function accion(nombre, fn, okMsg) {
    setTrabajando(nombre); setMensaje(''); setError('')
    try {
      await fn()
      if (okMsg) setMensaje(okMsg)
      await cargar()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo completar la acción.')
    } finally {
      setTrabajando('')
    }
  }

  const guardarBorrador = () => accion('borrador', () => guardarBorradorAuto({ tipo, asunto, html, campos, umbral, usuario: correo }), 'Borrador guardado. La automatización sigue usando la última plantilla confirmada.')

  const confirmar = () => {
    if (desconocidas.length && !window.confirm(`Estas variables no existen y saldrán vacías: ${desconocidas.map((k) => `{{${k}}}`).join(', ')}.\n\n¿Confirmar de todos modos?`)) return
    if (sinHabilitar.length && !window.confirm(`Tu HTML usa campos que no marcaste: ${sinHabilitar.map((k) => `{{${k}}}`).join(', ')}.\nSaldrán vacíos.\n\n¿Confirmar de todos modos?`)) return
    return accion('confirmar', async () => {
      await confirmarPlantillaAuto({ tipo, asunto, html, campos, umbral, usuario: correo })
      registrarLog({ user, accion: 'admin.notificacion_auto_confirmar', modulo: 'admin', entidad: 'config', entidadId: 'notificaciones_auto', detalle: { tipo, campos, umbral: tipo === 'saldo' ? Number(umbral) : null } })
    }, `Plantilla confirmada. Desde ahora ${tipo === 'ticket' ? 'cada pago confirmado enviará el ticket' : `al juntar ${umbral} estancias pendientes se enviará el aviso`} automáticamente.`)
  }

  const alternarActiva = () => accion('activa', async () => {
    await cambiarActivaAuto({ tipo, activa: !cfg.activa })
    registrarLog({ user, accion: cfg.activa ? 'admin.notificacion_auto_pausar' : 'admin.notificacion_auto_reanudar', modulo: 'admin', entidad: 'config', entidadId: 'notificaciones_auto', detalle: { tipo } })
  }, cfg?.activa ? 'Envío automático en pausa.' : 'Envío automático reanudado.')

  const enviarPrueba = () => accion('prueba', async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoPrueba.trim())) throw new Error('Escribe un correo válido para la prueba.')
    await enviarCorreoAppsScript({ to: correoPrueba.trim(), subject: `[PRUEBA] ${asuntoPrevio}`, htmlBody: vistaPrevia, tipo })
  }, `Correo de prueba enviado a ${correoPrueba.trim()} (con datos de ejemplo).`)

  if (cargando) return <p style={{ color: 'var(--ink-muted)' }}>Cargando…</p>

  const estado = !cfg.publicada ? { texto: 'Sin plantilla confirmada · no se envía nada', color: '#b91c1c', fondo: '#fee2e2' }
    : !cfg.activa ? { texto: 'En pausa · no se está enviando', color: '#92400e', fondo: '#fef3c7' }
    : { texto: 'Activa · se envía automáticamente', color: '#166534', fondo: '#dcfce7' }

  return (
    <div style={{ maxWidth: 980 }}>
      <h3 style={{ marginTop: 0 }}>{info.icono} {info.titulo}</h3>
      <p style={{ color: 'var(--ink-muted)', marginTop: '-0.3rem' }}>{info.descripcion}</p>

      <div className="card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <span className="status-pill" style={{ background: estado.fondo, color: estado.color }}>{estado.texto}</span>
          {cfg.publicada?.confirmadoEn && (
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: 4 }}>
              Última confirmación: {formatoFechaHora(cfg.publicada.confirmadoEn)} · {cfg.publicada.confirmadoPor}
            </div>
          )}
          {cfg.publicada && hayCambios && <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: 4, fontWeight: 700 }}>Tienes cambios sin confirmar: el envío usa la versión anterior.</div>}
        </div>
        {cfg.publicada && (
          <button className="btn btn-outline btn-small" disabled={Boolean(trabajando)} onClick={alternarActiva}>
            {cfg.activa ? '⏸ Pausar envío' : '▶ Reanudar envío'}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>1. Sube tu plantilla HTML</h4>
        <input type="file" accept=".html,.htm,text/html" onChange={cargarArchivo} />
        {archivo && <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '0.4rem' }}>{archivo}</div>}

        <label style={{ display: 'block', fontSize: '0.82rem', marginTop: '1rem' }}>
          Asunto del correo (puede llevar campos, ej. {'{{NOMBRE_ALUMNO}}'})
          <input className="input" value={asunto} onChange={(e) => setAsunto(e.target.value)} style={{ marginTop: 4 }} />
        </label>

        <label style={{ display: 'block', fontSize: '0.82rem', marginTop: '0.8rem' }}>
          HTML (también puedes pegarlo o ajustarlo aquí)
          <textarea className="input" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} style={{ marginTop: 4, minHeight: 200, fontFamily: 'monospace', fontSize: '0.78rem' }} />
        </label>

        {tipo === 'saldo' && (
          <label style={{ display: 'block', fontSize: '0.82rem', marginTop: '0.9rem' }}>
            Enviar el aviso cuando el alumno acumule este número de estancias pendientes
            <input className="input" type="number" min={1} value={umbral} onChange={(e) => setUmbral(e.target.value)} style={{ maxWidth: 120, marginTop: 4 }} />
          </label>
        )}
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>2. Campos que se llenarán</h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 0 }}>
          Marca los campos que quieres que se llenen. Escribe en tu HTML el nombre entre llaves dobles (clic en “Copiar”).
          Cualquier campo sin marcar, o que no exista, sale vacío. Al subir el archivo se marcan solos los que ya usa.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.5rem' }}>
          {catalogo.map((c) => {
            const enHtml = usadas.includes(c.clave)
            const activo = campos.includes(c.clave)
            return (
              <div key={c.clave} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.65rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: activo ? 'var(--surface-sunken)' : 'transparent' }}>
                <input type="checkbox" checked={activo} onChange={() => alternarCampo(c.clave)} style={{ marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: '0.8rem' }}>{`{{${c.clave}}}`}</code>
                  <div style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{c.descripcion}</div>
                  <div style={{ fontSize: '0.7rem', marginTop: 2, color: enHtml ? '#166534' : 'var(--ink-muted)' }}>{enHtml ? '✓ está en tu HTML' : 'no está en tu HTML'}</div>
                </div>
                <button type="button" className="btn btn-outline btn-small" onClick={() => copiar(c.clave)}>{copiado === c.clave ? '✓' : 'Copiar'}</button>
              </div>
            )
          })}
        </div>
        {desconocidas.length > 0 && <p style={{ color: '#b91c1c', fontSize: '0.82rem', marginBottom: 0 }}>⚠️ Variables que no existen (saldrán vacías): {desconocidas.map((k) => `{{${k}}}`).join(', ')}</p>}
        {sinHabilitar.length > 0 && <p style={{ color: '#92400e', fontSize: '0.82rem', marginBottom: 0 }}>⚠️ Están en tu HTML pero sin marcar (saldrán vacías): {sinHabilitar.map((k) => `{{${k}}}`).join(', ')}</p>}
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>3. Vista previa (con datos de ejemplo)</h4>
        {html.trim() ? (
          <>
            <div style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}><strong>Asunto:</strong> {asuntoPrevio}</div>
            <iframe title="Vista previa del correo" sandbox="" srcDoc={vistaPrevia} style={{ width: '100%', height: 420, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
          </>
        ) : <p className="page-muted">Sube o pega tu HTML para ver cómo quedará.</p>}

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'end', flexWrap: 'wrap', marginTop: '1rem' }}>
          <label style={{ fontSize: '0.82rem' }}>Enviar prueba a
            <input className="input" type="email" value={correoPrueba} onChange={(e) => setCorreoPrueba(e.target.value)} style={{ minWidth: 260, marginTop: 4 }} />
          </label>
          <button className="btn btn-outline" disabled={Boolean(trabajando) || !html.trim()} onClick={enviarPrueba}>{trabajando === 'prueba' ? 'Enviando…' : '✉️ Enviar correo de prueba'}</button>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h4 style={{ marginTop: 0 }}>4. Confirmar</h4>
        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginTop: 0 }}>
          Al confirmar, esta versión queda publicada y la automatización se activa:{' '}
          {tipo === 'ticket'
            ? 'cada vez que se confirme un pago de estancia (efectivo o tarjeta) se enviará el ticket al correo del tutor y del alumno. Los “Ajuste acuerdo” de $0 no generan ticket.'
            : `cada vez que un alumno llegue a ${Number(umbral) || UMBRAL_SALDO_DEFAULT} estancias pendientes se enviará el aviso de saldo. Si después suma otra pendiente se manda un aviso actualizado.`}
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" disabled={Boolean(trabajando)} onClick={guardarBorrador}>{trabajando === 'borrador' ? 'Guardando…' : 'Guardar borrador'}</button>
          <button className="btn btn-primary" disabled={Boolean(trabajando) || !html.trim()} onClick={confirmar}>{trabajando === 'confirmar' ? 'Confirmando…' : '✅ Confirmar y activar'}</button>
        </div>
        {mensaje && <p style={{ color: 'var(--green-600)', marginBottom: 0 }}>{mensaje}</p>}
        {error && <p style={{ color: 'var(--red-600)', marginBottom: 0 }}>{error}</p>}
      </div>
    </div>
  )
}
