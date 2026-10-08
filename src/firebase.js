import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Caché local persistente: la app puede leer datos ya vistos y encolar
// escrituras (registrar un consumo, marcar un pago, etc.) aunque se caiga
// el internet del plantel — en cuanto vuelve la conexión, Firestore
// sincroniza solo, sin que nadie tenga que hacer nada.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // En redes con proxy/firewall (típico de escuelas) el canal en tiempo real de
  // Firestore falla con errores 400; con esto cambia solo a un método compatible.
  experimentalAutoDetectLongPolling: true,
})

// Nota deliberada: NO usamos getStorage() de Firebase en ningún lado del
// proyecto. Los archivos (firmas, etc.) se suben a Google Drive mediante
// src/lib/googleDrive.js, para mantenernos 100% en el plan gratuito.
