# Crônicas do Éter — Configuração Firebase

## 1. Preencher `firebase-config.js`

No Firebase Console, vá em:

**Configurações do projeto → Geral → Seus apps → Web**

Copie o objeto `firebaseConfig` e substitua os valores em `firebase-config.js`.

## 2. Authentication

Ative:

**Authentication → Método de login → E-mail/senha**

## 3. Firestore

Crie:

Coleção: `settings`
Documento: `access`

Campos:

- `inviteCode` — string — `CRONICAS2026`
- `familiarFree` — boolean — `true`
- `siteVersion` — string — `1.0`
- `maintenance` — boolean — `false`

## 4. Regras do Firestore

Copie o conteúdo de `firebase-rules.txt` para:

**Firestore Database → Regras**

## 5. Primeiro administrador

1. Entre no site e crie sua conta usando o código de convite.
2. Vá no Firestore → `users` → seu documento de usuário.
3. Altere os campos:

```txt
role: admin
status: approved
```

Depois disso, acesse `admin.html` para gerenciar código de convite e usuários.

## 6. Páginas protegidas nesta Sprint

Exigem login aprovado:

- `calculadora.html`
- `mercado.html`
- `criacao-equipamentos.html`

Permanecem públicas:

- página inicial
- raças
- classes
- talentos
- habilidades
- familiar
- divindades

