# IBIME — Sistema administrativo (Caja · Cafetería · Estancia)

App web (PWA) para el colegio IBIME. 100% gratuita: usa **Firestore** (no
Firebase Storage), inicio de sesión con **Google Workspace institucional**,
y **Google Apps Script + Drive** para guardar firmas/archivos.

**Se publica sola.** Cada vez que subes archivos a la rama `main` desde la
página de GitHub, un robot de GitHub Actions compila el proyecto y lo
publica en Firebase Hosting automáticamente — tú nunca abres una terminal
ni instalas nada en tu computadora. Solo hay que configurar esto una vez.

## 1. Habilitar Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto** → nómbralo (ej. `ibime-app`) → puedes desactivar Google Analytics → **Crear proyecto**.
2. Clic en el ícono **"</>"** (Web) para registrar la app → te muestra un bloque con `apiKey`, `authDomain`, `projectId`, etc. — **guárdalo, lo vas a necesitar en el paso 3**.
3. Menú lateral → **Compilación → Firestore Database → Crear base de datos** (modo producción, región más cercana).
4. Menú lateral → **Compilación → Authentication → Comenzar** → pestaña **Sign-in method** → habilita **Google**.
5. En esa misma pantalla, en "Dominios autorizados", agrega el dominio donde vas a publicar la app: será algo como `tu-proyecto.web.app` (lo confirmas en el paso 5 de más abajo, después de tu primer despliegue).

## 2. Publicar el Apps Script (para guardar firmas en Drive)

Todo el detalle está comentado dentro de `appscript/Code.gs`, en resumen:

