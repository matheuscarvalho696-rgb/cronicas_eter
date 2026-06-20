// ========================================================
// CRÔNICAS DO ÉTER — CONFIGURAÇÃO FIREBASE
// ========================================================
// Cole aqui o firebaseConfig gerado em:
// Firebase Console > Configurações do Projeto > Geral > Seus apps > Web.
//
// IMPORTANTE: depois de preencher, faça git push para a Vercel publicar.

export const firebaseConfig = {
  apiKey: "COLE_SUA_API_KEY_AQUI",
  authDomain: "COLE_SEU_AUTH_DOMAIN_AQUI",
  projectId: "COLE_SEU_PROJECT_ID_AQUI",
  storageBucket: "COLE_SEU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "COLE_SEU_MESSAGING_SENDER_ID_AQUI",
  appId: "COLE_SEU_APP_ID_AQUI"
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes("COLE_") &&
    !firebaseConfig.projectId.includes("COLE_")
  );
}
