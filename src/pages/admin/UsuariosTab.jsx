import { useEffect, useState } from 'react'
import { listarUsuarios, actualizarPermisosUsuario, actualizarActivoUsuario } from '../../lib/usuarios'
import { CATALOGO_PERMISOS, PERMISO_ADMIN, PERMISOS_COLABORADOR } from '../../lib/permisos'
import { useAuth } from '../../contexts/AuthContext'

export default function UsuariosTab() {
  const { user: yo } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null) // usuario seleccionado para editar permisos

  async function cargar() {
    setCargando(true)
    setUsuarios(await listarUsuarios())
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  return (
    <div>
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', borderLeft: '3px solid var(--navy-500)', maxWidth: 720 }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          Cualquiera con su <strong>cuenta institucional de Google</strong> puede entrar. La primera vez que alguien
          inicia sesión aparece aquí como <strong>Colaborador</strong> (solo puede ver alumnos y grupos). Elige a
          quién editar y marca las casillas de lo que sí puede hacer.
        </p>
      </div>

      {cargando ? (
        <p style={{ color: 'var(--ink-muted)' }}>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: editando ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start', maxWidth: editando ? 980 : 720 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                <th style={{ padding: '0.4rem' }}>Nombre</th>
                <th style={{ padding: '0.4rem' }}>Correo</th>
                <th style={{ padding: '0.4rem' }}>Permisos</th>
                <th style={{ padding: '0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 0.4rem' }}>{u.nombre}</td>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--ink-muted)' }}>{u.email}</td>
                  <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.85rem' }}>
                    {u.permisos?.includes(PERMISO_ADMIN) ? (
                      <span style={{ fontWeight: 700, color: 'var(--red-600)' }}>Administrador</span>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>{(u.permisos || []).length} permiso(s)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem 0.4rem' }}>
                    <button className="btn btn-outline" onClick={() => setEditando(u)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editando && (
            <EditorPermisos
              usuario={editando}
              esUnoMismo={editando.id === yo?.uid}
              onCerrar={() => setEditando(null)}
              onGuardado={async () => {
                await cargar()
                setEditando(null)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function EditorPermisos({ usuario, esUnoMismo, onCerrar, onGuardado }) {
  const [permisos, setPermisos] = useState(usuario.permisos || PERMISOS_COLABORADOR)
  const [activo, setActivo] = useState(usuario.activo !== false)
  const [guardando, setGuardando] = useState(false)
  const esAdmin = permisos.includes(PERMISO_ADMIN)

  function alternar(clave) {
    setPermisos((prev) => (prev.includes(clave) ? prev.filter((p) => p !== clave) : [...prev, clave]))
  }

  function alternarAdmin() {
    setPermisos((prev) => (prev.includes(PERMISO_ADMIN) ? [] : [PERMISO_ADMIN]))
  }

  async function guardar() {
    setGuardando(true)
    try {
      await actualizarPermisosUsuario(usuario.id, permisos)
      if (activo !== (usuario.activo !== false)) {
        await actualizarActivoUsuario(usuario.id, activo)
      }
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ marginTop: 0 }}>{usuario.nombre}</h3>
      <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem', marginTop: '-0.5rem' }}>{usuario.email}</p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', background: 'var(--surface-sunken)', borderRadius: 6, marginBottom: '1rem', cursor: esUnoMismo ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={esAdmin} disabled={esUnoMismo} onChange={alternarAdmin} />
        <strong>Administrador (todos los permisos)</strong>
      </label>
      {esUnoMismo && (
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '-0.7rem' }}>
          No puedes quitarte tu propio acceso de administrador desde aquí.
        </p>
      )}

      <div style={{ opacity: esAdmin ? 0.45 : 1, pointerEvents: esAdmin ? 'none' : 'auto' }}>
        {CATALOGO_PERMISOS.map((grupo) => (
          <div key={grupo.grupo} style={{ marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '0.3rem' }}>
              {grupo.grupo}
            </div>
            {grupo.permisos.map((p) => (
              <label key={p.clave} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={permisos.includes(p.clave)} onChange={() => alternar(p.clave)} />
                <span style={{ fontSize: '0.9rem' }}>{p.etiqueta}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: esUnoMismo ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={activo} disabled={esUnoMismo} onChange={(e) => setActivo(e.target.checked)} />
        <span style={{ fontSize: '0.9rem' }}>Cuenta activa (desmarca para bloquear su acceso)</span>
      </label>

      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
        <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}
