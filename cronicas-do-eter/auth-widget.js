// ========================================================
// CRÔNICAS DO ÉTER — MENU DINÂMICO DE LOGIN
// ========================================================
import { watchAuth, logout, hasApprovedAccess, isAdmin } from "./auth-service.js";

function rootPrefix() {
  const parts = location.pathname.split('/').filter(Boolean);
  const file = parts[parts.length - 1] || 'index.html';
  const parent = parts[parts.length - 2] || '';
  return (parent === 'racas' || parent === 'classes') ? '../' : '';
}
function url(path) { return rootPrefix() + path; }

function ensureAuthBox() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return null;
  let box = sidebar.querySelector(".auth-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "auth-box";
    sidebar.appendChild(box);
  }
  return box;
}

function addTopLoginLink() {
  const topbar = document.querySelector(".topbar");
  if (!topbar || topbar.querySelector(".top-login-link")) return;
  const link = document.createElement("a");
  link.className = "top-login-link";
  link.href = url("login.html");
  link.textContent = "Entrar";
  const toggle = topbar.querySelector(".nav-toggle");
  if (toggle) topbar.insertBefore(link, toggle);
  else topbar.appendChild(link);
}

function renderLoggedOut(box, configured) {
  if (!box) return;
  box.innerHTML = `
    <div class="auth-title">Acesso</div>
    <p>${configured ? "Entre para liberar ferramentas fechadas." : "Firebase ainda não configurado."}</p>
    <a class="auth-button" href="${url("login.html")}">Entrar / Criar Conta</a>
  `;
  const top = document.querySelector(".top-login-link");
  if (top) {
    top.href = url("login.html");
    top.textContent = "Entrar";
  }
}

function renderLoggedIn(box, user, profile) {
  if (!box) return;
  const nome = profile?.nome || user.displayName || user.email;
  const role = profile?.role || "player";
  const approved = hasApprovedAccess(profile);
  const adminLink = isAdmin(profile) ? `<a class="auth-button outline" href="${url("admin.html")}">Painel Admin</a>` : "";
  box.innerHTML = `
    <div class="auth-title">${nome}</div>
    <p>${approved ? `Acesso liberado • ${role}` : "Conta aguardando liberação."}</p>
    <a class="auth-button" href="${url("perfil.html")}">Meu Perfil</a>
    ${adminLink}
    <button class="auth-button danger" type="button" id="logoutBtn">Sair</button>
  `;
  const logoutBtn = box.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { await logout(); window.location.href = url("index.html"); });
  const top = document.querySelector(".top-login-link");
  if (top) {
    top.href = url("perfil.html");
    top.textContent = "Perfil";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  addTopLoginLink();
  const box = ensureAuthBox();
  watchAuth(({ user, profile, configured }) => {
    if (!configured || !user) renderLoggedOut(box, configured);
    else renderLoggedIn(box, user, profile);
  });
});