1. Crea en Drive la carpeta donde se guardarán las firmas (ej. "IBIME - Firmas") y copia su ID (el texto largo de la URL después de `/folders/`).
2. Ve a [script.google.com](https://script.google.com) con tu cuenta institucional → **Nuevo proyecto**.
3. Borra el contenido de `Code.gs` y pega el contenido completo de `appscript/Code.gs` de este repo.
4. Reemplaza `ID_CARPETA_DRIVE` con el ID que copiaste.
5. **Implementar → Nueva implementación → tipo "Aplicación web"** → Ejecutar como **"Yo"** → Quién tiene acceso **"Cualquier usuario"**.
6. Autoriza los permisos de Drive que pida (son los de tu propia cuenta — por eso las cajeras/nani no necesitan autorizar nada individualmente).
7. Copia la **URL de la aplicación web** que te entrega — la vas a pegar como secreto en el paso 4.

## 3. Generar la llave que le da permiso a GitHub de publicar por ti

1. En Firebase, clic en el ⚙️ junto a "Descripción general del proyecto" → **Configuración del proyecto**.
2. Pestaña **Cuentas de servicio**.
3. Botón **Generar nueva clave privada** → confirma → se descarga un archivo `.json`. Ese archivo completo (ábrelo con el Bloc de notas si quieres verlo) es lo que vas a pegar como secreto `FIREBASE_SERVICE_ACCOUNT` en el paso 4.

## 4. Guardar todo como "Secrets" en GitHub

En tu repositorio de GitHub: **Settings → Secrets and variables → Actions → "New repository secret"**. Vas a crear uno por uno estos secretos (nombre exacto a la izquierda, valor real a la derecha):

| Nombre del secreto | De dónde sacas el valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | Del bloque de configuración del paso 1.2 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Del mismo bloque |
| `VITE_FIREBASE_PROJECT_ID` | Del mismo bloque |
| `VITE_FIREBASE_STORAGE_BUCKET` | Del mismo bloque |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Del mismo bloque |
| `VITE_FIREBASE_APP_ID` | Del mismo bloque |
| `VITE_WORKSPACE_DOMAIN` | Tu dominio institucional, ej. `colegioibime.edu.mx` |
| `VITE_ADMIN_EMAILS` | Tu correo (el que va a entrar como Administrador). Varios separados por coma. |
| `VITE_APPSCRIPT_URL` | La URL que copiaste en el paso 2.7 |
| `FIREBASE_PROJECT_ID` | El mismo `projectId` de arriba (sí, se repite, uno lo usa la app y otro el robot de publicación) |
| `FIREBASE_SERVICE_ACCOUNT` | Todo el contenido del archivo `.json` que descargaste en el paso 3 — ábrelo, selecciona todo, copia y pega completo |

No necesitas crear un archivo `.env` en ningún lado — estos secretos hacen ese trabajo, pero de forma segura (nadie más los puede ver, ni siquiera tú una vez guardados).

## 5. Subir el proyecto a GitHub (esto ya dispara la publicación sola)

Ve a tu repositorio → **Add file → Upload files** → arrastra TODAS las carpetas y archivos del proyecto (incluida la carpeta `.github`, que trae oculto el punto pero se sube igual) → **Commit changes** directo en `main`.

En cuanto le des "Commit", ve a la pestaña **Actions** de tu repositorio: vas a ver un proceso corriendo ("Publicar IBIME en Firebase") con un círculo amarillo girando. Espera 2-3 minutos — cuando se ponga ✅ verde, ya está publicado. Si se pone ❌ rojo, entra y lee el mensaje de error (casi siempre es un secreto mal copiado).

Tu URL final la ves en Firebase → menú lateral **Compilación → Hosting**: ahí aparece el dominio, algo como `https://ibime-app-xxxxx.web.app`.

## 6. Iniciar sesión como administrador

Abre esa URL e inicia sesión con tu cuenta de Google institucional (la que pusiste en `VITE_ADMIN_EMAILS`) — entras automáticamente como Administrador, sin pasos manuales en Firestore. Cualquier otra persona que inicie sesión por primera vez te va a aparecer en Administración → Usuarios y permisos como Colaborador, para que le actives lo que le corresponda.

Instalar como app en el celular: abre esa URL en Chrome/Safari → "Agregar a pantalla de inicio". El ícono y nombre ya están tomados del logo del colegio.

## Cada vez que quieras actualizar la app

Solo repites el paso 5: subes los archivos que cambiaron a GitHub (Add file → Upload files → Commit). La publicación es automática, no hay que hacer nada más.

## Qué ya está construido

- **Login con Google**, restringido a tu dominio institucional de Workspace.
- **Permisos granulares, no roles fijos**: quien inicia sesión por primera vez con un correo de `VITE_ADMIN_EMAILS` entra como Administrador automáticamente; cualquier otro entra como Colaborador (solo ve el directorio de alumnos/grupos). Desde Administración → Usuarios y permisos, tú marcas casilla por casilla qué módulos y acciones tiene activos cada quien (ver cafetería, registrar cafetería, ver estancia, registrar estancia, ver caja, cada pestaña de Administración por separado).
- **Alumnos**: directorio de solo lectura (nombre, matrícula, grado, grupo) — lo que ve un Colaborador sin más permisos.
- **Cafetería**: búsqueda de alumno, registro de desayuno/comida, resumen concreto por alumno de la semana (avisa si va 3+ veces).
- **Estancia**: registrar llegada, lista de alumnos activos, retiro con nombre de quien recoge, firma digital (sube a Drive vía Apps Script) y cálculo automático del costo en MXN (gracia + tarifa por fracción o por minuto, editable).
- **Caja**: concentrado semanal por alumno de cafetería + estancia, para hacer el cobro.
- **Administración**: editor de permisos por persona, importador de Excel con mapeo de columnas, configuración de tarifas de estancia.
- **PWA**: instalable, ícono del colegio, modo claro/oscuro, responsivo.
- **Publicación automática** vía GitHub Actions cada vez que subes cambios — sin terminal, sin instalar nada.

## Pendiente / próximos pasos sugeridos

- **Precios de cafetería**: falta el costo por desayuno/comida para sumarlos al total de Caja (por ahora solo se cuenta cuántos consumos hubo).
- **Reporte imprimible / exportable** del concentrado semanal de Caja (PDF o Excel), si lo necesitan para archivo físico.
- Endurecer más las reglas de Firestore conforme se defina con más detalle qué puede hacer cada rol.

## Si alguna vez SÍ quieres usar la terminal (opcional, no es necesario)

Para probarlo en tu computadora antes de publicar: `npm install`, copia `.env.example` a `.env` y llénalo con los mismos valores de la tabla de arriba, y corre `npm run dev`. Para publicar a mano en vez de esperar a GitHub Actions: `npm run deploy` (requiere `firebase login` y `firebase use --add` una vez). Ninguno de estos pasos es necesario si sigues la guía de arriba.
