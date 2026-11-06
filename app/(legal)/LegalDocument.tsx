import {Children,cloneElement,isValidElement,type ReactElement,type ReactNode} from 'react';

export type LegalSection={title:string;children:ReactNode};

function plainText(node:ReactNode):string{
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(Array.isArray(node))return node.map(plainText).join('');
  if(isValidElement<{children?:ReactNode}>(node))return plainText(node.props.children);
  return '';
}

export default function LegalDocument({label,title,lead,children}:{label:string;title:string;lead:string;children:ReactNode}){
  const sections=Children.toArray(children).map((child,index)=>{
    const id=`legal-section-${index+1}`;
    const sectionChild=Children.toArray(isValidElement<{children?:ReactNode}>(child)?child.props.children:null);
    const heading=sectionChild.find(item=>isValidElement<{children?:ReactNode}>(item)&&item.type==='h2');
    const headingText=heading&&isValidElement<{children?:ReactNode}>(heading)?plainText(heading.props.children):`Розділ ${index+1}`;
    const node=isValidElement<{id?:string}>(child)?cloneElement(child as ReactElement<{id?:string}>,{id}):child;
    return {id,title:headingText,node};
  });
  return <main className="legalDocument"><div className="legalHero"><span className="legalEyebrow"><i/> {label} · SIFT</span><h1>{title}</h1><p>{lead}</p><div className="legalMeta"><span>Версія 1.0.0</span><span>Чинна з 2 листопада 2026 року</span></div></div>
    <aside className="legalDisclaimer"><span aria-hidden="true">!</span><p><b>Потрібна юридична перевірка.</b> Це автоматично підготовлена інформація про роботу Sift, а не юридична порада чи документ, написаний юристом. Перед комерційним запуском текст має перевірити фахівець.</p></aside>
    <div className="legalDocLayout"><nav className="legalContents" aria-label={`Зміст: ${title}`}><b>ЗМІСТ</b>{sections.map((section,index)=><a href={`#${section.id}`} key={section.id}><span>{String(index+1).padStart(2,'0')}</span>{section.title.replace(/^\d+\.\s*/,'')}</a>)}</nav><article className="legalBody">{sections.map(section=>section.node)}</article></div>
    <a className="legalSupport" href="mailto:support@sift.app"><span><small>Є питання щодо цього документа?</small><b>Напишіть команді Sift</b></span><strong>support@sift.app <i>↗</i></strong></a>
  </main>;
}
