(() => {
  const CHECKOUT_PATH = /(?:^|\/)(?:checkouts?|checkoutnow|checkout[-_](?:external|now|flow|session|payment|review|confirm)|pay|payments?|billing|orders?|cart|bag|purchases?|subscribe|subscriptions?|confirm)(?:\/|$)/i;
  const CHECKOUT_TITLE = /\b(?:checkout|check out|payment|pay now|place (?:your )?order|complete (?:your )?(?:purchase|order)|confirm (?:and )?(?:pay|order)|subscribe)\b/i;
  const SIFT_ORIGIN = 'https://sift-app.reviewradar-vova445.workers.dev';

  function isCheckoutPage(rawUrl, title = '') {
    let url;
    try { url = new URL(rawUrl); } catch { return false; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const pageTitle = String(title).trim();
    const editorialTitle = /^(?:how to|guide(?: to)?|what is|learn about|blog|article)\b/i.test(pageTitle);
    return CHECKOUT_PATH.test(url.pathname) || (!editorialTitle && CHECKOUT_TITLE.test(pageTitle));
  }

  function sanitizeCheckoutUrl(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { return null; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.split('/').map((segment) => {
      const secretLike = segment.length >= 24
        || /^\d{7,}$/.test(segment)
        || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(segment)
        || /^(?:cs_(?:live|test)_|sess_|token_)/i.test(segment);
      return secretLike ? '[redacted]' : segment;
    }).join('/');
    return url.toString();
  }

  function createSiftUrl(rawUrl, appOrigin = SIFT_ORIGIN) {
    const safeUrl = sanitizeCheckoutUrl(rawUrl);
    if (!safeUrl) return null;
    let app;
    try { app = new URL(appOrigin); } catch { return null; }
    const isLocalApp = (app.hostname === '127.0.0.1' || app.hostname === 'localhost')
      && (app.protocol === 'http:' || app.protocol === 'https:');
    if (app.origin !== SIFT_ORIGIN && !isLocalApp) return null;
    app.pathname = '/';
    app.search = '';
    app.hash = new URLSearchParams({ 'sift-scan': safeUrl }).toString();
    return app.toString();
  }

  const api = { isCheckoutPage, sanitizeCheckoutUrl, createSiftUrl };
  globalThis.SiftCheckoutDetector = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
