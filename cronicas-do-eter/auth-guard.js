// ========================================================
// CRÔNICAS DO ÉTER — PROTEÇÃO DE PÁGINAS FECHADAS
// ========================================================
import { watchAuth, hasApprovedAccess } from "./auth-service.js";

function showLocked(message) {
  document.body.innerHTML = `
    <div id="stars"></div>
    <main class="auth-page">
      <section class="auth-card auth-card-wide">
        <p class="section-label">Acesso restrito</p>
        <h1 class="auth-heading">Conteúdo exclusivo</h1>
        <p class="auth-copy">${message}</p>
        <div class="auth-actions">
          <a class="btn-primary" href="login.html?redirect=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}">Entrar / Criar Conta</a>
          <a class="btn-secondary" href="index.html">Voltar ao início</a>
        </div>
      </section>
    </main>
  `;
}

watchAuth(({ user, profile, configured }) => {
  if (!configured) {
    showLocked("O Firebase ainda não foi configurado. Preencha o arquivo firebase-config.js para ativar o sistema de login.");
    return;
  }
  if (!user) {
    showLocked("Faça login com uma conta aprovada para acessar esta ferramenta.");
    return;
  }
  if (!hasApprovedAccess(profile)) {
    showLocked("Sua conta existe, mas ainda não possui acesso aprovado para ferramentas exclusivas.");
  }
});
