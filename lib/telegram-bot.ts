import { env } from 'cloudflare:workers';
import { analyzeUrl, AnalyzerError } from './analyzer';
import { accessFor, saveScan } from './db';
import { can } from './entitlements';
import { ANALYZE_REQUESTS_PER_MINUTE } from './request-rate-limit-policy.js';
import { enforceRateLimit, rateLimitAccountIdentity } from './request-rate-limit';
import {
  authorizeTelegramGroup,
  cacheTelegramReply,
  claimTelegramUpdate,
  finishTelegramUpdate,
  markTelegramUse,
  telegramAccount,
  telegramGroupOwner,
  telegramLinkCodeUserId,
  telegramLinkOwner,
  revokeTelegramGroup,
  unlinkTelegram,
} from './developer-integrations';

type TelegramUser = { id: number; is_bot?: boolean; username?: string; first_name?: string };
type TelegramChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string };
type TelegramMessage = { message_id: number; from?: TelegramUser; chat: TelegramChat; text?: string };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage };
type RuntimeEnv = Record<string, string | undefined>;
const runtime = () => env as unknown as RuntimeEnv;

export function telegramBotConfig() {
  const values = runtime();
  const username = (values.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  return { configured: Boolean(values.TELEGRAM_BOT_TOKEN && username && (values.TELEGRAM_WEBHOOK_SECRET || '').trim().length >= 32), username: username || null, startUrl: username ? `https://t.me/${username}` : null };
}

export function telegramWebhookAuthorized(request: Request, secret: string) {
  const expected = secret.trim();
  const received = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!expected || received.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return mismatch === 0;
}

export function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const update = value as TelegramUpdate;
  const message = update.message;
  return Number.isSafeInteger(update.update_id) && update.update_id >= 0 && Boolean(message && Number.isSafeInteger(message.message_id) && message.chat && Number.isSafeInteger(message.chat.id) && ['private', 'group', 'supergroup', 'channel'].includes(message.chat.type));
}

export function firstHttpUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[),.!?;:'"\]}]+$/g, '');
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

export function formatTelegramReport(result: { id?: string; score: number; decision: 'buy' | 'wait' | 'close'; verdict: string; prices: string[]; findings: Array<{ title: string; summary: string; evidence: string; confidence: string }>; url: string }) {
  const decision = result.decision === 'buy' ? 'Ключові умови знайдено' : result.decision === 'close' ? 'Краще закрити сторінку' : 'Почекайте й перевірте умови';
  const lines = [
    `Sift · ${result.score}/100`,
    decision,
    result.verdict,
    result.prices.length ? `Знайдені ціни: ${result.prices.slice(0, 4).join(', ')}` : 'Ціну не вдалося підтвердити.',
    ...result.findings.slice(0, 3).map((finding) => `• ${finding.title}${finding.confidence === 'low' ? ' · низька впевненість' : ''}: ${finding.evidence || finding.summary}`),
    `Джерело: ${result.url}`,
    result.id ? `Звіт збережено в Dashboard · ${result.id}` : '',
    'Це автоматичне резюме умов, не гарантія безпеки покупки. Перевірте першоджерело перед оплатою.',
  ].filter(Boolean);
  let output = lines.join('\n');
  if (output.length > 3900) output = `${output.slice(0, 3860)}…\nРезюме скорочено. Відкрийте збережений звіт у Sift.`;
  return output;
}

