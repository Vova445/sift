import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bot, Braces, Code2, ExternalLink, KeyRound, ShieldCheck, Timer, Unplug } from 'lucide-react';
import ApiCodeBlock from './ApiCodeBlock';
import './api-docs.css';

const production = 'https://sift-app.reviewradar-vova445.workers.dev';
const endpoint = `${production}/api/v1/analyze`;
const curlExample = [
  'curl --request POST',
  `  --url '${endpoint}'`,
  "  --header 'Authorization: Bearer $SIFT_API_KEY'",
  "  --header 'Content-Type: application/json'",
  `  --data '{"url":"https://example.com/terms"}'`,
].join(' \\\n');
const javascriptExample = `const apiKey = process.env.SIFT_API_KEY;
const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url: 'https://example.com/terms' }),
});

const report = await response.json();
if (!response.ok) throw new Error(report.error);
console.log(report.score, report.verdict);`;
const responseExample = JSON.stringify({
  id: 'saved-report-id',
  url: 'https://example.com/terms',
  host: 'example.com',
  title: 'Terms of Use',
  score: 72,
  decision: 'wait',
  verdict: 'Почекати: частину умов не вдалося підтвердити.',
  prices: ['$12.99 per month'],
  findings: [{
    kind: 'renewal',
    title: 'Автоматичне продовження',
    summary: 'Підписка може автоматично поновлюватися.',
    evidence: 'Subscription automatically renews unless canceled.',
    confidence: 'high',
    sourceUrl: 'https://example.com/terms',
  }],
  unknowns: [],
}, null, 2);

const errors = [
  ['400', 'Некоректний JSON або відсутнє/невалідне поле url.', 'Перевірте тіло запиту: потрібен повний HTTP(S) URL.'],
  ['401', 'API-ключ відсутній, неправильний або відкликаний.', 'Передайте активний ключ у Bearer-заголовку.'],
  ['403', 'Email не підтверджений або тариф Pro не активний.', 'Підтвердіть email і перевірте підписку власника ключа.'],
  ['413', 'Тіло запиту перевищує 8 КБ.', 'Надішліть лише обов’язкове поле url.'],
  ['422', 'Сторінка не HTML або має замало доступного тексту.', 'Передайте публічну сторінку тарифів чи умов.'],
  ['429', 'Перевищено ліміт 30 запитів за хвилину.', 'Зачекайте кількість секунд із заголовка Retry-After.'],
  ['502', 'Сайт недоступний, відхилив запит або має небезпечне перенаправлення.', 'Перевірте адресу й повторіть пізніше.'],
  ['503', 'Тимчасово недоступні Sift, база чи лімітатор.', 'Повторіть запит пізніше з backoff.'],
  ['504', 'Сайт не відповів у межах 8 секунд.', 'Повторіть запит пізніше або перевірте іншу сторінку сервісу.'],
];

const contents = [
  ['key', 'API-ключ'],
  ['auth', 'Bearer-авторизація'],
  ['analyze', 'POST /api/v1/analyze'],
  ['errors', 'Коди відповідей'],
  ['limits', 'Ліміти запитів'],
  ['security', 'SSRF-захист'],
  ['telegram', 'Telegram'],
] as const;

