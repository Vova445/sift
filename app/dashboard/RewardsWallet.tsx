'use client';

import { useEffect, useState } from 'react';
import { BellRing, CircleDollarSign, Gift, Percent, ShieldCheck } from 'lucide-react';
import './rewards-wallet.css';

type Reward = { id: string; type: 'one_credit' | 'pro_discount_50' | 'priority_alerts'; status: string; title: string; description: string; expiresAt: string | null; earnedAt: string; quarter: string | null };

function dateLabel(value: string | null) {
  if (!value) return 'Без строку дії';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `Діє до ${new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)}`;
}

export default function RewardsWallet() {
  const [items, setItems] = useState<Reward[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/rewards', { cache: 'no-store' });
        const body = await response.json() as { items?: Reward[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Нагороди тимчасово недоступні.');
        if (active) { setItems(body.items || []); setError(''); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Нагороди тимчасово недоступні.');
      } finally { if (active) setLoaded(true); }
    };
    const onUpdate = () => { void load(); };
    void load();
    window.addEventListener('sift:achievements-updated', onUpdate);
    return () => { active = false; window.removeEventListener('sift:achievements-updated', onUpdate); };
  }, []);

  if (!loaded || (!items.length && !error)) return null;
  return <section className="rewardWallet" aria-labelledby="reward-wallet-title">
    <header><span className="rewardWalletIcon"><Gift aria-hidden="true"/></span><div><small>НАГОРОДИ SIFT</small><h2 id="reward-wallet-title">Ваші переваги</h2><p>Бонуси з’являються після серверного підтвердження досягнення.</p></div></header>
    {error ? <p className="rewardWalletError" role="status">{error}</p> : <div className="rewardWalletGrid">{items.map((item) => {
      const Icon = item.type === 'one_credit' ? CircleDollarSign : item.type === 'pro_discount_50' ? Percent : BellRing;
      const status = item.status === 'available' ? 'Доступна' : item.status === 'reserved' ? 'Зарезервована' : item.status === 'redeemed' ? 'Використана' : item.status === 'capped' ? 'Квартальний ліміт вичерпано' : 'Завершилася';
      return <article className={`rewardWalletCard ${item.status}`} key={item.id}><span><Icon aria-hidden="true"/></span><div><div className="rewardWalletTitle"><b>{item.title}</b><strong>{status}</strong></div><p>{item.description}</p><small>{dateLabel(item.expiresAt)}{item.quarter ? ` · Квота ${item.quarter}` : ''}</small></div></article>;
    })}</div>}
    <p className="rewardWalletFootnote"><ShieldCheck aria-hidden="true"/> Один кредит зараховується після збереження повного звіту. Безкоштовних кредитів — не більше трьох за квартал.</p>
  </section>;
}
