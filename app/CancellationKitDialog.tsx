'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, ExternalLink, Mail, X } from 'lucide-react';
import { buildCancellationKit } from '../lib/cancellation-kit.js';
import type { CancellationKit } from '../lib/cancellation-kit.js';
import { useAccessibleDialog } from './useAccessibleDialog';
import { useBodyScrollLock } from './useBodyScrollLock';

type Report = {
  url: string;
  host?: string;
  title?: string;
  findings?: Array<{ kind?: string; evidence?: string }>;
  lockedCount?: number;
};

export default function CancellationKitDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const [language, setLanguage] = useState<CancellationKit['language']>('uk');
  const kit = useMemo(() => buildCancellationKit(report, language), [report, language]);
  const [draft, setDraft] = useState(kit.email.body);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const dialogRef = useAccessibleDialog<HTMLElement>(true, onClose);
  useBodyScrollLock(true);

  function changeLanguage(nextLanguage: CancellationKit['language']) {
    setLanguage(nextLanguage);
    setDraft(buildCancellationKit(report, nextLanguage).email.body);
    setCopied(false);
    setCopyError('');
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(`Subject: ${kit.email.subject}\n\n${draft}`);
      setCopied(true);
      setCopyError('');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopyError(language === 'uk' ? 'Не вдалося скопіювати. Виділіть текст листа й скопіюйте вручну.' : 'Could not copy. Select the letter text and copy it manually.');
    }
  }

  function downloadLetter() {
    const contents = `Subject: ${kit.email.subject}\n\n${draft}\n\n${kit.disclaimer}`;
    const href = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `sift-cancellation-${(kit.providerId || 'service').replace(/[^a-z0-9-]/gi, '-')}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  const uk = language === 'uk';
  return <div className="cancellationKitBackdrop" onMouseDown={onClose}>
    <section className="cancellationKitDialog" role="dialog" aria-modal="true" aria-labelledby="cancellation-kit-title" tabIndex={-1} ref={dialogRef} onMouseDown={event => event.stopPropagation()}>
      <header className="cancellationKitHeader">
        <div><span className="cancellationKitIcon"><Mail aria-hidden="true"/></span><div><small>{uk ? 'CANCELLATION KIT' : 'CANCELLATION KIT'}</small><h2 id="cancellation-kit-title">{uk ? `Звернення до ${kit.providerName}` : `Contact ${kit.providerName}`}</h2><p>{uk ? 'Підготуйте скасування з доказами зі свого звіту.' : 'Prepare a cancellation request with evidence from your report.'}</p></div></div>
        <div className="cancellationKitHeaderActions"><label className="cancellationKitLanguage"><span>{uk ? 'Мова' : 'Language'}</span><select aria-label={uk ? 'Мова листа' : 'Letter language'} value={language} onChange={event => changeLanguage(event.target.value as CancellationKit['language'])}><option value="uk">Українська</option><option value="en">English</option></select></label><button className="cancellationKitClose" type="button" aria-label={uk ? 'Закрити шаблон' : 'Close kit'} onClick={onClose}><X/></button></div>
      </header>

      <div className="cancellationKitContent">
        <section className="cancellationKitSteps">
          <div className="cancellationKitSectionTitle"><span>01</span><h3>{uk ? 'Як скасувати' : 'How to cancel'}</h3></div>
          <ol>{kit.steps.map((step, index) => <li key={index}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
          <div className="cancellationKitLinks">
            {kit.helpUrl && <a href={kit.helpUrl} target="_blank" rel="noopener noreferrer">{kit.helpLabel}<ExternalLink aria-hidden="true"/></a>}
            {kit.refundUrl && <a href={kit.refundUrl} target="_blank" rel="noopener noreferrer">{kit.refundLabel}<ExternalLink aria-hidden="true"/></a>}
            <a href={report.url} target="_blank" rel="noopener noreferrer">{uk ? 'Першоджерело у звіті' : 'Report source page'}<ExternalLink aria-hidden="true"/></a>
          </div>
        </section>

        <section className="cancellationKitEvidence">
          <div className="cancellationKitSectionTitle"><span>02</span><h3>{uk ? 'Умови зі звіту' : 'Terms from your report'}</h3></div>
          <p>{kit.sourceNote}</p>
          {kit.evidence.length ? <div>{kit.evidence.map((quote, index) => <blockquote key={index}>“{quote}”</blockquote>)}</div> : <div className="cancellationKitNotice">{uk ? 'У відкритих доказах цього звіту немає цитати про скасування чи повернення. Перегляньте першоджерело та додайте точний уривок вручну.' : 'This report has no visible cancellation or refund quote. Check the source and add the exact passage manually.'}</div>}
          {kit.hasLockedEvidence && <div className="cancellationKitNotice muted">{uk ? 'У звіті є приховані умови. Шаблон містить тільки докази, які відкриті у вашому тарифі.' : 'Some report terms are locked. The template uses only evidence available in your plan.'}</div>}
        </section>

        <section className="cancellationKitLetter">
          <div className="cancellationKitSectionTitle"><span>03</span><h3>{uk ? 'Лист для копіювання' : 'Letter to copy'}</h3></div>
          <div className="cancellationKitSubject"><b>{uk ? 'Тема' : 'Subject'}</b><span>{kit.email.subject}</span></div>
          <label className="cancellationKitDraft"><span>{uk ? 'Перевірте та відредагуйте перед відправленням' : 'Review and edit before sending'}</span><textarea value={draft} onChange={event => setDraft(event.target.value)} rows={12}/></label>
          <div className="cancellationKitDisclaimer"><b>{uk ? 'Перед відправленням' : 'Before sending'}</b><p>{kit.placeholders} {kit.disclaimer}</p></div>
          {copyError && <p className="cancellationKitError" role="alert">{copyError}</p>}
          <div className="cancellationKitActions">
            <button type="button" className="cancellationKitCopy" onClick={() => void copyLetter()}>{copied ? <Check aria-hidden="true"/> : <Copy aria-hidden="true"/>}{copied ? (uk ? 'Скопійовано' : 'Copied') : (uk ? 'Скопіювати лист' : 'Copy letter')}</button>
            <button type="button" className="cancellationKitDownload" onClick={downloadLetter}><Download aria-hidden="true"/>{uk ? 'Завантажити .txt' : 'Download .txt'}</button>
            {kit.helpUrl && <a className="cancellationKitOpen" href={kit.helpUrl} target="_blank" rel="noopener noreferrer">{uk ? 'Відкрити інструкцію' : 'Open instructions'}<ArrowUpRight aria-hidden="true"/></a>}
          </div>
        </section>
      </div>
    </section>
  </div>;
}
