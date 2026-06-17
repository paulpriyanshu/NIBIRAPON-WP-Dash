import nodemailer from 'nodemailer';

// Gmail SMTP transport. Requires an App Password (not the normal account
// password) — generate one at https://myaccount.google.com/apppasswords with
// 2-Step Verification enabled.
//   GMAIL_USER          – the Gmail address that sends the mail
//   GMAIL_APP_PASSWORD  – the 16-char app password for that account
//   NOTIFY_EMAIL        – where notifications are delivered (defaults to GMAIL_USER)

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return transporter;
}

export interface IncomingMsgEmail {
  fromPhone: string;
  contactName: string;
  text: string | null;
  msgType: string;
}

/**
 * Send an email notification for an incoming WhatsApp message. Best-effort:
 * never throws — logs and returns false if email isn't configured or fails,
 * so it can never block the webhook reply.
 */
export async function notifyIncomingMessage(info: IncomingMsgEmail): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    console.warn('[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping notification');
    return false;
  }

  const to = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER!;
  const preview = info.text?.trim() || `[${info.msgType} message]`;
  const subject = `New WhatsApp message from ${info.contactName}`;
  const waLink = `https://wa.me/${info.fromPhone.replace(/\D/g, '')}`;

  const text = [
    `You received a new WhatsApp message.`,
    ``,
    `From: ${info.contactName} (${info.fromPhone})`,
    `Type: ${info.msgType}`,
    `Message: ${preview}`,
    ``,
    `Reply on WhatsApp: ${waLink}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin:0 0 12px">📩 New WhatsApp message</h2>
      <p style="margin:4px 0"><strong>From:</strong> ${escapeHtml(info.contactName)} (${escapeHtml(info.fromPhone)})</p>
      <p style="margin:4px 0"><strong>Type:</strong> ${escapeHtml(info.msgType)}</p>
      <p style="margin:12px 0;padding:12px;background:#f4f4f5;border-radius:8px">${escapeHtml(preview)}</p>
      <p style="margin:12px 0"><a href="${waLink}" style="color:#16a34a">Reply on WhatsApp →</a></p>
    </div>`;

  try {
    await tx.sendMail({
      from: `WhatsApp Bot <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[email] notification sent to ${to} for message from ${info.fromPhone}`);
    return true;
  } catch (err) {
    console.error('[email] failed to send notification:', err instanceof Error ? err.message : err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
