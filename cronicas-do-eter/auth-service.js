// ========================================================
// CRÔNICAS DO ÉTER — AUTENTICAÇÃO, PERFIL E PERMISSÕES
// ========================================================
import {
  firebaseReady,
  getFirebase,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "./firebase-app.js";

// Primeiro administrador do projeto. Essa conta sempre será reconhecida como Admin.
// Se você trocar de e-mail no futuro, altere aqui e também em firebase-rules.txt.
export const BOOTSTRAP_ADMIN_EMAILS = ["matheuscarvalho696@gmail.com"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isBootstrapAdminEmail(email) {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email));
}

export function isAuthConfigured() {
  return firebaseReady();
}

function defaultAccessSettings() {
  return {
    inviteCode: "CRONICAS2026",
    familiarFree: true,
    maintenance: false,
    siteVersion: "1.0"
  };
}

function buildInitialProfile(user, nome = "", inviteCodeUsed = "") {
  const email = normalizeEmail(user.email);
  const isBootstrapAdmin = isBootstrapAdminEmail(email);

  return {
    nome: nome || user.displayName || email,
    email,
    role: isBootstrapAdmin ? "admin" : "player",
    status: "approved",
    premium: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    account: {
      inviteCodeUsed: String(inviteCodeUsed || "").trim().toUpperCase(),
      bootstrapAdmin: isBootstrapAdmin,
      acceptedTerms: true
    },
    character: {
      hasCharacter: false,
      nome: "",
      raca: "",
      variante: "",
      classe: "",
      especializacao: "",
      xpAtual: 0,
      ptAtual: 0,
      atributos: {},
      focos: {},
      vitalidades: {},
      proficiencias: []
    },
    inventory: {
      moedas: { pc: 0, pp: 0, pa: 0, po: 0 },
      itens: []
    },
    familiar: {
      hasFamiliar: false,
      nome: "",
      raca: "",
      tipo: "",
      elemento: "",
      ranque: "B",
      habilidades: []
    },
    calculator: {
      lastValidation: null,
      history: []
    },
    settings: {
      theme: "default"
    }
  };
}

async function createProfileIfMissing(user, nome = "", inviteCodeUsed = "") {
  const { db } = getFirebase();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const initial = buildInitialProfile(user, nome, inviteCodeUsed);
    await setDoc(ref, initial);
    return { uid: user.uid, ...initial };
  }

  const current = { uid: user.uid, ...snap.data() };
  const email = normalizeEmail(user.email || current.email);

  // Garante que a conta principal do Matheus sempre consiga recuperar admin.
  if (isBootstrapAdminEmail(email) && (current.role !== "admin" || current.status !== "approved")) {
    await updateDoc(ref, {
      email,
      role: "admin",
      status: "approved",
      premium: true,
      "account.bootstrapAdmin": true,
      updatedAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    });
    return { ...current, email, role: "admin", status: "approved", premium: true, account: { ...(current.account || {}), bootstrapAdmin: true } };
  }

  await updateDoc(ref, { lastLogin: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
  return current;
}

export function watchAuth(callback) {
  if (!firebaseReady()) {
    callback({ user: null, profile: null, configured: false });
    return () => {};
  }

  const { auth } = getFirebase();
  return onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        callback({ user: null, profile: null, configured: true });
        return;
      }
      const profile = await createProfileIfMissing(user);
      callback({ user, profile, configured: true });
    } catch (err) {
      console.error("Erro ao carregar perfil:", err);
      callback({ user, profile: null, configured: true, error: err });
    }
  });
}

export async function getUserProfile(uid) {
  const { db } = getFirebase();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function getAccessSettings() {
  const { db } = getFirebase();
  const ref = doc(db, "settings", "access");
  const snap = await getDoc(ref);
  if (!snap.exists()) return defaultAccessSettings();
  return { ...defaultAccessSettings(), ...snap.data() };
}

export async function registerWithInvite({ nome, email, senha, inviteCode }) {
  const settings = await getAccessSettings();
  const expected = String(settings.inviteCode || "").trim().toUpperCase();
  const provided = String(inviteCode || "").trim().toUpperCase();

  if (!expected || provided !== expected) {
    throw new Error("Código de acesso inválido. Peça um código atualizado ao mestre.");
  }

  const { auth } = getFirebase();
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });
  await createProfileIfMissing(cred.user, nome, provided);
  return cred.user;
}

export async function login(email, senha) {
  const { auth } = getFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  await createProfileIfMissing(cred.user);
  return cred;
}

export async function resetPassword(email) {
  const { auth } = getFirebase();
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  const { auth } = getFirebase();
  return signOut(auth);
}

export function hasApprovedAccess(profile) {
  return Boolean(profile && profile.status === "approved" && ["player", "master", "admin"].includes(profile.role));
}

export function isAdmin(profile) {
  return Boolean(profile && profile.status === "approved" && profile.role === "admin");
}

export function isMasterOrAdmin(profile) {
  return Boolean(profile && profile.status === "approved" && ["master", "admin"].includes(profile.role));
}

export async function touchUser(uid) {
  const { db } = getFirebase();
  await updateDoc(doc(db, "users", uid), { updatedAt: serverTimestamp() });
}
