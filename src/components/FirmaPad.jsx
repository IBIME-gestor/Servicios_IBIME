import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

/**
 * Panel de firma. Expone getBlob() por ref para que el padre la lea
 * solo hasta que el usuario confirme el retiro (no en cada trazo).
 */
const FirmaPad = forwardRef(function FirmaPad({ onCambio }, ref) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  function posicion(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const punto = e.touches ? e.touches[0] : e
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top }
  }

  function iniciar(e) {
    e.preventDefault()
    dibujando.current = true
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = posicion(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function mover(e) {
    if (!dibujando.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = posicion(e, canvas)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c2530'
    ctx.lineTo(x, y)
    ctx.stroke()
    if (vacio) setVacio(false)
  }

  function soltar() {
    dibujando.current = false
    onCambio?.(!vacio)
  }

  function limpiar() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setVacio(true)
    onCambio?.(false)
  }

  useImperativeHandle(ref, () => ({
    getBlob: () => new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png')),
    estaVacio: () => vacio,
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        style={{ width: '100%', maxWidth: 480, height: 160, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, touchAction: 'none' }}
        onMouseDown={iniciar}
        onMouseMove={mover}
        onMouseUp={soltar}
        onMouseLeave={soltar}
        onTouchStart={iniciar}
        onTouchMove={mover}
        onTouchEnd={soltar}
      />
      <button type="button" className="btn btn-outline" style={{ marginTop: '0.5rem' }} onClick={limpiar}>
        Borrar firma
      </button>
    </div>
  )
})

export default FirmaPad
