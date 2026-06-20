// ========================================================
// CRÔNICAS DO ÉTER — CONFIGURAÇÃO FIREBASE
// ========================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAY-AbYJZQ0HKyQLkeggFQJCOZV_wzBNZc",
  authDomain: "cronicas-do-eter.firebaseapp.com",
  projectId: "cronicas-do-eter",
  storageBucket: "cronicas-do-eter.firebasestorage.app",
  messagingSenderId: "348712885356",
  appId: "1:348712885356:web:94fb7329b6fd9e38bf8c49",
  measurementId: "G-2HBB7932QQ"
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes("COLE_") &&
    !firebaseConfig.projectId.includes("COLE_")
  );
}
