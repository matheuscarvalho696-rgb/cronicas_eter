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
  deleteUser,
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
  limit,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
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
    status: isBootstrapAdmin ? "approved" : "pending_email",
    premium: isBootstrapAdmin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    account: {
      inviteCodeUsed: normalizeCode(inviteCodeUsed),
      bootstrapAdmin: isBootstrapAdmin,
      emailCodeRequired: !isBootstrapAdmin,
      emailVerifiedByCode: isBootstrapAdmin,
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

function buildPendingProfile(user, nome = "") {
  const base = buildInitialProfile(user, nome, "EMAIL-CODE");
  const isBootstrapAdmin = isBootstrapAdminEmail(user.email);
  return {
    ...base,
    role: isBootstrapAdmin ? "admin" : "player",
    status: isBootstrapAdmin ? "approved" : "pending_email",
    premium: isBootstrapAdmin,
    account: {
      ...(base.account || {}),
      emailCodeRequired: !isBootstrapAdmin,
      emailVerifiedByCode: isBootstrapAdmin,
      bootstrapAdmin: isBootstrapAdmin
    }
  };
}

function makeEmailVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createEmailVerificationForUser(user, nome = "") {
  const { db } = getFirebase();
  const code = makeEmailVerificationCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await setDoc(doc(db, "emailVerifications", user.uid), {
    uid: user.uid,
    userId: user.uid,
    email: normalizeEmail(user.email || ""),
    nome: String(nome || user.displayName || "Jogador").trim(),
    code,
    status: "pending",
    attempts: 0,
    expiresAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { code, expiresAt };
}

export async function registerWithEmailCode({ nome, email, senha }) {
  const cleanName = String(nome || "").trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) throw new Error("Informe o nome do jogador.");
  if (!cleanEmail) throw new Error("Informe um e-mail válido.");

  const { auth, db } = getFirebase();
  const isBootstrapAdmin = isBootstrapAdminEmail(cleanEmail);

  // A conta bootstrap do administrador não precisa de validação por e-mail.
  if (isBootstrapAdmin) {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, senha);
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
    const profile = buildPendingProfile(cred.user, cleanName);
    await setDoc(doc(db, "users", cred.user.uid), profile);
    await createLog("auth.register.bootstrap_admin", { uid: cred.user.uid, email: cleanEmail });
    return { user: cred.user, requiresCode: false };
  }

  // Primeiro envia o e-mail. Só depois cria a conta.
  // Assim, se o EmailJS falhar, nenhum usuário fica criado/solto no Firebase.
  const code = makeEmailVerificationCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await sendInviteEmailViaEmailJS({ email: cleanEmail, nome: cleanName, code });

  let cred = null;
  try {
    cred = await createUserWithEmailAndPassword(auth, cleanEmail, senha);
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});

    const profile = buildPendingProfile(cred.user, cleanName);
    await setDoc(doc(db, "users", cred.user.uid), profile);

    await setDoc(doc(db, "emailVerifications", cred.user.uid), {
      uid: cred.user.uid,
      userId: cred.user.uid,
      email: cleanEmail,
      nome: cleanName,
      code,
      status: "pending",
      attempts: 0,
      expiresAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await createLog("auth.email_code_sent", { uid: cred.user.uid, email: cleanEmail });
    return { user: cred.user, requiresCode: true, expiresAt };
  } catch (err) {
    if (cred?.user) {
      await deleteUser(cred.user).catch(() => {});
    }
    throw err;
  }
}

export async function resendEmailVerificationCode() {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Crie a conta ou entre antes de reenviar o código.");
  const profile = await getUserProfile(user.uid);
  if (profile?.status === "approved") throw new Error("Esta conta já está aprovada.");
  const nome = profile?.nome || user.displayName || "Jogador";
  const verification = await createEmailVerificationForUser(user, nome);
  await sendInviteEmailViaEmailJS({ email: user.email, nome, code: verification.code });
  await createLog("auth.email_code_resent", { uid: user.uid, email: normalizeEmail(user.email || "") });
  return verification;
}

export async function verifyRegistrationCode(code) {
  const { auth, db } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Crie a conta ou entre antes de validar o código.");
  const provided = String(code || "").trim();
  if (!provided) throw new Error("Digite o código recebido por e-mail.");

  const ref = doc(db, "emailVerifications", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Nenhum código foi encontrado para esta conta. Peça um novo código.");
  const data = snap.data();
  if (data.status === "verified") throw new Error("Este código já foi validado.");
  if (data.expiresAt && Date.now() > Date.parse(data.expiresAt)) {
    await updateDoc(ref, { status: "expired", updatedAt: serverTimestamp() }).catch(() => {});
    throw new Error("Este código expirou. Peça um novo código.");
  }
  if (Number(data.attempts || 0) >= 5) throw new Error("Muitas tentativas incorretas. Peça um novo código.");
  if (String(data.code || "").trim() !== provided) {
    await updateDoc(ref, { attempts: Number(data.attempts || 0) + 1, updatedAt: serverTimestamp() }).catch(() => {});
    throw new Error("Código incorreto.");
  }

  await updateDoc(ref, { status: "verified", verifiedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await updateDoc(doc(db, "users", user.uid), {
    status: "approved",
    premium: true,
    "account.emailVerifiedByCode": true,
    "account.emailCodeRequired": false,
    updatedAt: serverTimestamp()
  });
  await createLog("auth.email_code_verified", { uid: user.uid, email: normalizeEmail(user.email || "") });
  return true;
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


// ========================================================
// PERSONAGENS, DISTRIBUIÇÕES E FAMILIARES SALVOS
// ========================================================
function requireCurrentUser() {
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error("Você precisa estar logado para salvar.");
  return auth.currentUser;
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

export async function saveCharacter(character) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const payload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    nome: cleanText(character.nome, "Personagem sem nome"),
    raca: cleanText(character.raca),
    variante: cleanText(character.variante),
    classe: cleanText(character.classe),
    subclasse: cleanText(character.subclasse),
    especializacao: cleanText(character.especializacao),
    elementoNatural: cleanText(character.elementoNatural),
    rankInicial: cleanText(character.rankInicial, "D"),
    talentos: Array.isArray(character.talentos) ? character.talentos : [],
    distribuicaoInicial: character.distribuicaoInicial || {},
    pontosDistribuicaoDireta: character.pontosDistribuicaoDireta || {},
    simulacao: character.simulacao || {},
    equipamentosSimulados: character.equipamentosSimulados || {},
    resumo: character.resumo || {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "characters"), payload);
  await updateDoc(doc(db, "users", user.uid), {
    "character.hasCharacter": true,
    "character.nome": payload.nome,
    "character.raca": payload.raca,
    "character.variante": payload.variante,
    "character.classe": payload.classe,
    "character.especializacao": payload.especializacao,
    "character.elementoNatural": payload.elementoNatural,
    updatedAt: serverTimestamp()
  }).catch(()=>{});
  await createLog("character.created", { characterId: ref.id, nome: payload.nome });
  return ref.id;
}

export async function listMyCharacters() {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const q = query(collection(db, "characters"), where("ownerUid", "==", user.uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}


export async function updateCharacter(characterId, patch = {}) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  if (!characterId) throw new Error("Personagem inválido.");
  const ref = doc(db, "characters", characterId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Personagem não encontrado.");
  const data = snap.data();
  if (data.ownerUid !== user.uid) {
    throw new Error("Você só pode editar seus próprios personagens.");
  }
  const safePatch = {
    ...patch,
    updatedAt: serverTimestamp()
  };
  delete safePatch.id;
  delete safePatch.ownerUid;
  delete safePatch.ownerEmail;
  delete safePatch.createdAt;
  await updateDoc(ref, safePatch);
  await createLog("character.updated", { characterId, nome: patch.nome || data.nome || "" });
}

export async function saveDistribution(distribution) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const payload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    title: cleanText(distribution.title, "Distribuição XP/PT"),
    xpSpent: Number(distribution.xpSpent || 0),
    ptSpent: Number(distribution.ptSpent || 0),
    xpLeft: cleanText(distribution.xpLeft),
    ptLeft: cleanText(distribution.ptLeft),
    lines: Array.isArray(distribution.lines) ? distribution.lines : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (distribution.linkedCharacterId) {
    payload.linkedCharacterId = cleanText(distribution.linkedCharacterId);
  }
  const ref = await addDoc(collection(db, "distributions"), payload);
  await updateDoc(doc(db, "users", user.uid), {
    "calculator.lastValidation": serverTimestamp(),
    updatedAt: serverTimestamp()
  }).catch(()=>{});
  if (distribution.linkedCharacterId && distribution.characterUpdate) {
    try {
      await updateCharacter(distribution.linkedCharacterId, {
        ...distribution.characterUpdate,
        "calculator.lastDistributionId": ref.id,
        "calculator.lastValidation": serverTimestamp()
      });
    } catch (err) {
      console.warn("Não foi possível atualizar o personagem vinculado:", err);
    }
  }
  await createLog("distribution.saved", { distributionId: ref.id, xpSpent: payload.xpSpent, ptSpent: payload.ptSpent, linkedCharacterId: payload.linkedCharacterId || "" });
  return ref.id;
}

export async function listMyDistributions() {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const q = query(collection(db, "distributions"), where("ownerUid", "==", user.uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function saveFamiliar(familiar) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const payload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    nome: cleanText(familiar.nome, "Familiar sem nome"),
    especie: cleanText(familiar.especie),
    funcao: cleanText(familiar.funcao),
    elemento: cleanText(familiar.elemento),
    ranque: cleanText(familiar.ranque, "B"),
    natureza: cleanText(familiar.natureza),
    danoPrincipal: cleanText(familiar.danoPrincipal),
    danoSecundario: cleanText(familiar.danoSecundario),
    habilidadeGeradaHTML: cleanText(familiar.habilidadeGeradaHTML),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "familiars"), payload);
  await updateDoc(doc(db, "users", user.uid), {
    "familiar.hasFamiliar": true,
    "familiar.nome": payload.nome,
    "familiar.raca": payload.especie,
    "familiar.tipo": payload.funcao,
    "familiar.elemento": payload.elemento,
    "familiar.ranque": payload.ranque,
    updatedAt: serverTimestamp()
  }).catch(()=>{});
  await createLog("familiar.saved", { familiarId: ref.id, nome: payload.nome });
  return ref.id;
}

export async function listMyFamiliars() {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const q = query(collection(db, "familiars"), where("ownerUid", "==", user.uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function deleteCharacter(characterId) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  if (!characterId) throw new Error("Personagem inválido.");
  const ref = doc(db, "characters", characterId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Personagem não encontrado.");
  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("Você só pode deletar seus próprios personagens.");
  await deleteDoc(ref);
  await createLog("character.deleted", { characterId, nome: data.nome || "" });
}

export async function deleteFamiliar(familiarId) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  if (!familiarId) throw new Error("Familiar inválido.");
  const ref = doc(db, "familiars", familiarId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Familiar não encontrado.");
  const data = snap.data();
  if (data.ownerUid !== user.uid) throw new Error("Você só pode deletar seus próprios familiares.");
  await deleteDoc(ref);
  await createLog("familiar.deleted", { familiarId, nome: data.nome || "" });
}



// ========================================================
// MESAS ROLL20 — LINKS E IMPORTAÇÕES SELETIVAS
// ========================================================

async function requireAdminUser() {
  const user = requireCurrentUser();
  const profile = await getUserProfile(user.uid);
  if (!profile || profile.status !== "approved" || !["admin", "master"].includes(profile.role)) {
    throw new Error("Somente Admin ou Mestre pode alterar esta área.");
  }
  return user;
}

function cleanUrl(value) {
  const url = cleanText(value);
  if (!url) return "";
  return url;
}

function cleanRoll20Image(value) {
  return cleanText(value).slice(0, 2000);
}

function normalizeRoll20Category(value) {
  const allowed = ["Personagens", "MOB", "NPC", "Místicos", "Folheto"];
  const cleaned = cleanText(value, "NPC");
  const mapped = cleaned === "Jogadores" ? "Personagens" : cleaned;
  return allowed.includes(mapped) ? mapped : "NPC";
}

function sortRoll20ByName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
}

function normalizeRoll20Items(items, kind) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    kind,
    sourceId: cleanText(item.id || item.sourceId || item.roll20Id || `${kind}-${Date.now()}-${index}`),
    name: cleanText(item.name || item.nome || item.title || item.titulo, kind === "character" ? "Personagem sem nome" : "Folheto sem título"),
    bio: cleanText(item.bioText || item.bio || item.bioHtml || item.biografia || item.notesText || item.notesHtml || item.gmnotes || item.content || item.conteudo || item.notes),
    imageUrl: cleanRoll20Image(item.imageUrl || item.avatar || item.imgsrc || item.image || item.imagem),
    category: normalizeRoll20Category(item.category || item.categoria),
    tags: Array.isArray(item.tags) ? item.tags.map(cleanText).filter(Boolean) : [],
    visible: item.visible !== false,
    raw: item.raw || {}
  })).filter(item => item.name || item.bio || item.imageUrl).sort(sortRoll20ByName);
}

export async function saveRoll20Table(table) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  const payload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    name: cleanText(table.name, "Mesa sem nome"),
    roll20Url: cleanUrl(table.roll20Url),
    campaignId: cleanText(table.campaignId || table.roll20Id),
    notes: cleanText(table.notes),
    status: cleanText(table.status, "active"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "roll20Tables"), payload);
  await createLog("roll20.table_saved", { tableId: ref.id, name: payload.name });
  return ref.id;
}

export async function listMyRoll20Tables() {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const q = query(collection(db, "roll20Tables"), where("ownerUid", "==", user.uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function listRoll20TablesForViewer() {
  const { db } = getFirebase();
  requireCurrentUser();
  const snap = await getDocs(collection(db, "roll20Tables"));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function deleteRoll20Table(tableId) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  if (!tableId) throw new Error("Mesa inválida.");
  const ref = doc(db, "roll20Tables", tableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Mesa não encontrada.");
  const data = snap.data();
  // Admin pode remover qualquer mesa; Mestre só remove as próprias mesas.
  const profile = await getUserProfile(user.uid);
  if (profile?.role !== "admin" && data.ownerUid !== user.uid) throw new Error("Você só pode deletar suas próprias mesas.");
  await deleteDoc(ref);
  await createLog("roll20.table_deleted", { tableId, name: data.name || "" });
}

async function findExistingRoll20Import({ tableId, kind, sourceId }) {
  const { db } = getFirebase();
  const q = query(collection(db, "roll20Imports"), where("sourceId", "==", cleanText(sourceId)));
  const snap = await getDocs(q);
  let found = null;
  snap.forEach(d => {
    const data = d.data();
    if (!found && cleanText(data.tableId) === cleanText(tableId) && cleanText(data.kind) === cleanText(kind)) {
      found = { id: d.id, ...data };
    }
  });
  return found;
}

async function syncClaimedCharacterFromImport(importId, itemData) {
  const { db } = getFirebase();
  if (!itemData || !itemData.claimedCharacterId) return;
  const charRef = doc(db, "characters", itemData.claimedCharacterId);
  const charSnap = await getDoc(charRef).catch(() => null);
  if (!charSnap || !charSnap.exists()) return;
  await updateDoc(charRef, {
    nome: cleanText(itemData.name, "Personagem Roll20"),
    roll20Bio: cleanText(itemData.bio),
    roll20ImageUrl: cleanRoll20Image(itemData.imageUrl),
    resumo: {
      ...(charSnap.data().resumo || {}),
      dica: cleanText(itemData.bio).slice(0, 500)
    },
    updatedAt: serverTimestamp()
  });
}

export async function importRoll20Selection({ tableId, campaignId, characters = [], handouts = [] }) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  const normalizedCharacters = normalizeRoll20Items(characters, "character");
  const normalizedHandouts = normalizeRoll20Items(handouts, "handout");
  const allItems = [...normalizedCharacters, ...normalizedHandouts];
  if (!allItems.length) throw new Error("Selecione pelo menos um personagem ou folheto para importar.");

  const savedIds = [];
  let created = 0;
  let updated = 0;
  for (const item of allItems) {
    const payload = {
      ownerUid: user.uid,
      ownerEmail: normalizeEmail(user.email || ""),
      tableId: cleanText(tableId),
      campaignId: cleanText(campaignId),
      kind: item.kind,
      sourceId: item.sourceId,
      name: item.name,
      bio: item.bio,
      imageUrl: item.imageUrl,
      category: item.category,
      tags: item.tags,
      visible: item.visible,
      updatedAt: serverTimestamp()
    };

    const existing = await findExistingRoll20Import({ tableId, kind: item.kind, sourceId: item.sourceId });
    if (existing) {
      const ref = doc(db, "roll20Imports", existing.id);
      await updateDoc(ref, payload);
      savedIds.push(existing.id);
      updated++;
      await syncClaimedCharacterFromImport(existing.id, { ...existing, ...payload });
    } else {
      const ref = await addDoc(collection(db, "roll20Imports"), {
        ...payload,
        importedAt: serverTimestamp(),
        claimedByUid: "",
        claimedByEmail: "",
        claimedCharacterId: ""
      });
      savedIds.push(ref.id);
      created++;
    }
  }
  await createLog("roll20.selection_synced", { tableId: cleanText(tableId), total: savedIds.length, created, updated });
  return { ids: savedIds, created, updated };
}

export async function claimRoll20Character(importId) {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  if (!importId) throw new Error("Personagem inválido.");
  const importRef = doc(db, "roll20Imports", importId);
  const importSnap = await getDoc(importRef);
  if (!importSnap.exists()) throw new Error("Personagem não encontrado.");
  const data = importSnap.data();
  if (data.kind !== "character") throw new Error("Apenas personagens podem ser reivindicados.");
  if (normalizeRoll20Category(data.category) !== "Personagens") throw new Error("Apenas personagens da categoria Personagens podem ser reivindicados.");
  if (data.visible === false) throw new Error("Este personagem está oculto.");
  if (data.claimedByUid && data.claimedByUid !== user.uid) throw new Error("Este personagem já foi reivindicado por outro jogador.");

  let characterId = data.claimedCharacterId || "";
  if (!characterId) {
    const q = query(collection(db, "characters"), where("ownerUid", "==", user.uid));
    const snap = await getDocs(q);
    snap.forEach(d => { if (!characterId && d.data().roll20ImportId === importId) characterId = d.id; });
  }

  const characterPayload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    nome: cleanText(data.name, "Personagem Roll20"),
    raca: "",
    variante: "",
    classe: "",
    subclasse: "",
    especializacao: "",
    elementoNatural: "",
    rankInicial: "D",
    talentos: [],
    distribuicaoInicial: {},
    pontosDistribuicaoDireta: {},
    simulacao: {},
    equipamentosSimulados: {},
    resumo: { dica: cleanText(data.bio).slice(0, 500) },
    roll20ImportId: importId,
    roll20SourceId: cleanText(data.sourceId),
    roll20TableId: cleanText(data.tableId),
    roll20Bio: cleanText(data.bio),
    roll20ImageUrl: cleanRoll20Image(data.imageUrl),
    updatedAt: serverTimestamp()
  };

  if (characterId) {
    await updateDoc(doc(db, "characters", characterId), characterPayload);
  } else {
    const charRef = await addDoc(collection(db, "characters"), {
      ...characterPayload,
      createdAt: serverTimestamp()
    });
    characterId = charRef.id;
  }

  await updateDoc(importRef, {
    claimedByUid: user.uid,
    claimedByEmail: normalizeEmail(user.email || ""),
    claimedCharacterId: characterId,
    claimedAt: data.claimedAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "users", user.uid), {
    "character.hasCharacter": true,
    "character.nome": characterPayload.nome,
    updatedAt: serverTimestamp()
  }).catch(()=>{});

  await createLog("roll20.character_claimed", { importId, characterId, name: characterPayload.nome });
  return characterId;
}

export async function listMyRoll20Imports() {
  const { db } = getFirebase();
  const user = requireCurrentUser();
  const q = query(collection(db, "roll20Imports"), where("ownerUid", "==", user.uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function listRoll20ImportsForViewer() {
  const { db } = getFirebase();
  requireCurrentUser();
  const snap = await getDocs(collection(db, "roll20Imports"));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.reverse();
}

export async function updateRoll20Import(importId, patch = {}) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  if (!importId) throw new Error("Registro inválido.");
  const ref = doc(db, "roll20Imports", importId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Registro não encontrado.");
  const data = snap.data();
  // Admin pode editar qualquer importação; Mestre só edita as próprias importações.
  const profile = await getUserProfile(user.uid);
  if (profile?.role !== "admin" && data.ownerUid !== user.uid) throw new Error("Você só pode editar seus próprios registros.");
  const safePatch = {
    name: patch.name !== undefined ? cleanText(patch.name, data.name || "") : data.name,
    bio: patch.bio !== undefined ? cleanText(patch.bio) : data.bio,
    imageUrl: patch.imageUrl !== undefined ? cleanRoll20Image(patch.imageUrl) : data.imageUrl,
    category: patch.category !== undefined ? normalizeRoll20Category(patch.category) : (data.category || "NPC"),
    visible: patch.visible !== undefined ? Boolean(patch.visible) : data.visible,
    updatedAt: serverTimestamp()
  };
  await updateDoc(ref, safePatch);
  await createLog("roll20.import_updated", { importId, name: safePatch.name || "" });
}

export async function deleteRoll20Import(importId) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  if (!importId) throw new Error("Registro inválido.");
  const ref = doc(db, "roll20Imports", importId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Registro não encontrado.");
  const data = snap.data();
  // Admin pode deletar qualquer importação; Mestre só deleta as próprias importações.
  const profile = await getUserProfile(user.uid);
  if (profile?.role !== "admin" && data.ownerUid !== user.uid) throw new Error("Você só pode deletar seus próprios registros.");
  await deleteDoc(ref);
  await createLog("roll20.import_deleted", { importId, name: data.name || "" });
}



// ========================================================
// DOWNLOADS PREMIUM DO SISTEMA
// ========================================================

function safeFileName(name) {
  return cleanText(name, "arquivo")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "arquivo";
}

export async function uploadSystemDownloadFile(file) {
  const { storage } = getFirebase();
  const user = await requireAdminUser();
  if (!file) throw new Error("Selecione um arquivo.");
  const maxSize = 200 * 1024 * 1024;
  if (file.size > maxSize) throw new Error("Arquivo muito grande. Limite atual: 200 MB.");
  const fileName = safeFileName(file.name || "sistema");
  const path = `system-downloads/${user.uid}/${Date.now()}-${fileName}`;
  const ref = storageRef(storage, path);
  const snap = await uploadBytes(ref, file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: {
      ownerUid: user.uid,
      originalName: file.name || fileName
    }
  });
  const url = await getDownloadURL(snap.ref);
  return {
    fileUrl: url,
    filePath: path,
    fileName: file.name || fileName,
    fileSize: file.size || 0,
    fileType: file.type || "application/octet-stream"
  };
}

export async function saveSystemDownload(download) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  const payload = {
    ownerUid: user.uid,
    ownerEmail: normalizeEmail(user.email || ""),
    title: cleanText(download.title, "Sistema Crônicas do Éter"),
    version: cleanText(download.version),
    fileUrl: cleanUrl(download.fileUrl),
    filePath: cleanText(download.filePath),
    fileName: cleanText(download.fileName),
    fileSize: Number(download.fileSize || 0),
    fileType: cleanText(download.fileType),
    description: cleanText(download.description),
    visible: download.visible !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (!payload.fileUrl) throw new Error("Selecione e envie um arquivo.");
  const ref = await addDoc(collection(db, "systemDownloads"), payload);
  await createLog("system_download.saved", { downloadId: ref.id, title: payload.title, fileName: payload.fileName });
  return ref.id;
}

export async function listSystemDownloads() {
  const { db } = getFirebase();
  requireCurrentUser();
  const snap = await getDocs(collection(db, "systemDownloads"));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR", { sensitivity: "base" }));
}

export async function updateSystemDownload(downloadId, patch = {}) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  if (!downloadId) throw new Error("Download inválido.");
  const ref = doc(db, "systemDownloads", downloadId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Download não encontrado.");
  const data = snap.data();
  // Admin pode editar qualquer download; Mestre só edita os próprios downloads.
  const profile = await getUserProfile(user.uid);
  if (profile?.role !== "admin" && data.ownerUid !== user.uid) throw new Error("Você só pode editar seus próprios downloads.");
  const safePatch = {
    title: patch.title !== undefined ? cleanText(patch.title, data.title || "") : data.title,
    version: patch.version !== undefined ? cleanText(patch.version) : data.version,
    fileUrl: patch.fileUrl !== undefined ? cleanUrl(patch.fileUrl) : data.fileUrl,
    filePath: patch.filePath !== undefined ? cleanText(patch.filePath) : data.filePath,
    fileName: patch.fileName !== undefined ? cleanText(patch.fileName) : data.fileName,
    fileSize: patch.fileSize !== undefined ? Number(patch.fileSize || 0) : data.fileSize,
    fileType: patch.fileType !== undefined ? cleanText(patch.fileType) : data.fileType,
    description: patch.description !== undefined ? cleanText(patch.description) : data.description,
    visible: patch.visible !== undefined ? Boolean(patch.visible) : data.visible,
    updatedAt: serverTimestamp()
  };
  await updateDoc(ref, safePatch);
  await createLog("system_download.updated", { downloadId, title: safePatch.title || "" });
}

export async function deleteSystemDownload(downloadId) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  if (!downloadId) throw new Error("Download inválido.");
  const ref = doc(db, "systemDownloads", downloadId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Download não encontrado.");
  const data = snap.data();
  // Admin pode deletar qualquer download; Mestre só deleta os próprios downloads.
  const profile = await getUserProfile(user.uid);
  if (profile?.role !== "admin" && data.ownerUid !== user.uid) throw new Error("Você só pode deletar seus próprios downloads.");
  await deleteDoc(ref);
  if (data.filePath) {
    try {
      const { storage } = getFirebase();
      await deleteObject(storageRef(storage, data.filePath));
    } catch (err) {
      console.warn("Arquivo do Storage não foi removido:", err);
    }
  }
  await createLog("system_download.deleted", { downloadId, title: data.title || "" });
}

// ========================================================
// CÓDIGO DE ACESSO POR E-MAIL
// ========================================================
async function loadEmailJsBrowserSdk() {
  if (window.emailjs && typeof window.emailjs.send === 'function') return window.emailjs;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cronicas-emailjs]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.async = true;
    script.dataset.cronicasEmailjs = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o SDK do EmailJS.'));
    document.head.appendChild(script);
  });

  if (!window.emailjs || typeof window.emailjs.send !== 'function') {
    throw new Error('SDK do EmailJS indisponível após carregamento.');
  }
  return window.emailjs;
}

async function sendInviteEmailViaEmailJS({ email, nome, code }) {
  const mod = await import('./email-config.js').catch(() => null);
  if (!mod || !mod.isEmailConfigured || !mod.isEmailConfigured()) {
    throw new Error('Envio de e-mail ainda não configurado. Configure email-config.js com EmailJS.');
  }

  const cfg = mod.emailConfig;
  const templateParams = {
    to_email: normalizeEmail(email),
    name: String(nome || 'Jogador').trim(),
    invite_code: String(code || '').trim()
  };

  if (!templateParams.to_email) throw new Error('E-mail de destino inválido.');
  if (!templateParams.invite_code) throw new Error('Código de convite inválido.');

  try {
    const emailjs = await loadEmailJsBrowserSdk();
    if (typeof emailjs.init === 'function') emailjs.init({ publicKey: cfg.publicKey });
    await emailjs.send(cfg.serviceId, cfg.templateId, templateParams);
  } catch (err) {
    const detail = err?.text || err?.message || String(err || 'erro desconhecido');
    throw new Error('Não foi possível enviar o e-mail pelo EmailJS. ' + detail);
  }
}

export async function requestInviteCodeByEmail({ nome, email }) {
  const { db } = getFirebase();
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(nome || 'Jogador').trim();
  if (!cleanEmail) throw new Error('Informe um e-mail válido.');
  if (!cleanName) throw new Error('Informe o nome do jogador.');

  const code = makeInviteCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await setDoc(doc(db, 'inviteCodes', code), {
    code,
    status: 'active',
    source: 'email-request',
    targetEmail: cleanEmail,
    targetName: cleanName,
    expiresAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await sendInviteEmailViaEmailJS({ email: cleanEmail, nome: cleanName, code });
  return code;
}
