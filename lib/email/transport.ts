import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is not set");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

const DEFAULT_FROM = "CrowdRoast <notifications@crowdroast.com>";

export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const { to, subject, html, from = DEFAULT_FROM } = options;

  const { error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function sendEmailBatch(
  emails: SendEmailOptions[]
): Promise<SendEmailResult> {
  if (emails.length === 0) return { success: true };

  const { error } = await resend.batch.send(
    emails.map(({ to, subject, html, from = DEFAULT_FROM }) => ({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }))
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
