import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 * Email service
 * ============================================
 *
 * Один nodemailer-transport, конфіг з env. У dev це Mailpit (порт 1025),
 * у prod — реальний SMTP (Resend/Postmark/SES). Жодних `if (env)` гілок —
 * усе керується змінними оточення.
 *
 * Шаблони inline (рядки нижче). Якщо колись будемо локалізувати або
 * додавати дизайн — переїдемо на mjml/react-email. Поки YAGNI.
 */

let transporter: Transporter | null = null;

/**
 * Lazy-singleton — щоб не створювати transport до першого виклику.
 * (Це важливо для тестів: якщо тест не шле email, ми не намагаємось
 * приконнектитись до неіснуючого SMTP.)
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // secure=true для портів 465; для Mailpit (1025) і більшості інших — false.
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  return transporter;
}

/**
 * Низькорівнева функція. Підіймає nodemailer, шле, логує.
 *
 * Чому НЕ throw на failure: лист не дійшов — це не привід падати з 500.
 * Юзер може ще раз натиснути "Resend". Натомість логуємо як warn —
 * ops-команда розбиратиметься.
 *
 * Для критичних випадків (наприклад, якщо ми б колись слали 2FA-коди)
 * треба було б throw. Для verify/reset — не критично.
 */
async function sendMail(to: string, subject: string, html: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.warn({ err, to, subject }, "Email send failed");
  }
}

// ============================================
// HTML шаблони — inline
// ============================================
//
// Базовий стиль: безпечний, працює у Gmail/Outlook/Apple Mail.
// Жодного <style> у <head> — багато клієнтів його ріжуть.
// Усе через inline `style`. Темна тема не підтримується (її стиль
// лишаємо клієнту email-сервісу).

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chat</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f4f6;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#e74694 0%,#f4a261 100%);padding:24px;text-align:center;">
                <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">💬 Chat</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;color:#1f2937;font-size:15px;line-height:1.6;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">
                Якщо ви не очікували цей лист — проігноруйте його.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buttonHtml(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#e74694 0%,#f4a261 100%);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;margin:16px 0;">${label}</a>`;
}

// ============================================
// Public API
// ============================================

/**
 * Лист підтвердження email при реєстрації.
 * Лінк веде на фронт-роут /auth/verify?token=XXX, який POST-ить
 * на бекенд /api/v1/auth/verify-email.
 */
export async function sendVerificationEmail(
  to: string,
  name: string,
  rawToken: string,
): Promise<void> {
  const link = `${env.CLIENT_URL}/auth/verify?token=${rawToken}`;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1f2937;">Привіт, ${escapeHtml(name)}!</h1>
    <p style="margin:0 0 16px;">Дякуємо за реєстрацію в Chat. Щоб закінчити налаштування акаунту, підтвердьте свою електронну адресу:</p>
    <p style="text-align:center;">${buttonHtml(link, "Підтвердити email")}</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Або скопіюйте це посилання у браузер:</p>
    <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">${link}</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Посилання дійсне 24 години.</p>
  `);

  await sendMail(to, "Підтвердіть свою email-адресу", html);
}

/**
 * Лист скидання пароля.
 * Лінк веде на фронт-роут /auth/reset-password?token=XXX.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  rawToken: string,
): Promise<void> {
  const link = `${env.CLIENT_URL}/auth/reset-password?token=${rawToken}`;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1f2937;">Скидання пароля</h1>
    <p style="margin:0 0 16px;">Привіт, ${escapeHtml(name)}. Ми отримали запит на скидання пароля для вашого акаунту.</p>
    <p style="text-align:center;">${buttonHtml(link, "Створити новий пароль")}</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Або скопіюйте це посилання у браузер:</p>
    <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">${link}</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Посилання дійсне 1 годину. Якщо ви не запитували скидання пароля — проігноруйте цей лист, ваш пароль залишиться без змін.</p>
  `);

  await sendMail(to, "Скидання пароля", html);
}

/**
 * Захист від HTML-injection через user-controlled name.
 * Юзер може зареєструватись з name="<script>...</script>" — ми не маємо
 * пропустити цей name живим у HTML листа.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
