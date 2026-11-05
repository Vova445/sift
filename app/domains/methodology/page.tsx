import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowDown,ArrowLeft,ArrowRight,CheckCircle2,Clock3,Info,ShieldCheck,UsersRound} from 'lucide-react';
import {pageMetadata} from '../../../lib/seo';
import '../domain-index.css';

export const metadata:Metadata=pageMetadata('/domains/methodology','Методологія індексу прозорості умов — Sift','Як Sift зводить найновіші звіти незалежних акаунтів, застосовує поріг публікації та показує обмеження автоматичного аналізу.');

const sections=[
  {id:'what-we-measure',label:'Що вимірює індекс'},
  {id:'how-we-average',label:'Як зводяться звіти'},
  {id:'publication-threshold',label:'Поріг і актуальність'},
  {id:'analysis-limits',label:'Межі автоматичного аналізу'},
  {id:'corrections',label:'Відповідь і виправлення'},
];

export default function DomainIndexMethodologyPage(){
  return <main className="domainIndexPage">
    <header className="domainIndexNav">
      <Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link>
      <nav aria-label="Основна навігація"><Link href="/domains">Індекс доменів <ArrowRight aria-hidden="true"/></Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav>
    </header>
    <div className="domainMethodLayout">
      <nav className="domainMethodToc" aria-label="Зміст методології">
        <strong>ЗМІСТ</strong>
        <ol>{sections.map((section,index)=><li key={section.id}><a href={`#${section.id}`}><span>{String(index+1).padStart(2,'0')}</span>{section.label}</a></li>)}</ol>
      </nav>
      <article className="domainMethodology">
        <small className="domainMethodEyebrow">ВІДКРИТА МЕТОДОЛОГІЯ · ОНОВЛЕНО 2026</small>
        <h1>Як читати<br/><em>індекс Sift</em></h1>
        <p className="domainMethodLead">Індекс підсумовує, які важливі умови Sift зміг знайти у доступних сторінках сервісу. Він описує повноту знайденої інформації, а не чесність, законність чи якість компанії.</p>

        <section id="what-we-measure" aria-labelledby="method-what-title">
          <h2 id="method-what-title"><span className="domainMethodSectionIcon"><CheckCircle2 aria-hidden="true"/></span><span><small>01 / ПОКАЗНИК</small>Що вимірює індекс</span></h2>
          <p>Для кожного домену Sift зводить оцінки повноти умов від незалежних акаунтів. У звіті перевіряються ціна, автопродовження, скасування, повернення, пробний період, штрафні та неповоротні платежі. Середнє значення Clarity Score показує, наскільки повними були доступні дані у цих звітах.</p>
          <div className="domainMethodCallout domainMethodCallout--neutral"><Info aria-hidden="true"/><p><b>Це не рейтинг чесності.</b> Високий бал не підтверджує вигідність пропозиції, а низький не доводить порушення. Перевірте конкретні умови й першоджерела перед оплатою.</p></div>
        </section>

        <section id="how-we-average" aria-labelledby="method-average-title">
          <h2 id="method-average-title"><span className="domainMethodSectionIcon"><UsersRound aria-hidden="true"/></span><span><small>02 / ОБЧИСЛЕННЯ</small>Як зводяться звіти</span></h2>
          <p>Повторні перевірки одного акаунта не збільшують кількість незалежних голосів. Для домену зберігається його найновіший внесок у межах актуального періоду, після чого оцінки усіх акаунтів усереднюються.</p>
          <figure className="domainMethodFlow" aria-label="Звіти акаунта зводяться до його останнього звіту, а потім до агрегату домену">
            <div className="domainMethodFlowStep"><span>1</span><small>ОДИН АКАУНТ</small><b>Усі його звіти</b><p>Повторні перевірки того самого домену.</p></div>
            <ArrowRight className="domainMethodFlowArrow" aria-hidden="true"/>
            <ArrowDown className="domainMethodFlowDown" aria-hidden="true"/>
            <div className="domainMethodFlowStep domainMethodFlowStep--latest"><span>2</span><small>ОДИН ВНЕСОК</small><b>Останній звіт</b><p>Залишається найновіший звіт акаунта для цього домену.</p></div>
            <ArrowRight className="domainMethodFlowArrow" aria-hidden="true"/>
            <ArrowDown className="domainMethodFlowDown" aria-hidden="true"/>
            <div className="domainMethodFlowStep domainMethodFlowStep--aggregate"><span>3</span><small>ДОМЕН</small><b>Агрегат акаунтів</b><p>Середнє оцінок і частка знайдених сигналів.</p></div>
          </figure>
          <div className="domainMethodFormula"><span>Clarity Score домену</span><b>округлене середнє останніх оцінок незалежних акаунтів</b></div>
          <p className="domainMethodFineprint">Для кожного типу умови окремо показується частка акаунтів, у чиїх останніх звітах цей сигнал було знайдено. Це частота знайдених сигналів у вибірці, а не підтвердження, що умова є або відсутня в усіх пропозиціях.</p>
        </section>

        <section id="publication-threshold" aria-labelledby="method-threshold-title">
          <h2 id="method-threshold-title"><span className="domainMethodSectionIcon"><Clock3 aria-hidden="true"/></span><span><small>03 / ПУБЛІКАЦІЯ</small>Поріг і актуальність</span></h2>
          <p>Публічний профіль з’являється лише тоді, коли для домену є щонайменше п’ять незалежних акаунтів з актуальними внесками. Якщо поріг не досягнуто, сторінка профілю пояснює, чому даних поки недостатньо.</p>
          <div className="domainMethodFactGrid">
            <aside className="domainMethodFact"><span>МІНІМУМ ДЛЯ ПУБЛІКАЦІЇ</span><b>5 акаунтів</b><p>Один акаунт дає не більше одного актуального внеску на домен.</p></aside>
            <aside className="domainMethodFact"><span>ПЕРІОД АКТУАЛЬНОСТІ</span><b>12 місяців</b><p>Старі внески не входять до поточного публічного агрегату.</p></aside>
          </div>
          <div className="domainMethodCallout domainMethodCallout--amber"><Info aria-hidden="true"/><p><b>Розмір вибірки впливає на впевненість.</b> 5–9 акаунтів — обмежена, 10–29 — помірна, 30 і більше — вища статистична впевненість. Це градація обсягу даних, а не гарантія точності.</p></div>
        </section>

        <section id="analysis-limits" aria-labelledby="method-limits-title">
          <h2 id="method-limits-title"><span className="domainMethodSectionIcon"><ShieldCheck aria-hidden="true"/></span><span><small>04 / ОБМЕЖЕННЯ</small>Межі автоматичного аналізу</span></h2>
          <p>Sift аналізує текст, доступний під час перевірки. Він може не побачити умови, які завантажуються JavaScript, залежать від країни, акаунта чи вибраного плану, або приховані за входом. Ціни, валюти й правила можуть змінитися після перевірки.</p>
          <div className="domainMethodCallout domainMethodCallout--warning"><Info aria-hidden="true"/><p><b>«Не знайдено» не означає «відсутнє».</b> Автоматичний аналіз може помилятися або пропускати текст. Перейдіть до першоджерела й звірте умови для власної пропозиції. Індекс не є юридичною порадою.</p></div>
        </section>

        <section id="corrections" aria-labelledby="method-corrections-title">
          <h2 id="method-corrections-title"><span className="domainMethodSectionIcon"><ShieldCheck aria-hidden="true"/></span><span><small>05 / ЗВОРОТНИЙ ЗВ’ЯЗОК</small>Відповідь і виправлення</span></h2>
          <p>Представник сервісу може надіслати уточнення з посиланням на офіційне джерело. Команда Sift перевіряє повноваження заявника й матеріали вручну. Опублікована відповідь позначається окремо та не змінює агрегований Score автоматично.</p>
          <p>Участь користувачів в індексі добровільна й вимкнена за замовчуванням. Її можна відкликати в Dashboard; тоді внесок акаунта видаляється з індексу. Публічно не показуються email, повна адреса сторінки, цитати чи текст звіту.</p>
          <div className="domainMethodLinks"><Link href="/domains/respond">Подати уточнення від представника <ArrowRight aria-hidden="true"/></Link><Link href="/privacy">Як Sift обробляє дані <ArrowRight aria-hidden="true"/></Link></div>
        </section>

        <footer className="domainMethodEndnote"><Info aria-hidden="true"/><p>Методологія пояснює поточні правила агрегування. Умови конкретної покупки завжди звіряйте на сайті продавця.</p></footer>
        <Link className="domainMethodBack" href="/domains">Повернутися до індексу <ArrowRight aria-hidden="true"/></Link>
      </article>
    </div>
    <footer className="domainIndexFooter"><span>© AVEIron · інформаційний інструмент</span><Link href="/privacy">Приватність</Link><Link href="/terms">Умови</Link></footer>
  </main>;
}