async function sendMessage(chatId: number, text: string) {
  const token = runtime().TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Telegram bot is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage returned ${response.status}`);
  const payload = await response.json() as { ok?: boolean };
  if (!payload.ok) throw new Error('Telegram declined the message');
}

function commandParts(text: string) {
  const [command = '', ...args] = text.trim().split(/\s+/);
  return { command: command.split('@')[0].toLowerCase(), args };
}

async function linkedProUser(userId: string) {
  const access = await accessFor(userId);
  const allowed = await can({ id: userId, emailVerified: true }, 'unlimited_scans', { access });
  return allowed ? access : null;
}

async function handleMessage(request: Request, message: TelegramMessage, updateId: number) {
  const { chat, from } = message;
  const text = (message.text || '').trim();
  if (!text || !from || from.is_bot || chat.type === 'channel') return;
  const reply = async (replyText: string) => { await cacheTelegramReply(updateId, chat.id, replyText); await sendMessage(chat.id, replyText); };
  const telegramUserId = String(from.id);
  const chatId = String(chat.id);
  const { command, args } = commandParts(text);

  if ((command === '/start' || command === '/link') && args[0]) {
    if (chat.type !== 'private') { await reply('Для прив’язки акаунта відкрийте приватний чат із ботом і надішліть /link КОД.'); return; }
    const ownerId = await telegramLinkCodeUserId(args[0]);
    if (!ownerId || !await linkedProUser(ownerId)) { await reply('Код недійсний, прострочений або для нього вже немає активного Pro. Створіть нове посилання в Sift → Dashboard → Інтеграції.'); return; }
    const linked = await telegramLinkOwner(args[0], { id: telegramUserId, username: from.username, firstName: from.first_name });
    if (!linked.ok) { await reply('Цей Telegram або Sift акаунт уже прив’язаний до іншого користувача. Спершу відв’яжіть попередній акаунт.'); return; }
    await reply('Telegram підключено до Sift Pro. Надішліть посилання на умови для аналізу. Для спільної групи додайте бота й надішліть там /allowgroup.');
    return;
  }

  if (command === '/start' || command === '/help') {
    const config = telegramBotConfig();
    await reply(`Sift перевіряє сторінки тарифів і умов.\n\n1. Увійдіть у Sift Pro.\n2. Dashboard → Інтеграції → Підключити Telegram.\n3. Перейдіть у приватний чат${config.startUrl ? ` ${config.startUrl}` : ' з ботом'} або надішліть /link КОД.\n4. Надішліть URL для перевірки.\n\nУ групі власник інтеграції має надіслати /allowgroup. Усі перевірки йдуть у межах ліміту Pro: 30 запитів за хвилину на акаунт. Звіт зберігається в Dashboard.`);
    return;
  }

  const ownAccount = await telegramAccount(telegramUserId);
  if (command === '/unlink') {
    if (chat.type !== 'private') { await reply('Відв’язати Telegram можна в приватному чаті командою /unlink або в Sift → Інтеграції.'); return; }
    if (!ownAccount) { await reply('Цей Telegram не прив’язаний до Sift.'); return; }
    await unlinkTelegram(ownAccount.user_id);
    await reply('Telegram відв’язано. Доступ груп і bot-перевірки припинено.');
    return;
  }

  if (command === '/allowgroup') {
    if (chat.type === 'private') { await reply('Додайте бота в групу, а потім надішліть там /allowgroup.'); return; }
    if (!ownAccount || !await linkedProUser(ownAccount.user_id)) { await reply('Спершу підключіть активний Sift Pro у приватному чаті з ботом.'); return; }
    await authorizeTelegramGroup({ chatId, userId: ownAccount.user_id, telegramUserId, title: chat.title || 'Telegram group' });
    await reply('Групу підключено. Учасники групи можуть надсилати посилання; ліміт 30 аналізів за хвилину спільний з акаунтом власника. /disablegroup вимикає доступ.');
    return;
  }

  if (command === '/disablegroup') {
    const group = await telegramGroupOwner(chatId);
    if (!group || group.linked_telegram_user_id !== telegramUserId) { await reply('Вимкнути груповий доступ може лише власник інтеграції.'); return; }
    await revokeTelegramGroup(chatId, group.owner_user_id);
    await reply('Груповий доступ вимкнено.');
    return;
  }

  const url = firstHttpUrl(text);
  if (!url) { await reply('Надішліть пряме посилання на сторінку тарифу, оплати або умов. Команди: /help, /unlink, /allowgroup, /disablegroup.'); return; }

  let ownerId = '';
  let linkedTelegramId = telegramUserId;
  if (chat.type === 'private') {
    if (!ownAccount) { await reply('Для перевірки потрібен активний Sift Pro. Увійдіть у Sift → Dashboard → Інтеграції та підключіть Telegram.'); return; }
    ownerId = ownAccount.user_id;
  } else {
    const group = await telegramGroupOwner(chatId);
    if (!group) { await reply('Ця група ще не підключена. Власник Sift Pro має підключити Telegram у приватному чаті, а потім виконати тут /allowgroup.'); return; }
    const linkedOwner = await telegramAccount(group.linked_telegram_user_id);
    if (!linkedOwner || linkedOwner.user_id !== group.owner_user_id) { await revokeTelegramGroup(chatId, group.owner_user_id); await reply('Підключення групи більше неактивне. Власник має заново прив’язати Telegram.'); return; }
    ownerId = group.owner_user_id;
    linkedTelegramId = group.linked_telegram_user_id;
  }

  const access = await linkedProUser(ownerId);
  if (!access) { await reply('Аналіз через Telegram доступний лише з підтвердженим email та активним Sift Pro. Історію звітів збережено.'); return; }
  let rateLimit;
  try {
    const identities = rateLimitAccountIdentity(request, ownerId);
    identities.push({ kind: 'token', value: `telegram:${chatId}` });
    rateLimit = await enforceRateLimit('analyze:pro', identities, ANALYZE_REQUESTS_PER_MINUTE.pro);
  } catch {
    await reply('Лімітатор тимчасово недоступний. Спробуйте пізніше.');
    return;
  }
  if (!rateLimit.allowed) { await reply(`Забагато запитів. Спробуйте приблизно через ${Math.max(1, rateLimit.retryAfter)} с.`); return; }

  let reportText: string;
  try {
    const result = await analyzeUrl(url);
    const reportId = await saveScan(`telegram:${linkedTelegramId}`, ownerId, result, 'pro');
    await markTelegramUse(linkedTelegramId);
    reportText = formatTelegramReport({ ...result, id: reportId });
  } catch (error) {
    const errorMessage = error instanceof AnalyzerError ? error.message : 'Не вдалося завершити аналіз. Спробуйте ще раз.';
    reportText = `Sift не сформував звіт. ${errorMessage}`;
  }
  await reply(reportText);
}

export async function processTelegramUpdate(request: Request, update: TelegramUpdate) {
  const claim = await claimTelegramUpdate(update.update_id);
  if (!claim.claimed) return { duplicate: true };
  try {
    if (claim.chatId && claim.replyText) await sendMessage(Number(claim.chatId), claim.replyText);
    else if (update.message) await handleMessage(request, update.message, update.update_id);
    await finishTelegramUpdate(update.update_id, true);
    return { duplicate: false };
  } catch (error) {
    await finishTelegramUpdate(update.update_id, false);
    throw error;
  }
}
