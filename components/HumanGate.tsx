'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

export function HumanGate({
  escalationId,
  action,
  dispatch,
  onDone,
}: {
  escalationId: string;
  action: string;
  dispatch: any;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function decide(decision: string) {
    setBusy(decision);
    await api(`/api/escalations/${escalationId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, by: 'ward coordinator', note }),
    }).catch(() => {});
    await onDone();
    setBusy(null);
  }

  const recipients: { label: string }[] = dispatch?.recipients ?? [];

  return (
    <div className="rounded-xl border border-[var(--ochre-a40)] bg-[var(--ochre-a12)] p-5 sm:p-6 mb-9">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--ochre)] animate-pulse" />
        <span className="eyebrow text-[#c98a4a]">Human checkpoint — waiting for you</span>
      </div>
      <p className="text-[0.95rem] text-[var(--paper-ink)] mt-2 measure">
        The agent has finished its investigation and drafted a case. It will <b>not</b> send or file
        anything until you approve. Action to be taken:
      </p>
      <p className="text-[0.9rem] text-[var(--paper-ink-2)] mt-1.5 measure">{action}</p>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[var(--paper-line)] bg-[var(--paper)] p-3">
          <div className="eyebrow mb-1.5">SMS brief · नेपाली</div>
          <p className="text-[0.85rem] leading-relaxed text-[var(--paper-ink)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {dispatch?.sms_brief_ne || '—'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--paper-line)] bg-[var(--paper)] p-3">
          <div className="eyebrow mb-1.5">SMS brief · English</div>
          <p className="text-[0.85rem] leading-relaxed text-[var(--paper-ink-2)]">{dispatch?.sms_brief_en || '—'}</p>
        </div>
      </div>

      {recipients.length > 0 && (
        <div className="mt-3 text-[0.78rem] text-[var(--paper-ink-2)]">
          <span className="eyebrow">Recipients&nbsp;</span>
          {recipients.map((r) => r.label).join(' · ')}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. what you want checked before this goes out"
        rows={2}
        className="mt-4 w-full rounded-lg border border-[var(--paper-line)] bg-[var(--paper)] p-2.5 text-[0.85rem] text-[var(--paper-ink)]"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={!!busy} onClick={() => decide('approve')}>
          {busy === 'approve' ? 'Filing & sending…' : 'Approve — file case & send SMS'}
        </Button>
        <Button variant="paper" disabled={!!busy} onClick={() => decide('request_more')}>
          Request more evidence
        </Button>
        <Button variant="paper" disabled={!!busy} onClick={() => decide('reject')}>
          Reject
        </Button>
      </div>
    </div>
  );
}

export function Outbox({ messages, caseRef }: { messages: any[]; caseRef?: string }) {
  if (!messages?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--moss-a40)] bg-[var(--moss-a12)] p-5 mb-9">
      <div className="eyebrow text-[#7f9a3f]">Dispatched{caseRef ? ` · case ${caseRef}` : ''}</div>
      <p className="text-[0.85rem] text-[var(--paper-ink-2)] mt-1.5">
        Case filed with the District Water Resources Committee. SMS sent through the gateway (simulated).
      </p>
      <ul className="mt-3 space-y-2">
        {messages.map((m) => (
          <li key={m.id} className="rounded-lg border border-[var(--paper-line)] bg-[var(--paper)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.78rem] font-medium text-[var(--paper-ink)]">{m.to_label}</span>
              <span className="text-[0.66rem] font-mono text-[#7f9a3f]">{m.status} · {m.lang}</span>
            </div>
            <p className="text-[0.85rem] text-[var(--paper-ink-2)] mt-1" style={{ fontFamily: 'var(--font-sans)' }}>{m.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
