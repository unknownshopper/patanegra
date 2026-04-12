import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ can report as Mac; touch points distinguishes it.
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)) &&
  !(window as any).MSStream

export const db = initializeFirestore(
  app,
  isIOS
    ? {
        experimentalForceLongPolling: true,
      }
    : {
        experimentalAutoDetectLongPolling: true,
      },
)
