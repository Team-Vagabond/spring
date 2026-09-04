'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

export function HumanGate({
  escalationId,
  action,
  onDone,
}: {
  escalationId: string;
  action: string;
  dispatch?: any;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    await api(`/api/escalations/${escalationId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', by: 'municipal water desk' }),
    }).catch(() => {});
    await onDone();
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-[var(--ochre-a40)] bg-[var(--ochre-a12)] p-5 sm:p-6 mb-9">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--ochre)] animate-pulse" />
        <span className="eyebrow text-[#c98a4a]">Human checkpoint — waiting for you</span>
      </div>
      <p className="text-[0.95rem] text-[var(--paper-ink)] mt-2 measure">
        The agent has finished its investigation and drafted this case. It files nothing on its own —
        it waits here for a person to accept it.
      </p>
      <p className="text-[0.85rem] text-[var(--paper-ink-2)] mt-1.5 measure">{action}</p>

      <div className="mt-4">
        <Button variant="primary" disabled={busy} onClick={accept}>
          {busy ? 'Filing case…' : 'Accept & file case'}
        </Button>
      </div>
    </div>
  );
}

export function Outbox({ caseRef }: { messages?: any[]; caseRef?: string }) {
  return (
    <div className="rounded-xl border border-[var(--moss-a40)] bg-[var(--moss-a12)] p-5 mb-9">
      <div className="eyebrow text-[#7f9a3f]">Case filed{caseRef ? ` · ${caseRef}` : ''}</div>
      <p className="text-[0.85rem] text-[var(--paper-ink-2)] mt-1.5 measure">
        Accepted by the municipal water &amp; sanitation desk and opened in the case register.
        Monitoring of this spring continues.
      </p>
    </div>
  );
}
