const PROVIDERS = [
  {
    id: 'netflix', name: 'Netflix',
    hosts: ['netflix.com'],
    helpUrl: 'https://help.netflix.com/en/node/407',
    helpLabel: 'Netflix: скасування підписки',
    steps: {
      uk: ['Відкрийте керування підпискою в акаунті Netflix.', 'Натисніть «Скасувати», потім підтвердьте «Завершити скасування».', 'Збережіть лист-підтвердження та перевірте дату завершення у Payment History. Якщо план оплачував партнер — скасуйте його через партнера.'],
      en: ['Open Manage your membership in your Netflix account.', 'Choose Cancel, then confirm Finish Cancellation.', 'Keep the confirmation email and check the end date in Payment History. If a partner bills the plan, cancel through that partner.'],
    },
  },
  {
    id: 'spotify', name: 'Spotify',
    hosts: ['spotify.com'],
    helpUrl: 'https://support.spotify.com/us/article/cancel-premium/',
    helpLabel: 'Spotify: скасування Premium',
    refundUrl: 'https://support.spotify.com/tt/article/refund-policy/',
    refundLabel: 'Spotify: правила повернення',
    steps: {
      uk: ['Відкрийте керування планом на сторінці акаунта Spotify.', 'Виберіть «Скасувати підписку» та підтвердьте дію.', 'Перевірте дату наступного списання. Якщо оплату проводить партнер, відкрийте розділ «Ваш план» і зверніться до нього.'],
      en: ['Open Manage your plan from your Spotify account page.', 'Choose Cancel subscription and confirm.', 'Check the next billing date. If a partner bills you, open Your plan and contact that partner.'],
    },
  },
  {
    id: 'coursera', name: 'Coursera',
    hosts: ['coursera.org', 'coursera.support'],
    helpUrl: 'https://www.coursera.support/s/article/learner-000001135?language=en_US',
    helpLabel: 'Coursera: скасування підписки',
    refundUrl: 'https://www.coursera.support/s/article/learner-000001486?language=en_US',
    refundLabel: 'Coursera: запит на повернення',
    steps: {
      uk: ['Відкрийте Purchases → Subscriptions та виберіть потрібну підписку.', 'Перед скасуванням запишіть дату наступного списання, потім натисніть Cancel subscription.', 'Для придатної річної Coursera Plus підписки відкрийте Purchase History → Request refund. За покупку в застосунку звертайтеся до Apple або Google Play.'],
      en: ['Open Purchases → Subscriptions and select the relevant plan.', 'Note the next billing date, then choose Cancel subscription.', 'For an eligible annual Coursera Plus plan, open Purchase History → Request refund. For an in-app purchase, use Apple or Google Play.'],
    },
  },
  {
    id: 'adobe', name: 'Adobe',
    hosts: ['adobe.com'],
    helpUrl: 'https://helpx.adobe.com/uk/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html',
    helpLabel: 'Adobe: скасування підписки',
    refundUrl: 'https://helpx.adobe.com/uk/account/individual/terms-policies-and-regulations/adobe-subscription-terms.html',
    refundLabel: 'Adobe: умови підписки та повернення',
    steps: {
      uk: ['Увійдіть у свій Adobe account і відкрийте Plans and payment.', 'Для потрібного плану виберіть Manage plan → Cancel your plan.', 'Перегляньте можливу плату за раннє припинення, пройдіть підтвердження і перевірте лист про скасування. Покупки через Apple, Google чи Microsoft скасовуйте у продавця.'],
      en: ['Sign in to your Adobe account and open Plans and payment.', 'For the relevant plan choose Manage plan → Cancel your plan.', 'Review any early termination fee, complete the confirmation steps, and check for the cancellation email. Plans bought through Apple, Google, or Microsoft must be canceled with that seller.'],
    },
  },
  {
    id: 'prime-video', name: 'Amazon Prime Video',
    hosts: ['primevideo.com', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.es', 'amazon.it', 'amazon.nl', 'amazon.pl', 'amazon.se', 'amazon.ca', 'amazon.co.jp'],
    helpUrl: 'https://www.primevideo.com/help?nodeId=GWGDSNXVPJ93UW5V&tag=900',
    helpLabel: 'Prime Video: скасування підписки',
    refundUrl: 'https://www.primevideo.com/help?nodeId=G202095490&tr=gh',
    refundLabel: 'Prime Video: правила підписки та повернення',
    steps: {
      uk: ['Відкрийте Account & Settings → Your Account.', 'Для окремої підписки Prime Video натисніть End Subscription. Якщо Prime Video входить до Amazon Prime, відкрийте Prime Membership → Edit on Amazon.', 'Якщо підписку оформили через мобільного оператора чи іншу платформу, скасуйте її там. Перевірте лист і дату завершення.'],
      en: ['Open Account & Settings → Your Account.', 'For a Prime Video-only subscription choose End Subscription. If Prime Video is part of Amazon Prime, open Prime Membership → Edit on Amazon.', 'If a mobile carrier or another platform bills you, cancel there. Keep the confirmation and check the end date.'],
    },
  },
];

const TEXT = {
  uk: {
    generic: 'Сервіс',
    unknownSteps: [
      'Увійдіть у сервіс напряму через його офіційний сайт або застосунок і відкрийте розділ акаунта, підписки чи оплат.',
      'Знайдіть потрібний тариф і використайте команду скасування. Перевірте останній екран підтвердження — видалення застосунку або вихід з акаунта зазвичай не зупиняє списання.',
      'Збережіть підтвердження, дату завершення доступу та останню квитанцію. Якщо платіж ішов через Apple, Google Play або іншого партнера, керуйте ним у того продавця.',
    ],
    subject: (provider) => `Запит щодо скасування підписки — ${provider}`,
    greeting: 'Добрий день!',
    request: 'Прошу вимкнути автопродовження та скасувати підписку [назва тарифу] для акаунта [email, прив’язаний до покупки]. Будь ласка, письмово підтвердіть скасування, дату завершення доступу та те, що наступні списання не проводитимуться.',
    refund: 'Також прошу перевірити, чи відповідає платіж [дата] на суму [сума й валюта] вашій опублікованій політиці повернення, та повідомити результат. Я розумію, що повернення залежить від типу покупки й чинних умов.',
    evidenceIntro: 'Нижче додаю фрагменти умов, які хочу уточнити:',
    noEvidence: 'У доступній частині звіту немає цитати про скасування чи повернення. Додайте її з першоджерела перед відправленням.',
    close: 'З повагою,\n[ім’я]',
    disclaimer: 'Це шаблон звернення, а не юридична порада і не гарантія скасування чи повернення. Перевірте умови, акаунт і спосіб оплати у сервісі перед відправленням.',
    sourceNote: 'Цитати взято зі збереженого звіту Sift. Перевірте їх на сторінці продавця перед копіюванням.',
    placeholders: 'Перед відправленням замініть поля у квадратних дужках і видаліть непотрібний абзац про повернення.',
  },
  en: {
    generic: 'Service',
    unknownSteps: [
      'Sign in directly through the service’s official website or app and open account, subscription, or billing settings.',
      'Find the plan and use its cancellation control. Read the final confirmation screen; signing out or deleting an app usually does not stop billing.',
      'Keep the confirmation, access end date, and latest receipt. If Apple, Google Play, or another partner billed you, manage the subscription with that seller.',
    ],
    subject: (provider) => `Subscription cancellation request — ${provider}`,
    greeting: 'Hello,',
    request: 'Please turn off auto-renewal and cancel the [plan name] subscription for the account [email associated with the purchase]. Please confirm the cancellation in writing, the access end date, and that no future renewals will be charged.',
    refund: 'Please also review whether the payment made on [date] for [amount and currency] qualifies under your published refund policy, and let me know the outcome. I understand eligibility depends on the purchase type and applicable terms.',
    evidenceIntro: 'I am including the following terms excerpts for clarification:',
    noEvidence: 'The accessible report does not contain a cancellation or refund excerpt. Add a verified excerpt from the source before sending.',
    close: 'Regards,\n[Name]',
    disclaimer: 'This is a communication template, not legal advice or a guarantee of cancellation or refund. Check the service account, payment route, and current terms before sending.',
    sourceNote: 'Quotes are from the saved Sift report. Verify them on the seller’s source page before copying.',
    placeholders: 'Replace bracketed fields and remove the refund paragraph if it does not apply.',
  },
};

const PROVIDER_LABELS = {
  uk: {
    netflix: { help: 'Netflix: скасування підписки' },
    spotify: { help: 'Spotify: скасування Premium', refund: 'Spotify: правила повернення' },
    coursera: { help: 'Coursera: скасування підписки', refund: 'Coursera: запит на повернення' },
    adobe: { help: 'Adobe: скасування підписки', refund: 'Adobe: умови підписки та повернення' },
    'prime-video': { help: 'Prime Video: скасування підписки', refund: 'Prime Video: правила підписки та повернення' },
  },
  en: {
    netflix: { help: 'Netflix: cancel membership' },
    spotify: { help: 'Spotify: cancel Premium', refund: 'Spotify: refund policy' },
    coursera: { help: 'Coursera: cancel a subscription', refund: 'Coursera: request a refund' },
    adobe: { help: 'Adobe: cancel a plan', refund: 'Adobe: subscription terms and refunds' },
    'prime-video': { help: 'Prime Video: cancel a subscription', refund: 'Prime Video: subscription and refund terms' },
  },
};

function isProviderHost(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function cancellationProviderForUrl(rawUrl) {
  let host = '';
  try { host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; }
  return PROVIDERS.find((provider) => provider.hosts.some((domain) => isProviderHost(host, domain))) || null;
}

function usableEvidence(report) {
  const allowed = new Set(['cancellation', 'renewal', 'refund', 'warning', 'trial']);
  const seen = new Set();
  return (Array.isArray(report?.findings) ? report.findings : [])
    .filter((finding) => allowed.has(finding?.kind) && typeof finding?.evidence === 'string')
    .map((finding) => finding.evidence.trim())
    .filter((evidence) => evidence && !/повний доказ доступний|full evidence available/i.test(evidence))
    .filter((evidence) => { const key = evidence.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 3)
    .map((text) => text.slice(0, 360));
}

export function buildCancellationKit(report, language = 'uk') {
  const locale = language === 'en' ? 'en' : 'uk';
  const text = TEXT[locale];
  const provider = cancellationProviderForUrl(report?.url);
  const providerName = provider?.name || report?.host || text.generic;
  const evidence = usableEvidence(report);
  const refundParagraph = text.refund;
  const quotedEvidence = evidence.length
    ? `${text.evidenceIntro}\n${evidence.map((item) => `“${item}”`).join('\n')}`
    : text.noEvidence;
  const body = [
    text.greeting,
    '',
    text.request,
    '',
    refundParagraph,
    '',
    quotedEvidence,
    '',
    text.close,
  ].join('\n');
  return {
    providerId: provider?.id || null,
    providerName,
    language: locale,
    helpUrl: provider?.helpUrl || null,
    helpLabel: provider ? PROVIDER_LABELS[locale][provider.id]?.help || provider.helpLabel : null,
    refundUrl: provider?.refundUrl || null,
    refundLabel: provider?.refundUrl ? PROVIDER_LABELS[locale][provider.id]?.refund || provider.refundLabel : null,
    steps: provider?.steps[locale] || text.unknownSteps,
    evidence,
    hasLockedEvidence: Number(report?.lockedCount || 0) > 0,
    disclaimer: text.disclaimer,
    sourceNote: text.sourceNote,
    placeholders: text.placeholders,
    email: {
      subject: text.subject(providerName),
      body,
    },
  };
}
