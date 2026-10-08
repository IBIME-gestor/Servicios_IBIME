const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL
const TIMEOUT_MS = 25000
const ESPERA_REINTENTO_MS = 1500

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(',')[1]) // quita el prefijo data:...;base64,
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/** Error con bandera `reintentable` (red / tiempo agotado / 5xx) vs. error de configuración (404, 403…). */
function errorDrive(mensaje, reintentable = false) {
  const e = new Error(mensaje)
  e.reintentable = reintentable
  return e
}

async function enviarUnaVez(cuerpo) {
  const controlador = new AbortController()
  const reloj = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  let res
  try {
    // Content-Type "text/plain" a propósito: así el navegador no manda un
    // preflight OPTIONS (que Apps Script no responde bien), y el Apps Script
    // igual lee el JSON del cuerpo de la petición sin problema.
    res = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: cuerpo,
      signal: controlador.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw errorDrive('Google Drive tardó demasiado en responder.', true)
    throw errorDrive('No hay conexión con Google Drive.', true)
  } finally {
    clearTimeout(reloj)
  }

  if (!res.ok) {
    // Nunca se muestra el HTML que devuelve Google: solo un mensaje claro.
    if (res.status === 404) {
      throw errorDrive('La URL del Apps Script no es válida o ya no existe (404). Revisa VITE_APPSCRIPT_URL y vuelve a implementar el script.')
    }
    if (res.status === 401 || res.status === 403) {
      throw errorDrive('El Apps Script no permite el acceso (¿está publicado con acceso para "Cualquier usuario"?).')
    }
    throw errorDrive(`Error subiendo a Drive (${res.status}).`, res.status >= 500)
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw errorDrive('El Apps Script no respondió lo esperado. Verifica que la URL termine en /exec y que esté publicado como aplicación web.')
  }
  if (!data.ok) throw errorDrive(data.error || 'El Apps Script devolvió un error.')
  return data
}

/**
 * Sube un archivo a la carpeta de Drive configurada en el Apps Script.
 * Reintenta una vez si falla por red o tiempo agotado (no reintenta errores de configuración).
 * @param {Blob} blob - contenido del archivo (ej. firma como PNG)
 * @param {string} filename - nombre a guardar, ej. "firma_juanperez_2026-09-14.png"
 * @param {string} mimeType
 * @returns {Promise<{id: string, webViewLink: string}>}
 */
export async function subirArchivoADrive(blob, filename, mimeType = 'image/png') {
  if (!APPSCRIPT_URL) {
    throw new Error('Falta configurar VITE_APPSCRIPT_URL en el archivo .env')
  }

  const dataBase64 = await blobABase64(blob)
  const cuerpo = JSON.stringify({ filename, mimeType, dataBase64 })

  try {
    const data = await enviarUnaVez(cuerpo)
    return { id: data.id, webViewLink: data.webViewLink }
  } catch (err) {
    if (!err.reintentable) throw err
    await esperar(ESPERA_REINTENTO_MS)
    const data = await enviarUnaVez(cuerpo)
    return { id: data.id, webViewLink: data.webViewLink }
  }
}
