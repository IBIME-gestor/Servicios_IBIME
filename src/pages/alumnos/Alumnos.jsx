
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { tienePermiso } from '../../lib/permisos'
import {
  TAM_PAGINA,
  consultarAlumnosPagina,
  contarAlumnos,
  normalizar,
  obtenerCatalogoAlumnos,
  puedeVerTodosLosPlanteles,
  reconstruirCatalogoAlumnos,
  sinPlantelAsignado,
} from '../../lib/alumnos'

const FILTROS_VACIOS = { plantel: '', nivel: '', grado: '', grupo: '' }

export default function Alumnos() {
  const { user } = useAuth()
  const verTodos = puedeVerTodosLosPlanteles(user)
  const [catalogo, setCatalogo] = useState(undefined) // undefined = cargando, null = no existe
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [texto, setTexto] = useState('')
  const [textoAplicado, setTextoAplicado] = useState('')
  const [pagina, setPagina] = useState(0)
  const [cursores, setCursores] = useState([null]) // cursores[i] = desde dónde empieza la página i
  const [resultado, setResultado] = useState(null) // { alumnos, hayMas, ultimo }
  const [total, setTotal] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [armando, setArmando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    obtenerCatalogoAlumnos().then(setCatalogo).catch(() => setCatalogo(null))
  }, [])

  // Quien no ve todos los planteles queda fijo en el suyo (con el texto exacto guardado).
  const plantelFijo = useMemo(() => {
    if (verTodos) return ''
    const mio = String(user?.plantel || '').trim()
    const igual = (catalogo?.planteles || []).find((p) => normalizar(p) === normalizar(mio))
    return igual || mio
  }, [verTodos, user, catalogo])

  const plantelEfectivo = verTodos ? filtros.plantel : plantelFijo
  const hayConsulta = Boolean(filtros.plantel || filtros.nivel || filtros.grado || filtros.grupo || textoAplicado.trim())

  async function cargarPagina(indice, pilaCursores) {
    setCargando(true)
    setError('')
    try {
      const res = await consultarAlumnosPagina({
        ...filtros,
        plantel: plantelEfectivo,
        texto: textoAplicado,
        cursor: pilaCursores[indice] || null,
      })
      setResultado(res)
      setPagina(indice)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No fue posible consultar los alumnos.')
    } finally {
      setCargando(false)
    }
  }

  // Cada cambio de filtro empieza una consulta nueva desde la página 1.
  useEffect(() => {
    if (!hayConsulta || (!verTodos && !plantelFijo)) {
      setResultado(null)
      setTotal(null)
      return
    }
    const pila = [null]
    setCursores(pila)
    cargarPagina(0, pila)
    if (!textoAplicado.trim()) {
      contarAlumnos({ ...filtros, plantel: plantelEfectivo }).then(setTotal).catch(() => setTotal(null))
    } else {
      setTotal(null)
    }
  }, [filtros, textoAplicado, plantelFijo])

  function irSiguiente() {
    if (!resultado?.hayMas) return
    const pila = [...cursores.slice(0, pagina + 1), resultado.ultimo]
    setCursores(pila)
    cargarPagina(pagina + 1, pila)
  }

  function irAnterior() {
    if (pagina === 0) return
    cargarPagina(pagina - 1, cursores)
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS)
    setTexto('')
    setTextoAplicado('')
  }

  async function armarFiltros() {
    setArmando(true)
    try {
      setCatalogo(await reconstruirCatalogoAlumnos())
    } catch (err) {
      setError(err?.message || 'No fue posible generar los filtros.')
    } finally {
      setArmando(false)
    }
  }

  const setFiltro = (clave) => (e) => setFiltros((f) => ({ ...f, [clave]: e.target.value }))
  const opciones = (clave) => catalogo?.[clave] || []
  const alumnos = resultado?.alumnos || []
  const desde = pagina * TAM_PAGINA + 1

  return (
    <div className="alumnos-page page-shell">
      <div className="page-heading"><div><h1>Alumnos</h1>
      <p className="page-subtitle">
        Directorio de solo lectura. Elige un plantel, nivel, grado o grupo (o busca por nombre/matrícula) para ver alumnos de 25 en 25.
      </p></div></div>

      {sinPlantelAsignado(user) && (
        <div className="card form-error">
          Tu cuenta aún no tiene un plantel asignado, por eso no ves alumnos. Pide al administrador que te lo asigne.
        </div>
      )}

      {catalogo === null && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <strong>Aún no hay filtros generados.</strong>
          <p className="page-muted" style={{ margin: '.4rem 0 .6rem' }}>
            Se generan solos al importar alumnos. Para la base que ya está cargada hay que armarlos una sola vez (lee todos los alumnos una vez).
          </p>
          {tienePermiso(user, 'admin.importar')
            ? <button className="btn btn-primary" disabled={armando} onClick={armarFiltros}>{armando ? 'Generando…' : 'Generar filtros ahora'}</button>
            : <span className="page-muted">Pide al administrador que los genere. Mientras tanto puedes buscar por nombre o matrícula.</span>}
        </div>
      )}

      <form className="alumnos-filtros" onSubmit={(e) => { e.preventDefault(); setTextoAplicado(texto) }}>
        <input
          className="input"
          placeholder="Buscar por inicio del nombre o matrícula…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {verTodos ? (
          <select className="input" value={filtros.plantel} onChange={setFiltro('plantel')}>
            <option value="">Plantel (todos)</option>
            {opciones('planteles').map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <select className="input" value={plantelFijo} disabled><option>{plantelFijo || 'Sin plantel'}</option></select>
        )}
        <select className="input" value={filtros.nivel} onChange={setFiltro('nivel')}>
          <option value="">Nivel (todos)</option>
          {opciones('niveles').map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="input" value={filtros.grado} onChange={setFiltro('grado')}>
          <option value="">Grado (todos)</option>
          {opciones('grados').map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="input" value={filtros.grupo} onChange={setFiltro('grupo')}>
          <option value="">Grupo (todos)</option>
          {opciones('grupos').map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Buscar</button>
        <button className="btn btn-outline" type="button" onClick={limpiar}>Limpiar</button>
      </form>

      {error && <div className="card form-error">⚠️ {error}</div>}

      {!hayConsulta && (
        <div className="card" style={{ padding: '1.4rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem' }}>🔎</div>
          <p className="page-muted" style={{ margin: '.4rem 0 0' }}>
            Los alumnos se muestran cuando eliges un filtro o buscas por nombre. Así se hacen muchas menos lecturas.
          </p>
        </div>
      )}

      {hayConsulta && (
        <>
          <div className="alumnos-paginacion">
            <span className="page-muted">
              {cargando ? 'Cargando…' : alumnos.length === 0 ? 'Sin resultados' : `Mostrando ${desde}–${desde + alumnos.length - 1}${total != null ? ` de ${total}` : ''}`}
            </span>
            <div>
              <button className="btn btn-outline btn-small" disabled={pagina === 0 || cargando} onClick={irAnterior}>← Anterior</button>
              <span style={{ margin: '0 .6rem', fontSize: '.82rem' }}>Página {pagina + 1}</span>
              <button className="btn btn-outline btn-small" disabled={!resultado?.hayMas || cargando} onClick={irSiguiente}>Siguiente →</button>
            </div>
          </div>

          <div className="alumnos-table-wrap">
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Matrícula</th>
                  {verTodos && <th>Plantel</th>}
                  <th>Nivel</th>
                  <th>Grado</th>
                  <th>Grupo</th>
                  <th>Tutor responsable</th>
                  <th>Teléfono tutor</th>
                  <th>Correo alumno</th>
                  <th>Correo tutor</th>
                </tr>
              </thead>
              <tbody>
                {alumnos.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.nombre}</strong></td>
                    <td className="page-muted">{a.matricula}</td>
                    {verTodos && <td>{a.plantel}</td>}
                    <td>{a.nivel}</td>
                    <td>{a.grado}</td>
                    <td>{a.grupo}</td>
                    <td>{a.tutor}</td>
                    <td>{a.telefonoTutor}</td>
                    <td>{a.correoAlumno}</td>
                    <td>{a.correoTutor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!cargando && alumnos.length === 0 && (
            <p className="page-muted" style={{ marginTop: '1rem' }}>No se encontraron alumnos con esos filtros.</p>
          )}
          {!verTodos && !textoAplicado && (
            <p className="page-muted" style={{ fontSize: '.75rem' }}>Orden por matrícula entre páginas; dentro de cada página van por nombre.</p>
          )}
        </>
      )}
    </div>
  )
}
