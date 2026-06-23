# Crônicas do Éter — Firebase Sprint 1

## 1. Firebase já configurado

O arquivo `firebase-config.js` já está preenchido com o projeto Firebase `cronicas-do-eter`.

## 2. Firestore obrigatório

No Firebase Console, confirme que existe:

Coleção: `settings`
Documento: `access`

Campos:

- `inviteCode` — string — `CRONICAS2026`
- `familiarFree` — boolean — `true`
- `maintenance` — boolean — `false`
- `siteVersion` — string — `1.0`

## 3. Regras do Firestore

No Firebase:

Firestore Database > Regras

Apague tudo e cole o conteúdo de `firebase-rules.txt`.
Depois clique em Publicar.

Essas regras permitem:

- leitura pública de `settings/access`;
- criação do próprio usuário;
- Matheus (`matheuscarvalho696@gmail.com`) como admin bootstrap;
- admin gerenciar usuários e configurações.

## 4. Primeiro acesso admin

1. Abra o site na Vercel.
2. Vá para `login.html`.
3. Crie a conta usando o e-mail `matheuscarvalho696@gmail.com`.
4. Use o código atual: `CRONICAS2026`.
5. Depois do login, abra `admin.html`.

Essa conta será promovida automaticamente para:

- `role: admin`
- `status: approved`

Se você já havia criado essa conta como player, basta sair e entrar novamente depois de publicar as regras novas. O sistema tentará corrigir a conta para admin automaticamente.

## 5. Convites

No painel `admin.html`, você pode:

- ver usuários cadastrados;
- alterar role: jogador, mestre ou admin;
- bloquear usuários;
- trocar o código de convite;
- gerar um código aleatório e copiar para enviar manualmente aos jogadores.

Envio automático de e-mail ainda não está ativo, porque isso exige backend/Cloud Functions.
