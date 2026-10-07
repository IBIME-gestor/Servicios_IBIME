// Secciones de Administración: las usa el panel (pestañas) y el menú superior (cajón).
export const ADMIN_SECCIONES = [
  { id: 'usuarios', label: 'Usuarios y permisos', icon: '🔑', permiso: 'admin.usuarios' },
  { id: 'importar', label: 'Importar alumnos', icon: '📥', permiso: 'admin.importar' },
  { id: 'estancia', label: 'Configurar estancia', icon: '🏫', permiso: 'admin.config_estancia' },
  { id: 'comedor', label: 'Configurar comedor', icon: '🍽️', permiso: 'admin.config_comedor' },
  { id: 'planesComedor', label: 'Planes de comedor', icon: '🧾', permiso: 'admin.planes_comedor' },
  { id: 'calendario', label: 'Calendario / vacaciones', icon: '📅', permiso: 'admin.calendario_comedor' },
  { id: 'pagos', label: 'Pagos', icon: '💳', permiso: 'admin.pagos' },
  { id: 'cargasMasivas', label: 'Cargas masivas', icon: '📦', permiso: 'admin.cargas_masivas' },
  { id: 'retroactiva', label: 'Carga retroactiva', icon: '⏪', permiso: 'admin.carga_retroactiva' },
  { id: 'notificaciones', label: 'Notificaciones', icon: '✉️', permiso: 'admin.notificaciones' },
  { id: 'log', label: 'Bitácora (log)', icon: '🕵️', permiso: 'admin.log' },
]
