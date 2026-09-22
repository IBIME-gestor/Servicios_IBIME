// Configuración de Firebase.
// Los valores vienen de variables de entorno (ver .env.example) para que
// NUNCA subas tus llaves reales directo al repositorio de GitHub.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
export const db = getFirestore(app)

// Nota deliberada: NO usamos getStorage() de Firebase en ningún lado del
// proyecto. Los archivos (firmas, etc.) se suben a Google Drive mediante
// src/lib/googleDrive.js, para mantenernos 100% en el plan gratuito.
