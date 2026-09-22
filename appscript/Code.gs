/**
 * IBIME — Receptor de archivos para Google Drive.
 *
 * QUÉ HACE: recibe (por POST) un archivo en base64 desde la app web y lo
 * guarda en una carpeta fija de Drive. Se usa para las firmas digitales de
 * estancia, así evitamos Firebase Storage (que es de paga) y evitamos que
 * cada cajera/nani tenga que autorizar permisos de Drive desde su cuenta:
 * el script corre con los permisos de quien lo publique (tú, el admin).
 *
 * CÓMO PUBLICARLO (una sola vez):
 *   1. Ve a https://script.google.com/ (con tu cuenta institucional) → Nuevo proyecto.
 *   2. Borra el contenido de Code.gs y pega TODO este archivo.
 *   3. Cambia la constante ID_CARPETA_DRIVE de abajo por el ID de tu carpeta
 *      de Drive (el texto largo que aparece en la URL después de /folders/).
 *   4. Arriba a la derecha: "Implementar" → "Nueva implementación".
 *   5. Tipo: "Aplicación web". Ejecutar como: "Yo (tu correo)".
 *      Quién tiene acceso: "Cualquier usuario" (así la app puede llamarlo
 *      sin que cada usuaria tenga que iniciar sesión de Google otra vez).
 *   6. Autoriza los permisos que pida (acceso a Drive de tu propia cuenta).
 *   7. Copia la URL que te da ("URL de la aplicación web") y pégala en el
 *      .env del proyecto como VITE_APPSCRIPT_URL.
 *
 * Si más adelante cambias el código, tienes que hacer "Nueva implementación"
 * otra vez (o "Administrar implementaciones" → editar → nueva versión) para
 * que los cambios se reflejen en la URL publicada.
 */

const ID_CARPETA_DRIVE = 'PEGA_AQUI_EL_ID_DE_TU_CARPETA_DE_DRIVE'

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    const { filename, mimeType, dataBase64 } = body

    if (!filename || !dataBase64) {
      return respuesta({ ok: false, error: 'Falta filename o dataBase64.' })
    }

    const carpeta = DriveApp.getFolderById(ID_CARPETA_DRIVE)
    const bytes = Utilities.base64Decode(dataBase64)
    const blob = Utilities.newBlob(bytes, mimeType || 'image/png', filename)
    const archivo = carpeta.createFile(blob)

    return respuesta({
      ok: true,
      id: archivo.getId(),
      webViewLink: archivo.getUrl(),
    })
  } catch (err) {
    return respuesta({ ok: false, error: String(err) })
  }
}

function respuesta(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON)
}
