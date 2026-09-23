// Catálogo central de permisos. Cada usuario guarda en Firestore un array
// `permisos` con las claves que tiene activas (ej. ['cafeteria.ver',
// 'cafeteria.registrar']). El permiso especial "admin" desbloquea TODO,
// así no hay que marcarle uno por uno a quien administra el sistema.

export const PERMISO_ADMIN = 'admin'

export const CATALOGO_PERMISOS = [
  {
    grupo: 'Alumnos',
    permisos: [
      { clave: 'alumnos.ver', etiqueta: 'Ver alumnos y grupos', descripcion: 'Consulta de solo lectura del directorio de alumnos.' },
    ],
  },
  {
    grupo: 'Cafetería',
    permisos: [
      { clave: 'cafeteria.ver', etiqueta: 'Entrar al módulo de cafetería', descripcion: '' },
      { clave: 'cafeteria.registrar', etiqueta: 'Registrar desayuno/comida', descripcion: '' },
    ],
  },
  {
    grupo: 'Estancia',
    permisos: [
      { clave: 'estancia.ver', etiqueta: 'Entrar al módulo de estancia', descripcion: '' },
      { clave: 'estancia.registrar', etiqueta: 'Registrar llegadas y retiros', descripcion: '' },
    ],
  },
  {
    grupo: 'Caja',
    permisos: [
      { clave: 'caja.ver', etiqueta: 'Ver concentrado semanal de caja', descripcion: '' },
    ],
  },
  {
    grupo: 'Administración',
    permisos: [
      { clave: 'admin.usuarios', etiqueta: 'Gestionar usuarios y permisos', descripcion: '' },
      { clave: 'admin.importar', etiqueta: 'Importar alumnos por Excel', descripcion: '' },
      { clave: 'admin.config_estancia', etiqueta: 'Configurar tarifas de estancia', descripcion: '' },
      { clave: 'admin.config_comedor', etiqueta: 'Configurar precios de comedor', descripcion: '' },
      { clave: 'admin.pagos', etiqueta: 'Ver panel de pagos (estancia y cafetería)', descripcion: '' },
      { clave: 'admin.carga_retroactiva', etiqueta: 'Hacer cargas retroactivas de comedor y estancia', descripcion: 'Permite capturar servicios de una fecha y hora anteriores conservando la fecha real de captura.' },
    ],
  },
]

/** Permisos con los que arranca cualquier persona nueva ("colaborador"): solo ver alumnos. */
export const PERMISOS_COLABORADOR = ['alumnos.ver']

/** true si el usuario tiene ese permiso, o si es administrador (que los tiene todos). */
export function tienePermiso(user, clave) {
  if (!user?.permisos) return false
  return user.permisos.includes(PERMISO_ADMIN) || user.permisos.includes(clave)
}
