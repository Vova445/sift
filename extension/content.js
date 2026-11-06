(() => {
  const detector = globalThis.SiftCheckoutDetector;
  if (!detector || globalThis.__siftCheckoutDetectorStarted) return;
  globalThis.__siftCheckoutDetectorStarted = true;

  const ROOT_ID = 'sift-checkout-detector-root';
  const isEnglish = (navigator.language || 'uk').toLowerCase().startsWith('en');
  let activePageKey = '';
  let dismissedPageKey = '';

  function currentPageKey() {
    return `${location.origin}${location.pathname}`;
  }

  function removePrompt() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function addPrompt(safeUrl, pageKey) {
    removePrompt();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-sift-checkout-prompt', 'true');
    const shadow = root.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;position:fixed;top:14px;left:50%;z-index:2147483647;transform:translateX(-50%);width:min(460px,calc(100vw - 24px));font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151812}
      *,*::before,*::after{box-sizing:border-box}
      .card{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr) 32px;gap:12px;align-items:start;padding:15px 15px 14px;background:#fbfcf8;border:1px solid #dce1d9;border-radius:16px;box-shadow:0 18px 55px rgba(15,20,13,.2)}
      .mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#b9f353;color:#11150e;font-size:20px;font-weight:950;letter-spacing:-.08em}
      .copy{display:grid;gap:5px;min-width:0;padding-top:1px}
      .eyebrow{font-size:8px;line-height:1.3;letter-spacing:.15em;font-weight:900;color:#687166;text-transform:uppercase}
      .title{font-size:14px;line-height:1.3;font-weight:850;letter-spacing:-.025em}
      .body{font-size:11px;line-height:1.45;color:#687166}
      .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
      .go{min-height:38px;display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:9px 13px;border-radius:9px;background:#11150e;color:white;text-decoration:none;font-size:10px;font-weight:850;transition:background .15s ease}
      .go:hover{background:#30372d}
      .go svg{width:14px;height:14px;flex:none}
      .privacy{font-size:9px;color:#657064}
      .close{width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#edf0e9;color:#30372d;cursor:pointer}
      .close:hover{background:#dfe5dc}
      .close svg{width:15px;height:15px}
      @media(max-width:480px){:host{top:8px;width:calc(100vw - 16px)}.card{grid-template-columns:34px minmax(0,1fr) 30px;gap:9px;padding:12px;border-radius:13px}.mark{width:34px;height:34px;border-radius:10px}.title{font-size:13px}.body{font-size:10px}.close{width:30px;height:30px}.actions{gap:8px}.go{min-height:42px}}
      @media(prefers-reduced-motion:reduce){.go{transition:none}}
    `;

    const card = document.createElement('aside');
    card.className = 'card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-labelledby', 'sift-checkout-title');

    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'S';

    const copy = document.createElement('div');
    copy.className = 'copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = isEnglish ? 'SIFT · BEFORE YOU PAY' : 'SIFT · ПЕРЕВІРКА ПЕРЕД ОПЛАТОЮ';
    const title = document.createElement('strong');
    title.id = 'sift-checkout-title';
    title.className = 'title';
    title.textContent = isEnglish ? 'About to pay? Check the terms first.' : 'Плануєте оплатити? Перевірте умови спершу.';
    const body = document.createElement('span');
    body.className = 'body';
    body.textContent = isEnglish ? 'Sift checks pricing, renewals and cancellation terms. Form fields are never read.' : 'Sift перевірить ціну, автопродовження й скасування. Дані полів не читаються.';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const link = document.createElement('a');
    link.className = 'go';
    link.textContent = isEnglish ? 'Check with Sift' : 'Перевірити в Sift';
    link.href = detector.createSiftUrl(safeUrl);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    link.addEventListener('click', () => {
      dismissedPageKey = pageKey;
      window.setTimeout(removePrompt, 100);
    }, { once: true });
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    arrow.setAttribute('aria-hidden', 'true');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M5 12h14M12 5l7 7-7 7');
    arrow.append(arrowPath);
    link.append(arrow);
    const privacy = document.createElement('span');
    privacy.className = 'privacy';
    privacy.textContent = new URL(safeUrl).host;
    actions.append(link, privacy);
    copy.append(eyebrow, title, body, actions);

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.setAttribute('aria-label', isEnglish ? 'Dismiss Sift prompt' : 'Закрити підказку Sift');
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
    close.addEventListener('click', () => {
      dismissedPageKey = pageKey;
      removePrompt();
    });

    card.append(mark, copy, close);
    shadow.append(style, card);
    document.documentElement.append(root);
  }

  function evaluatePage() {
    const pageKey = currentPageKey();
    if (pageKey !== activePageKey) {
      activePageKey = pageKey;
      if (dismissedPageKey !== pageKey) dismissedPageKey = '';
    }
    if (!detector.isCheckoutPage(location.href, document.title) || dismissedPageKey === pageKey) {
      removePrompt();
      return;
    }
    const safeUrl = detector.sanitizeCheckoutUrl(location.href);
    if (safeUrl && !document.getElementById(ROOT_ID)) addPrompt(safeUrl, pageKey);
  }

  evaluatePage();
  window.setInterval(evaluatePage, 1200);
  const headObserver = new MutationObserver(evaluatePage);
  if (document.head) headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
})();
