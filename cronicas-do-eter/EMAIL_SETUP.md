# Configurar envio de código por e-mail

A versão v35 permite que o jogador solicite um código de acesso por e-mail antes de criar a conta.

Como o site está hospedado como frontend estático na Vercel, o envio de e-mail usa EmailJS.

## Passos

1. Acesse https://www.emailjs.com/ e crie uma conta.
2. Crie um Email Service.
3. Crie um template de e-mail com estas variáveis:
   - `{{to_email}}`
   - `{{to_name}}`
   - `{{invite_code}}`
   - `{{system_name}}`
4. Abra o arquivo `email-config.js`.
5. Preencha:
   - `publicKey`
   - `serviceId`
   - `templateId`
6. Faça commit no GitHub e aguarde a Vercel publicar.

## Observação importante

Esse fluxo verifica o e-mail do jogador por meio do envio do código, mas não substitui uma aprovação manual/pagamento. Para um sistema fechado comercialmente, o ideal no futuro é mover esse envio para backend/Cloud Functions.


## Configuração aplicada nesta versão

- Service ID: `service_6cvi8c9`
- Template ID: `template_e66cvcn`
- Public Key: já preenchida em `email-config.js`

O template pode usar `{{name}}` ou `{{to_name}}` para o nome do jogador e `{{invite_code}}` para o código.
