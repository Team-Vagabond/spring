'use client';
import { useState } from 'react';

interface Step {
  t: string; kind: string; step?: number; actor?: string; model?: string;
  tool?: string; args?: any; result?: string; error?: string; ms?: number;
  content?: string; confidence?: number; tokens?: { p: number; c: number };
}

const hhmmss = (t: string) => new Date(t).toISOString().slice(11, 19);

export function AgentTranscript({ trace, downloadHref }: { trace: Step[]; downloadHref: string }) {
  const [open, setOpen] = useState(true);
  if (!trace?.length) return null;

  return (
    <section className="mx-auto max-w-[1120px] px-6 mt-8">
      <div className="sheet">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-[var(--rule-2)] text-left hover:bg-[var(--paper-2)]"
        >
          <span className="text-[0.82rem] font-semibold text-[var(--ink)]">Investigation transcript</span>
          <span className="text-[0.7rem] text-[var(--ink-3)] font-mono">{trace.length} lines</span>
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="ml-auto text-[0.72rem] text-[var(--water)] hover:underline font-mono"
          >
            open full log ↗
          </a>
          <span className="text-[var(--ink-3)] text-xs">{open ? '▾' : '▸'}</span>
        </button>

        {open && (
          <ol className="font-mono text-[0.76rem] leading-[1.5] p-4 max-h-[520px] overflow-y-auto bg-[var(--paper)]">
            {trace.map((s, i) => <TraceLine key={i} s={s} />)}
          </ol>
        )}
      </div>
    </section>
  );
}

function TraceLine({ s }: { s: Step }) {
  const time = <span className="text-[var(--ink-3)]">{hhmmss(s.t)}</span>;
  const step = s.step != null ? <span className="text-[var(--ink-3)]"> s{String(s.step).padStart(2, '0')}</span> : null;

  if (s.kind === 'trigger')
    return <li className="py-[3px] text-[var(--water-2)]">{time} <span className="text-[var(--ink-3)]">trigger</span> — {s.content}</li>;

  if (s.kind === 'plan' || s.kind === 'agent')
    return (
      <li className="pt-2 pb-[3px]">
        <div>
          {time}{step} <span className="text-[var(--ink-3)]">{s.kind === 'plan' ? 'plan' : 'agent'}</span>
          {s.model && <span className="text-[var(--contour)]"> · {s.model}</span>}
          {s.tokens && s.tokens.p + s.tokens.c > 0 && <span className="text-[var(--ink-3)]"> · {s.tokens.p}+{s.tokens.c} tok</span>}
        </div>
        <div className="text-[var(--ink)] pl-16">{s.content}</div>
      </li>
    );

  if (s.kind === 'note')
    return <li className="py-[2px] text-[var(--field)]">{time}{step} <span className="text-[var(--ink-3)]">note</span> — {s.result}</li>;

  if (s.kind === 'tool' || s.kind === 'retry') {
    const failed = !!s.error;
    return (
      <li className="py-[2px]">
        <div className={s.kind === 'retry' ? 'text-[var(--water-2)] font-medium' : failed ? 'text-[var(--alert)]' : 'text-[var(--ink)]'}>
          {time}{step} <span className="text-[var(--ink-3)]">{s.kind === 'retry' ? 'retry' : 'tool '}</span>
          {' '}{s.tool}
          {s.args && Object.keys(s.args).length > 0 && <span className="text-[var(--ink-3)]">({JSON.stringify(s.args)})</span>}
          {failed && <span className="text-[var(--alert)]"> ✗ {s.error}</span>}
        </div>
        {s.result && <div className="text-[var(--ink-2)] pl-16">→ {s.result}{s.ms ? `  (${s.ms}ms)` : ''}</div>}
      </li>
    );
  }

  if (s.kind === 'gate')
    return (
      <li className="my-1.5 border border-[var(--watch)] bg-[var(--watch-wash)] px-2.5 py-1.5 text-[var(--watch)]">
        {time}{step} <span className="font-bold">GATE — HUMAN APPROVAL REQUIRED</span>
        <div className="text-[var(--ink-2)] mt-0.5">{s.content}</div>
      </li>
    );

  if (s.kind === 'decision')
    return <li className="py-[3px] text-[var(--water-2)] font-medium">{time} <span className="text-[var(--ink-3)]">human</span> — {s.content}</li>;

  if (s.kind === 'action')
    return (
      <li className="my-1.5 border border-[var(--field)] bg-[var(--field-wash)] px-2.5 py-1.5 text-[var(--field)]">
        {time} <span className="font-bold">ACTION</span> — {s.content}
      </li>
    );

  if (s.kind === 'done')
    return <li className="mt-2 pt-2 border-t border-[var(--rule-2)] text-[var(--ink-2)]">{time} <span className="text-[var(--ink-3)]">done</span> — {s.content}</li>;

  if (s.kind === 'error')
    return <li className="py-[3px] text-[var(--alert)]">{time}{step} error — {s.content}</li>;

  return <li className="py-[2px] text-[var(--ink-3)]">{time}{step} {s.kind} {s.content}</li>;
}
