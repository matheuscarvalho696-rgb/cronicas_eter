// ========================================================
// CRÔNICAS DO ÉTER — AUTENTICAÇÃO E PERFIL
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

export function isAuthConfigured() {
  return firebaseReady();
}

export function watchAuth(callback) {
  if (!firebaseReady()) {
    callback({ user: null, profile: null, configured: false });
    return () => {};
  }
  const { auth, db } = getFirebase();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null, configured: true });
      return;
    }
    const profile = await getUserProfile(user.uid);
    callback({ user, profile, configured: true });
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
  if (!snap.exists()) {
    return {
      inviteCode: "CRONICAS2026",
      familiarFree: true,
      maintenance: false,
      siteVersion: "1.0"
    };
  }
  return snap.data();
}

export async function registerWithInvite({ nome, email, senha, inviteCode }) {
  const settings = await getAccessSettings();
  const expected = String(settings.inviteCode || "").trim().toUpperCase();
  const provided = String(inviteCode || "").trim().toUpperCase();

  if (!expected || provided !== expected) {
    throw new Error("Código de acesso inválido.");
  }

  const { auth, db } = getFirebase();
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });

  const userRef = doc(db, "users", cred.user.uid);
  await setDoc(userRef, {
    nome,
    email,
    role: "player",
    status: "approved",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    account: {
      inviteCodeUsed: provided,
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
  });

  return cred.user;
}

export async function login(email, senha) {
  const { auth } = getFirebase();
  return signInWithEmailAndPassword(auth, email, senha);
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

export async function touchUser(uid) {
  const { db } = getFirebase();
  await updateDoc(doc(db, "users", uid), { updatedAt: serverTimestamp() });
}
