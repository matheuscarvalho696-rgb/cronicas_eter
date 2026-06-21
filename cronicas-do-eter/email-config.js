// ========================================================
// CRÔNICAS DO ÉTER — CONFIGURAÇÃO DE ENVIO DE CÓDIGO POR E-MAIL
// ========================================================
// Para envio real de código por e-mail usando EmailJS:
// 1. Crie conta em https://www.emailjs.com/
// 2. Crie um Email Service
// 3. Crie um Template com variáveis: {{to_email}}, {{to_name}}, {{invite_code}}
// 4. Preencha os valores abaixo.
//
// Enquanto não preencher, o site gera o código e salva no Firestore,
// mas não consegue enviar e-mail automaticamente.

export const emailConfig = {
  provider: "emailjs",
  publicKey: "COLE_SEU_EMAILJS_PUBLIC_KEY_AQUI",
  serviceId: "COLE_SEU_EMAILJS_SERVICE_ID_AQUI",
  templateId: "COLE_SEU_EMAILJS_TEMPLATE_ID_AQUI"
};

export function isEmailConfigured() {
  return Boolean(
    emailConfig.publicKey &&
    emailConfig.serviceId &&
    emailConfig.templateId &&
    !emailConfig.publicKey.includes("COLE_") &&
    !emailConfig.serviceId.includes("COLE_") &&
    !emailConfig.templateId.includes("COLE_")
  );
}
