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
  if (profile?.role !== "admin") throw new Error("Somente o Admin pode alterar as mesas do Roll20.");
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

function normalizeRoll20Items(items, kind) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    kind,
    sourceId: cleanText(item.id || item.sourceId || item.roll20Id || `${kind}-${Date.now()}-${index}`),
    name: cleanText(item.name || item.nome || item.title || item.titulo, kind === "character" ? "Personagem sem nome" : "Folheto sem título"),
    bio: cleanText(item.bio || item.biografia || item.gmnotes || item.content || item.conteudo),
    imageUrl: cleanRoll20Image(item.imageUrl || item.avatar || item.imgsrc || item.image || item.imagem),
    tags: Array.isArray(item.tags) ? item.tags.map(cleanText).filter(Boolean) : [],
    visible: item.visible !== false,
    raw: item.raw || {}
  })).filter(item => item.name || item.bio || item.imageUrl);
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
  if (data.ownerUid !== user.uid) throw new Error("Você só pode deletar suas próprias mesas.");
  await deleteDoc(ref);
  await createLog("roll20.table_deleted", { tableId, name: data.name || "" });
}

export async function importRoll20Selection({ tableId, campaignId, characters = [], handouts = [] }) {
  const { db } = getFirebase();
  const user = await requireAdminUser();
  const normalizedCharacters = normalizeRoll20Items(characters, "character");
  const normalizedHandouts = normalizeRoll20Items(handouts, "handout");
  const allItems = [...normalizedCharacters, ...normalizedHandouts];
  if (!allItems.length) throw new Error("Selecione pelo menos um personagem ou folheto para importar.");

  const savedIds = [];
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
      tags: item.tags,
      visible: item.visible,
      importedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "roll20Imports"), payload);
    savedIds.push(ref.id);
  }
  await createLog("roll20.selection_imported", { tableId: cleanText(tableId), total: savedIds.length });
  return savedIds;
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
  if (data.ownerUid !== user.uid) throw new Error("Você só pode editar seus próprios registros.");
  const safePatch = {
    name: patch.name !== undefined ? cleanText(patch.name, data.name || "") : data.name,
    bio: patch.bio !== undefined ? cleanText(patch.bio) : data.bio,
    imageUrl: patch.imageUrl !== undefined ? cleanRoll20Image(patch.imageUrl) : data.imageUrl,
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
  if (data.ownerUid !== user.uid) throw new Error("Você só pode deletar seus próprios registros.");
  await deleteDoc(ref);
  await createLog("roll20.import_deleted", { importId, name: data.name || "" });
}

// ========================================================
// CÓDIGO DE ACESSO POR E-MAIL
// ========================================================
async function sendInviteEmailViaEmailJS({ email, nome, code }) {
  const mod = await import('./email-config.js').catch(() => null);
  if (!mod || !mod.isEmailConfigured || !mod.isEmailConfigured()) {
    throw new Error('Envio de e-mail ainda não configurado. Configure email-config.js com EmailJS.');
  }

  const cfg = mod.emailConfig;
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      template_params: {
        to_email: normalizeEmail(email),
        to_name: String(nome || 'Jogador').trim(),
        invite_code: code,
        system_name: 'Crônicas do Éter'
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error('Não foi possível enviar o e-mail pelo EmailJS. ' + text);
  }
}

export async function requestInviteCodeByEmail({ nome, email }) {
  const { db } = getFirebase();
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(nome || 'Jogador').trim();
  if (!cleanEmail) throw new Error('Informe um e-mail válido.');
  if (!cleanName) throw new Error('Informe o nome do jogador.');

  const code = makeInviteCode();
  await setDoc(doc(db, 'inviteCodes', code), {
    code,
    status: 'active',
    source: 'email-request',
    targetEmail: cleanEmail,
    targetName: cleanName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await sendInviteEmailViaEmailJS({ email: cleanEmail, nome: cleanName, code });
  return code;
}