export default function ApiDocsPage() {
  return <main className="apiDocsPage">
    <header className="apiDocsTop"><Link href="/dashboard/integrations"><ArrowLeft aria-hidden="true"/> Інтеграції</Link><Link href="/" className="apiDocsBrand"><span>S</span> SIFT <small>API</small></Link><a href="/api/v1/openapi.json">OpenAPI JSON <ExternalLink aria-hidden="true"/></a></header>
    <div className="apiDocsLayout">
      <aside className="apiDocsToc"><small>ЗМІСТ</small><nav aria-label="Зміст API документації">{contents.map(([id, label], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{label}</a>)}</nav><a className="apiDocsTocOpenApi" href="/api/v1/openapi.json">OpenAPI 3.1 <ExternalLink aria-hidden="true"/></a></aside>
      <div className="apiDocsWrap">
        <section className="apiDocsHero" id="top"><small>PUBLIC API · VERSION 1</small><h1>Вбудуйте перевірку Sift у свій процес.</h1><p>Надішліть публічну сторінку тарифу, умов чи оплати й отримайте збережений звіт із цінами, доказами та Clarity Score.</p><div><Link href="/dashboard/integrations" className="apiDocsPrimary">Створити API-ключ <ArrowRight aria-hidden="true"/></Link><span><ShieldCheck aria-hidden="true"/> Лише для активного Pro</span></div></section>

        <section className="apiDocsSection" id="key"><header><span><KeyRound aria-hidden="true"/></span><div><small>01 · ДОСТУП</small><h2>Створіть API-ключ</h2></div></header><p>У Dashboard → Інтеграції натисніть «Створити API-ключ». Вкажіть зрозумілу назву для сервера або середовища. Повне значення показується один раз; після закриття модалки його неможливо переглянути повторно.</p><Link href="/dashboard/integrations" className="apiDocsInlineLink">Керувати API-ключами <ArrowRight aria-hidden="true"/></Link><p className="apiDocsHint">Зберігайте ключ тільки на сервері або в менеджері секретів. Не додавайте його в браузерний код, мобільний клієнт чи репозиторій. Відкличте ключ у Dashboard, якщо він потрапив до сторонніх.</p></section>

        <section className="apiDocsSection" id="auth"><header><span className="purple"><ShieldCheck aria-hidden="true"/></span><div><small>02 · АВТОРИЗАЦІЯ</small><h2>Bearer-токен у заголовку</h2></div></header><p>Кожен запит має містити секретний ключ у заголовку <code>Authorization</code>. API перевіряє власника ключа на сервері, підтвердження email і активний Pro. Клієнт не може передати тариф або user ID.</p><ApiCodeBlock title="authorization" variants={[{ label: 'HTTP', language: 'http', code: 'Authorization: Bearer $SIFT_API_KEY' }]} /></section>

        <section className="apiDocsSection" id="analyze"><header><span className="purple"><Braces aria-hidden="true"/></span><div><small>03 · АНАЛІЗ</small><h2>POST /api/v1/analyze</h2></div></header><p>Передайте JSON із одним публічним URL. Поле <code>url</code> — обов’язкове, довжина до 2048 символів. Успішний звіт зберігається в історії акаунта власника API-ключа.</p><div className="apiDocsGrid"><article><small>ВХІДНІ ДАНІ</small><b>url · string</b><span>Повна адреса з http:// або https://</span></article><article><small>УСПІШНА ВІДПОВІДЬ</small><b>200 · Report</b><span>Score, вердикт, ціни та докази</span></article><article><small>АВТОРИЗАЦІЯ</small><b>Bearer API key</b><span>Потрібні підтверджений email і активний Pro</span></article></div><h3>Приклад запиту</h3><ApiCodeBlock title="request" variants={[{ label: 'curl', language: 'shell', code: curlExample }, { label: 'JavaScript', language: 'Node.js 20+', code: javascriptExample }]} /><h3>Приклад відповіді · 200</h3><ApiCodeBlock title="response" variants={[{ label: 'JSON', language: 'application/json', code: responseExample }]} /></section>

        <section className="apiDocsSection" id="errors"><header><span className="purple"><Code2 aria-hidden="true"/></span><div><small>04 · ВІДПОВІДІ</small><h2>Коди помилок</h2></div></header><p>У помилковій відповіді JSON містить поле <code>error</code> з коротким поясненням. Для 429 також повертається заголовок <code>Retry-After</code> у секундах.</p><div className="apiErrorTableWrap"><table className="apiErrorTable"><caption className="apiDocsVisuallyHidden">Коди HTTP-відповідей Sift API</caption><thead><tr><th scope="col">HTTP</th><th scope="col">Причина</th><th scope="col">Що робити</th></tr></thead><tbody>{errors.map(([status, meaning, action]) => <tr key={status}><th scope="row" data-label="HTTP"><code>{status}</code></th><td data-label="Причина">{meaning}</td><td data-label="Що робити">{action}</td></tr>)}</tbody></table></div></section>

        <section className="apiDocsSection" id="limits"><header><span><Timer aria-hidden="true"/></span><div><small>05 · КВОТА</small><h2>30 запитів за хвилину</h2></div></header><p>Ліміт Sift Pro застосовується на сервері до IP-адреси, акаунта й API-ключа. API й Telegram використовують спільний ліміт акаунта. У разі перевищення повертається <code>429 Too Many Requests</code> та <code>Retry-After</code>; дочекайтеся вказаного часу перед повтором.</p><div className="apiLimitCallout"><b>Порада</b><span>Для повторних спроб використовуйте exponential backoff і зупиняйте автоматичні повтори на 401 або 403.</span></div></section>

        <section className="apiDocsSection" id="security"><header><span className="purple"><ShieldCheck aria-hidden="true"/></span><div><small>06 · БЕЗПЕКА</small><h2>SSRF-захист та обмеження сторінки</h2></div></header><p>API приймає лише публічні HTTP(S) адреси на портах 80/443. Локальні й приватні IP, loopback, link-local та metadata-домени блокуються. Кожне перенаправлення повторно перевіряється; дозволено до трьох редиректів. Тіло API-запиту обмежене 8 КБ, завантажений HTML — 2 МБ, таймаут відповіді сайту — 8 секунд.</p><div className="apiDocsHint"><b>Межі аналізу</b><br/>Приймається HTML/XHTML із доступним текстом. Контент, який з’являється тільки після виконання JavaScript, може бути недоступний. DNS-адреси перевіряються повторно, однак Cloudflare Workers не надає механізму прив’язати fetch до перевіреної IP-адреси; тому захист зменшує ризик SSRF, але не є абсолютною гарантією проти будь-якого DNS-rebinding сценарію.</div></section>

        <section className="apiDocsSection" id="telegram"><header><span><Bot aria-hidden="true"/></span><div><small>07 · TELEGRAM</small><h2>Перевіряйте посилання в Telegram</h2></div></header><p>У Dashboard → Інтеграції створіть одноразове посилання для зв’язування Telegram. У приватному чаті надсилайте боту URL. Для групи до 10 людей власник спершу прив’язує акаунт, додає бота й дозволяє групу командою <code>/allowgroup</code>.</p><div className="apiTelegramCommands"><span><code>/allowgroup</code><small>Дозволити групу власнику</small></span><span><code>/disablegroup</code><small>Вимкнути груповий доступ</small></span><span><code>/unlink</code><small>Відв’язати Telegram</small></span></div><p className="apiDocsHint">Усі перевірки зберігаються в історії власника Sift Pro. Скасувати прив’язку також можна в <Link href="/dashboard/integrations">налаштуваннях інтеграцій</Link>.</p></section>

        <footer className="apiDocsFooter"><Link href="/dashboard/integrations"><Unplug aria-hidden="true"/>Керувати ключами й Telegram</Link><a href="/api/v1/openapi.json">Відкрити повну OpenAPI 3.1 схему <ExternalLink aria-hidden="true"/></a></footer>
      </div>
    </div>
  </main>;
}
