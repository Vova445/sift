'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';

type CodeVariant = { label: string; language: string; code: string };

export default function ApiCodeBlock({ title, variants }: { title: string; variants: CodeVariant[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copyState, setCopyState] = useState('');
  const active = variants[activeIndex] || variants[0]!;

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(active.code);
      } else {
        const field = document.createElement('textarea');
        field.value = active.code;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('copy failed');
      }
      setCopyState('Скопійовано');
    } catch {
      setCopyState('Не вдалося скопіювати — виділіть код вручну');
    }
  }

  return <div className="apiCodeBlock">
    <div className="apiCodeToolbar">
      <div className="apiCodeTabs" role="tablist" aria-label={`${title}: мова прикладу`}>
        {variants.map((variant, index) => <button key={variant.label} type="button" role="tab" id={`api-code-tab-${title}-${index}`} aria-selected={index === activeIndex} aria-controls={`api-code-panel-${title}`} onClick={() => { setActiveIndex(index); setCopyState(''); }}>{variant.label}</button>)}
      </div>
      <span className="apiCodeLanguage">{active.language}</span>
      <button type="button" className="apiCodeCopy" onClick={() => void copyCode()} aria-label={`Скопіювати ${title}`}><Copy aria-hidden="true"/><span>Копіювати</span></button>
    </div>
    <pre id={`api-code-panel-${title}`} role="tabpanel" aria-labelledby={`api-code-tab-${title}-${activeIndex}`} tabIndex={0}><code>{active.code}</code></pre>
    <span className="apiCodeStatus" aria-live="polite">{copyState}</span>
  </div>;
}
