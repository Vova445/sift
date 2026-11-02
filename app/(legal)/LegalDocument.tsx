import type {ReactNode} from 'react';

export type LegalSection={title:string;children:ReactNode};

export default function LegalDocument({label,title,lead,children}:{label:string;title:string;lead:string;children:ReactNode}){
  return <main className="legalDocument"><div className="legalHero"><span className="legalEyebrow"><i/> {label} · SIFT</span><h1>{title}</h1><p>{lead}</p><div className="legalMeta"><span>Версія 1.0.0</span><span>Чинна з 2 листопада 2026 року</span></div></div>
    <aside className="legalDisclaimer"><span>ℹ</span><p><b>Важливо:</b> Sift дає автоматичне інформаційне пояснення умов, а не юридичну пораду чи правовий висновок. Цей текст описує поточну роботу продукту й є проєктом політики, а не документом від юриста. Оператор зазначений як AVEIron; поштову адресу не публікуємо за запитом власника. Перед комерційним запуском текст має перевірити юрист.</p></aside>
    <article className="legalBody">{children}</article>
    <a className="legalSupport" href="mailto:support@sift.app"><span><small>Є питання щодо цього документа?</small><b>Напишіть команді Sift</b></span><strong>support@sift.app <i>↗</i></strong></a>
  </main>;
}
