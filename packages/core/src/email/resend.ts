// Thin wrapper around the Resend API for transactional email (confirmations, password
// resets, notifications). Used when RESEND_API_KEY is set; otherwise callers fall back to
// their existing behaviour (Supabase SMTP, or no email at all in local mode).

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(msg: EmailMessage): Promise<{ id: string } | null> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  const from = msg.from ?? process.env.RESEND_FROM?.trim() ?? process.env.SMTP_SENDER?.trim();
  if (!from) throw new Error("RESEND_FROM (or SMTP_SENDER) is required to send email");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? "" };
}
