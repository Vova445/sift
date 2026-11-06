import { cleanPageHtml, evaluateClarity, extractPurchaseTerms, unresolvedConditions } from './analyzer-core.js';
import { resolvePublicTarget, SsrfPolicyError, validateTarget } from './ssrf-policy.js';

export type Finding = {
  kind: 'renewal' | 'refund' | 'cancellation' | 'trial' | 'price' | 'penalty' | 'warning';
  title: string;
  summary: string;
  evidence: string;
  severity: 'good' | 'medium' | 'high';
  confidence: 'high' | 'medium' | 'low';
  sourceUrl: string;
};
export type UnresolvedCondition = { kind: string; title: string; confidence: 'low'; summary: string; evidence: ''; sourceUrl: string; unresolved: true };
export type PurchaseDecision = 'buy' | 'wait' | 'close';
export { evaluateClarity };

export class AnalyzerError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function safeUrl(raw: string) {
  try {
    return validateTarget(raw);
  } catch (error) {
    if (error instanceof SsrfPolicyError) throw new AnalyzerError(error.message, error.status);
    throw error;
  }
}

async function readBounded(response: Response, maxBytes: number) {
  const tooLarge = () => new AnalyzerError('Сторінка завелика для безпечної перевірки (ліміт 2 МБ).', 413);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) throw tooLarge();
    return text;
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      parts.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}

type AnalyzeDependencies = { fetchImpl?: typeof fetch; dnsFetchImpl?: typeof fetch; timeoutMs?: number };

export async function analyzeUrl(raw: string, dependencies: AnalyzeDependencies = {}) {
  const outboundFetch = dependencies.fetchImpl || fetch;
  const dnsFetch = dependencies.dnsFetchImpl || dependencies.fetchImpl || fetch;
  const timeoutMs = dependencies.timeoutMs ?? 8000;
  let current = safeUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;

  try {
    let redirects = 0;
    while (true) {
      current = safeUrl(current.toString());
      try {
        await resolvePublicTarget(current, { fetchImpl: dnsFetch, signal: controller.signal });
        response = await outboundFetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; SiftPreflight/1.0)',
            accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch (error) {
        if (error instanceof SsrfPolicyError) throw new AnalyzerError(error.message, error.status);
        if (controller.signal.aborted) throw new AnalyzerError('Сайт не відповів за 8 секунд. Спробуйте пізніше.', 504);
        throw new AnalyzerError('Не вдалося завантажити сайт: він може блокувати автоматичні запити або бути недоступним.', 502);
      }

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        if (redirects >= 3) throw new AnalyzerError('Забагато перенаправлень (максимум 3). Відкрийте кінцеву адресу сайту й спробуйте ще раз.', 502);
        const location = response.headers.get('location');
        if (!location) throw new AnalyzerError('Сайт перенаправив запит без адреси призначення.', 502);
        try {
          current = safeUrl(new URL(location, current).toString());
        } catch (error) {
          if (error instanceof AnalyzerError) throw new AnalyzerError(`Небезпечне перенаправлення заблоковано: ${error.message}`, 400);
          throw error;
        }
        redirects++;
        continue;
      }
      break;
    }

    if (!response) throw new AnalyzerError('Сайт не повернув відповідь.', 502);
    if (!response.ok) throw new AnalyzerError(`Сайт недоступний: HTTP ${response.status}.`, 502);
    const type = response.headers.get('content-type') || '';
    if (!/^\s*(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(type)) {
      await response.body?.cancel();
      throw new AnalyzerError('Це не HTML-сторінка, тому її умови неможливо прочитати.', 422);
    }

    const html = await readBounded(response, 2 * 1024 * 1024);
    const text = cleanPageHtml(html);
    const wordCount = text ? text.split(/\s+/).length : 0;
    const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || current.hostname;
    const title = cleanPageHtml(rawTitle);
    if (wordCount < 80) {
      if (/enable javascript|javascript is required|перегляньте у браузері|requires javascript|unsupported client/i.test(`${text} ${title}`) || wordCount < 20) {
        throw new AnalyzerError('Сторінка майже не містить доступного тексту (ймовірно, контент завантажується JavaScript або захистом сайту). Перевірте іншу сторінку з умовами чи тарифами.', 422);
      }
      throw new AnalyzerError('На сторінці замало тексту, щоб достовірно перевірити умови.', 422);
    }

    const requestedPath = safeUrl(raw).pathname;
    const expectsDocument = /terms?|legal|policy|conditions|pricing|plans?|purchasepolicy|help\/article/i.test(requestedPath);
    const genericTitle = /unsupported client|vacation rentals|online courses\s*[-–|]|amazon\.com:\s*online shopping|spotify\s*[-–|]\s*web player/i.test(title);
    if (expectsDocument && genericTitle) {
      throw new AnalyzerError('Сайт повернув загальну або не ту сторінку замість запитаної. Відкрийте умови/тариф у звичайному браузері й скопіюйте кінцеве посилання.', 422);
    }

    const extracted = extractPurchaseTerms(text);
    const findings = extracted.findings.map((finding) => ({ ...finding, confidence: finding.confidence || 'medium' as const, sourceUrl: current.toString() }));
    const unknowns = unresolvedConditions(findings, extracted.prices, extracted.priceDetails, current.toString());
    const evaluation = evaluateClarity(findings, extracted.prices);
    return {
      url: current.toString(),
      host: current.hostname,
      title: title.slice(0, 140),
      checkedAt: new Date().toISOString(),
      ...evaluation,
      prices: extracted.prices,
      priceDetails: extracted.priceDetails,
      findings,
      unknowns,
      wordCount,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new AnalyzerError('Сайт не відповів за 8 секунд. Спробуйте пізніше.', 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
