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
  deleteDoc,
  serverTimestamp,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  limit
} from "./firebase-app.js";

// Conta bootstrap: sempre poderá recuperar acesso admin.
export const BOOTSTRAP_ADMIN_EMAILS = ["matheuscarvalho696@gmail.com"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
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
    siteVersion: "1.0",
    registrationMode: "invite"
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
      inviteCodeUsed: normalizeCode(inviteCodeUsed),
      bootstrapAdmin: isBootstrapAdmin,
      acceptedTerms: true,
      loginCount: 1
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
      theme: "default",
      receiveUpdates: true
    }
  };
}

export async function createLog(action, details = {}) {
  try {
    const { db, auth } = getFirebase();
    await addDoc(collection(db, "logs"), {
      action,
      details,
      actorUid: auth.currentUser?.uid || null,
      actorEmail: normalizeEmail(auth.currentUser?.email || ""),
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Log não registrado:", err);
  }
}

async function createProfileIfMissing(user, nome = "", inviteCodeUsed = "") {
  const { db } = getFirebase();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const initial = buildInitialProfile(user, nome, inviteCodeUsed);
    await setDoc(ref, initial);
    await createLog("user.created", { uid: user.uid, email: initial.email, role: initial.role });
    return { uid: user.uid, ...initial };
  }

  const current = { uid: user.uid, ...snap.data() };
  const email = normalizeEmail(user.email || current.email);

  // Garante que a conta bootstrap do Matheus sempre consiga recuperar admin.
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
    await createLog("admin.bootstrap_recovered", { uid: user.uid, email });
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

export async function updateOwnProfile(uid, updates) {
  const { db, auth } = getFirebase();
  if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Você só pode editar seu próprio perfil.");
  const nome = String(updates.nome || "").trim();
  if (!nome) throw new Error("Informe um nome válido.");
  await updateProfile(auth.currentUser, { displayName: nome }).catch(() => {});
  await updateDoc(doc(db, "users", uid), {
    nome,
    "settings.receiveUpdates": Boolean(updates.receiveUpdates),
    updatedAt: serverTimestamp()
  });
  await createLog("user.profile_updated", { uid });
}

export async function getAccessSettings() {
  const { db } = getFirebase();
  const ref = doc(db, "settings", "access");
  const snap = await getDoc(ref);
  if (!snap.exists()) return defaultAccessSettings();
  return { ...defaultAccessSettings(), ...snap.data() };
}

async function validateInviteCode(code) {
  const provided = normalizeCode(code);
  if (!provided) throw new Error("Informe o código de acesso.");

  const { db } = getFirebase();
  const settings = await getAccessSettings();
  const expected = normalizeCode(settings.inviteCode);

  if (expected && provided === expected) {
    return { type: "global", code: provided };
  }

  // Código individual gerado no painel admin. O ID do documento é o próprio código.
  const inviteRef = doc(db, "inviteCodes", provided);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error("Código de acesso inválido. Peça um código atualizado ao mestre.");

  const invite = inviteSnap.data();
  if (invite.status !== "active") throw new Error("Esse código já foi utilizado ou foi desativado.");

  return { type: "individual", code: provided, ref: inviteRef, data: invite };
}

export async function registerWithInvite({ nome, email, senha, inviteCode }) {
  const invite = await validateInviteCode(inviteCode);
  const { auth } = getFirebase();
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });
  await createProfileIfMissing(cred.user, nome, invite.code);

  if (invite.type === "individual" && invite.ref) {
    await updateDoc(invite.ref, {
      status: "used",
      usedBy: cred.user.uid,
      usedByEmail: normalizeEmail(cred.user.email),
      usedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(() => {});
  }

  await createLog("auth.register", { uid: cred.user.uid, email: normalizeEmail(email), inviteType: invite.type });
  return cred.user;
}

export async function login(email, senha) {
  const { auth } = getFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  await createProfileIfMissing(cred.user);
  await createLog("auth.login", { uid: cred.user.uid, email: normalizeEmail(email) });
  return cred;
}

export async function resetPassword(email) {
  const { auth } = getFirebase();
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  const { auth } = getFirebase();
  await createLog("auth.logout", { uid: auth.currentUser?.uid || null });
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

export async function updateAccessSettings(settings) {
  const { db } = getFirebase();
  await updateDoc(doc(db, "settings", "access"), {
    inviteCode: normalizeCode(settings.inviteCode || "CRONICAS2026"),
    familiarFree: settings.familiarFree !== false,
    maintenance: Boolean(settings.maintenance),
    siteVersion: String(settings.siteVersion || "1.0"),
    updatedAt: serverTimestamp()
  });
  await createLog("admin.settings_updated", { inviteCodeChanged: true });
}

export async function listUsers() {
  const { db } = getFirebase();
  const q = query(collection(db, "users"), orderBy("email"));
  const snap = await getDocs(q);
  const users = [];
  snap.forEach(docSnap => users.push({ uid: docSnap.id, ...docSnap.data() }));
  return users;
}

export async function adminUpdateUser(uid, updates) {
  const { db } = getFirebase();
  const clean = { updatedAt: serverTimestamp() };
  if (updates.role) clean.role = updates.role;
  if (updates.status) clean.status = updates.status;
  if (typeof updates.premium === "boolean") clean.premium = updates.premium;
  await updateDoc(doc(db, "users", uid), clean);
  await createLog("admin.user_updated", { uid, updates });
}

export async function adminCreateInviteCode(code = "") {
  const { db, auth } = getFirebase();
  const finalCode = normalizeCode(code || makeInviteCode());
  await setDoc(doc(db, "inviteCodes", finalCode), {
    code: finalCode,
    status: "active",
    createdBy: auth.currentUser?.uid || null,
    createdByEmail: normalizeEmail(auth.currentUser?.email || ""),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await createLog("admin.invite_created", { code: finalCode });
  return finalCode;
}

export async function adminDisableInviteCode(code) {
  const { db } = getFirebase();
  const finalCode = normalizeCode(code);
  await updateDoc(doc(db, "inviteCodes", finalCode), { status: "disabled", updatedAt: serverTimestamp() });
  await createLog("admin.invite_disabled", { code: finalCode });
}

export async function listInviteCodes() {
  const { db } = getFirebase();
  const q = query(collection(db, "inviteCodes"), orderBy("createdAt"));
  const snap = await getDocs(q);
  const codes = [];
  snap.forEach(docSnap => codes.push({ id: docSnap.id, ...docSnap.data() }));
  return codes.reverse();
}

export async function listLogs(max = 25) {
  const { db } = getFirebase();
  const q = query(collection(db, "logs"), orderBy("createdAt"), limit(max));
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() }));
  return logs.reverse();
}

export async function getDashboardStats() {
  const users = await listUsers();
  return {
    totalUsers: users.length,
    admins: users.filter(u => u.role === "admin").length,
    masters: users.filter(u => u.role === "master").length,
    players: users.filter(u => u.role === "player").length,
    blocked: users.filter(u => u.status === "blocked").length,
    pending: users.filter(u => u.status === "pending").length,
    approved: users.filter(u => u.status === "approved").length,
    premium: users.filter(u => u.premium === true).length
  };
}

export function makeInviteCode(){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ETER-";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
