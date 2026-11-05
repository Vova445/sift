'use client';

import { useEffect, useState } from 'react';
import { BellRing, CircleDollarSign, Gift, Percent, ShieldCheck } from 'lucide-react';
import './rewards-wallet.css';

type Reward = { id: string; type: 'one_credit' | 'pro_discount_50' | 'priority_alerts'; status: string; title: string; description: string; expiresAt: string | null; earnedAt: string; quarter: string | null };
type WalletData = { items?: Reward[]; error?: string; currentQuarter?: string; quarterlyCreditsUsed?: number; quarterlyCreditLimit?: number };

function dateLabel(value: string | null) {
  if (!value) return 'Без строку дії';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `Діє до ${new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)}`;
}

function quarterLabel(value: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(value);
  return match ? `${match[2]} квартал ${match[1]}` : value;
}

export default function RewardsWallet() {
  const [items, setItems] = useState<Reward[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState({ quarter: '', used: 0, limit: 3 });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/rewards', { cache: 'no-store' });
        const body = await response.json() as WalletData;
        if (!response.ok) throw new Error(body.error || 'Нагороди тимчасово недоступні.');
        if (active) {
          setItems(body.items || []); setError('');
          setQuota({ quarter: body.currentQuarter || '', used: body.quarterlyCreditsUsed || 0, limit: body.quarterlyCreditLimit || 3 });
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Нагороди тимчасово недоступні.');
      } finally { if (active) setLoaded(true); }
    };
    const onUpdate = () => { void load(); };
    void load();
    window.addEventListener('sift:achievements-updated', onUpdate);
    return () => { active = false; window.removeEventListener('sift:achievements-updated', onUpdate); };
  }, []);

  if (!loaded) return null;
  const quotaPercent = Math.min(100, Math.round(quota.used / Math.max(1, quota.limit) * 100));
  return <section className="rewardWallet" aria-labelledby="reward-wallet-title">
    <header><span className="rewardWalletIcon"><Gift aria-hidden="true"/></span><div><small>НАГОРОДИ SIFT</small><h2 id="reward-wallet-title">Ваші переваги</h2><p>Бонуси з’являються після серверного підтвердження досягнення.</p></div></header>
    {error ? <p className="rewardWalletError" role="status">{error}</p> : <>
    <div className="rewardWalletQuota" aria-label="Квартальна квота безкоштовних кредитів One Sift">
      <div><span><small>КВАРТАЛЬНА КВОТА ONE SIFT</small><b>{quota.used}<em>/{quota.limit}</em></b></span><small>{quota.quarter ? quarterLabel(quota.quarter) : 'Поточний квартал UTC'}</small></div>
      <span className="rewardWalletQuotaTrack" role="progressbar" aria-label="Використано кредитів у цьому кварталі" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={Math.min(quota.used, quota.limit)}><i style={{ width: `${quotaPercent}%` }}/></span>
      <p>За квартал можна отримати до {quota.limit} безкоштовних кредитів. Зараховуються лише нагороди, видані за цей період.</p>
    </div>
    {items.length ? <div className="rewardWalletGrid">{items.map((item) => {
      const Icon = item.type === 'one_credit' ? CircleDollarSign : item.type === 'pro_discount_50' ? Percent : BellRing;
      const status = item.status === 'available' ? 'Доступна' : item.status === 'reserved' ? 'Зарезервована' : item.status === 'redeemed' ? 'Використана' : item.status === 'capped' ? 'Квартальний ліміт вичерпано' : 'Завершилася';
      return <article className={`rewardWalletCard ${item.status}`} key={item.id}><span><Icon aria-hidden="true"/></span><div><div className="rewardWalletTitle"><b>{item.title}</b><strong>{status}</strong></div><p>{item.description}</p><small>{dateLabel(item.expiresAt)}{item.quarter ? ` · Квота ${item.quarter}` : ''}</small></div></article>;
    })}</div> : <div className="rewardWalletEmpty"><span><Gift aria-hidden="true"/></span><div><b>Поки немає нагород</b><p>Виконуйте умови досягнень у Sift. Отриманий кредит, знижка або пріоритетні сповіщення з’являться тут зі строком дії.</p><a href="#achievements">Переглянути досягнення <ShieldCheck aria-hidden="true"/></a></div></div>}
    <p className="rewardWalletFootnote"><ShieldCheck aria-hidden="true"/> Кредит One Sift зараховується після збереження повного звіту; сума квартальної квоти показана вище.</p>
    </>}
  </section>;
}
