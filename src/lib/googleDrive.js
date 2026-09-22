// Sube archivos (ej. firmas digitales en PNG) a una carpeta de Google Drive
// a través de un Google Apps Script publicado como "Web App" (ver
// /appscript/Code.gs). Esto evita: (a) usar Firebase Storage de pago, y
// (b) pedirle a cada cajera/nani que autorice permisos de Drive desde su
// propia cuenta — el Apps Script ya corre con permisos del colegio.

const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(',')[1]) // quita el prefijo data:...;base64,
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Sube un archivo a la carpeta de Drive configurada en el Apps Script.
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

  // Content-Type "text/plain" a propósito: así el navegador no manda un
  // preflight OPTIONS (que Apps Script no responde bien), y el Apps Script
  // igual lee el JSON del cuerpo de la petición sin problema.
  const res = await fetch(APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ filename, mimeType, dataBase64 }),
  })

  if (!res.ok) {
    throw new Error(`Error subiendo a Drive: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'El Apps Script devolvió un error.')
  return { id: data.id, webViewLink: data.webViewLink }
}
