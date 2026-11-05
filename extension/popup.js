(() => {
  const browserApi = globalThis.browser || globalThis.chrome;
  const enableButton = document.getElementById('enable-site');
  const siteTitle = document.getElementById('site-title');
  const siteStatus = document.getElementById('site-status');
  const feedback = document.getElementById('feedback');
  let currentTab = null;
  let matchPattern = '';
  let scriptId = '';

  function callApi(namespace, method, ...args) {
    const apiMethod = browserApi?.[namespace]?.[method];
    if (typeof apiMethod !== 'function') return Promise.reject(new Error(`${namespace}.${method} is unavailable`));
    if (globalThis.browser) return Promise.resolve(apiMethod.apply(browserApi[namespace], args));
    return new Promise((resolve, reject) => {
      apiMethod.call(browserApi[namespace], ...args, (result) => {
        const error = browserApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    });
  }

  function showFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error', error);
  }

  function registeredScriptId(url) {
    const scheme = url.protocol === 'https:' ? 'secure' : 'plain';
    return `sift-checkout-${scheme}-${url.hostname.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`.slice(0, 180);
  }

  async function initialize() {
    try {
      const tabs = await callApi('tabs', 'query', { active: true, currentWindow: true });
      currentTab = tabs?.[0] || null;
      if (!currentTab?.url || !currentTab.id) {
        siteTitle.textContent = 'Немає доступної вкладки';
        siteStatus.textContent = 'Відкрийте звичайну вебсторінку та відкрийте розширення ще раз.';
        return;
      }
      const url = new URL(currentTab.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        siteTitle.textContent = 'Ця сторінка недоступна';
        siteStatus.textContent = 'Браузер не дозволяє розширенням працювати на внутрішніх сторінках.';
        return;
      }
      if (url.hostname === 'sift-app.reviewradar-vova445.workers.dev') {
        siteTitle.textContent = 'Ви вже у Sift';
        siteStatus.textContent = 'Поверніться на сторінку, де збираєтеся платити.';
        return;
      }
      currentTab = { id: currentTab.id };
      matchPattern = `${url.protocol}//${url.hostname}/*`;
      scriptId = registeredScriptId(url);
      siteTitle.textContent = url.host;
      enableButton.disabled = false;
      const granted = await callApi('permissions', 'contains', { origins: [matchPattern] });
      const registered = await callApi('scripting', 'getRegisteredContentScripts', { ids: [scriptId] });
      if (granted && registered?.length) {
        siteStatus.textContent = 'Детектор уже дозволений для цього сайту. Форми не читаються.';
        enableButton.textContent = 'Перевірити цей сайт зараз →';
      }
    } catch (error) {
      siteTitle.textContent = 'Не вдалося перевірити вкладку';
      siteStatus.textContent = 'Закрийте меню розширення й відкрийте його ще раз.';
      showFeedback(error instanceof Error ? error.message : 'Помилка доступу до вкладки.', true);
    }
  }

  async function enableOnSite() {
    if (!currentTab?.id || !matchPattern || !scriptId) return;
    enableButton.disabled = true;
    showFeedback('Запитуємо дозвіл тільки для поточного сайту…');
    try {
      const granted = await callApi('permissions', 'request', { origins: [matchPattern] });
      if (!granted) {
        showFeedback('Дозвіл не надано. Без нього розширення не сканує сторінку.', true);
        enableButton.disabled = false;
        return;
      }

      const registered = await callApi('scripting', 'getRegisteredContentScripts', { ids: [scriptId] });
      if (!registered?.length) {
        await callApi('scripting', 'registerContentScripts', [{
          id: scriptId,
          matches: [matchPattern],
          js: ['checkout-detector.js', 'content.js'],
          runAt: 'document_idle',
          persistAcrossSessions: true,
        }]);
      }
      await callApi('scripting', 'executeScript', {
        target: { tabId: currentTab.id },
        files: ['checkout-detector.js', 'content.js'],
      });
      siteStatus.textContent = 'Дозвіл увімкнено лише для цього сайту. Форми не читаються.';
      enableButton.textContent = 'Детектор увімкнено ✓';
      showFeedback('На checkout-сторінці з’явиться підказка Sift.');
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Не вдалося активувати детектор.', true);
      enableButton.disabled = false;
    }
  }

  enableButton.addEventListener('click', () => void enableOnSite());
  void initialize();
})();
