import { admin } from './db';

/**
 * Simulated SMS / IVR gateway. In production this is an Aakash SMS / Sparrow SMS
 * HTTP call (Nepal) or a telco short-code; here every message is written to the
 * `messages` table and marked "sent". The UI shows the outbox exactly as a real
 * one would. Disclosed as simulated in the README and on the demo.
 */
export interface Recipient {
  label: string;
  number?: string;
}

export async function sendBrief(
  escalationId: string,
  recipients: Recipient[],
  bodyNe: string,
  bodyEn: string,
): Promise<{ sent: number }> {
  const rows: any[] = [];
  for (const r of recipients) {
    rows.push({
      escalation_id: escalationId,
      channel: 'sms',
      to_label: r.label,
      to_number: r.number ?? null,
      lang: 'ne',
      body: bodyNe,
      status: 'sent',
    });
  }
  // one English copy on file for the record
  rows.push({
    escalation_id: escalationId,
    channel: 'sms',
    to_label: 'Case record (English copy)',
    lang: 'en',
    body: bodyEn,
    status: 'sent',
  });
  await admin.from('messages').insert(rows);
  return { sent: recipients.length };
}
