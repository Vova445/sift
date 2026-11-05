export const DARK_PATTERN_CATEGORIES = Object.freeze(Object.assign(Object.create(null), {
  prechecked_option: 'Заздалегідь вибрані опції',
  fake_urgency_timer: 'Таймер терміновості',
  hidden_fees: 'Приховані збори',
  cancellation_obstruction: 'Ускладнене скасування',
  confirmshaming: 'Тиск через сором',
  false_scarcity: 'Непідтверджений дефіцит',
  misdirection: 'Відволікання від вибору',
}));

export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_SCREENSHOT_PIXELS = 20_000_000;
export const DARK_PATTERN_MODEL = '@cf/qwen/qwen3.8-27b';

function readU24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function imageDimensions(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      }
      offset += length;
    }
    return null;
  }

  if (mime === 'image/webp') {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: readU24LE(bytes, 24) + 1, height: readU24LE(bytes, 27) + 1 };
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: ((bytes[27] << 8) | bytes[26]) & 0x3fff, height: ((bytes[29] << 8) | bytes[28]) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return { width: 1 + b0 + ((b1 & 0x3f) << 8), height: 1 + ((b1 >> 6) & 0x03) + (b2 << 2) + ((b3 & 0x0f) << 10) };
    }
  }
  return null;
}

export function inspectScreenshot(bytes, declaredType = '') {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return { ok: false, reason: 'too_large' };

  let mime = '';
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) mime = 'image/png';
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) mime = 'image/jpeg';
  else if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') mime = 'image/webp';
  if (!mime || (declaredType && declaredType !== mime)) return { ok: false, reason: 'unsupported_type' };

  const dimensions = imageDimensions(bytes, mime);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) return { ok: false, reason: 'invalid_image' };
  if (dimensions.width * dimensions.height > MAX_SCREENSHOT_PIXELS) return { ok: false, reason: 'too_many_pixels' };
  return { ok: true, mime, ...dimensions };
}

export function darkPatternDailyLimit(plan) {
  if (plan === 'pro') return 10;
  if (plan === 'one') return 3;
  return 1;
}

const text = (value, max) => typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const boundedNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;

function modelText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const result = value;
  if (typeof result.response === 'string') return result.response;
  if (typeof result.result === 'string') return result.result;
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  if (choice?.message && typeof choice.message.content === 'string') return choice.message.content;
  if (typeof choice?.text === 'string') return choice.text;
  return '';
}

export function parseDarkPatternFindings(value) {
  let candidate = modelText(value);
  if (!candidate && value && typeof value === 'object' && Array.isArray(value.findings)) return sanitizeDarkPatternFindings(value.findings);
  candidate = candidate.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = candidate.indexOf('{'), end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!parsed || !Array.isArray(parsed.findings)) return null;
    return sanitizeDarkPatternFindings(parsed.findings);
  } catch { return null; }
}

export function sanitizeDarkPatternFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.slice(0, 12).flatMap((finding, index) => {
    if (!finding || typeof finding !== 'object' || !Object.hasOwn(DARK_PATTERN_CATEGORIES, finding.category)) return [];
    const box = finding.bbox;
    if (!box || typeof box !== 'object') return [];
    const x = boundedNumber(box.x, 0, 1000), y = boundedNumber(box.y, 0, 1000);
    const width = boundedNumber(box.width, 0, 1000), height = boundedNumber(box.height, 0, 1000);
    const confidence = boundedNumber(finding.confidence, 0, 1);
    const evidence = text(finding.evidence, 320), explanation = text(finding.explanation, 500);
    if (x === null || y === null || width === null || height === null || confidence === null || !width || !height || !evidence || !explanation) return [];
    const safeWidth = Math.min(width, 1000 - x), safeHeight = Math.min(height, 1000 - y);
    if (!safeWidth || !safeHeight) return [];
    return [{
      id: `finding-${index + 1}`,
      category: finding.category,
      label: DARK_PATTERN_CATEGORIES[finding.category],
      confidence,
      confidenceLevel: confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low',
      evidence,
      explanation,
      bbox: { x, y, width: safeWidth, height: safeHeight },
    }];
  });
}

export function serializeImageForModel(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}
