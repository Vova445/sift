'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChartNoAxesColumn, Code2, FileSearch, Home, ShieldCheck, UsersRound } from 'lucide-react';

type Tab = 'dashboard' | 'account' | 'integrations' | 'space' | 'domains' | 'analytics' | 'admin';

export default function ProductTabNavigation() {
  const pathname = usePathname() || '/';
  const [hash, setHash] = useState('');
  const [adminAccess, setAdminAccess] = useState<{ pathname: string; allowed: boolean }>({ pathname: '', allowed: false });
  const hidden = pathname === '/' || pathname.startsWith('/share/') || pathname.startsWith('/r/') || ['/forgot-password','/reset-password','/verify-email'].includes(pathname);
  const isAdmin = !hidden && adminAccess.pathname === pathname && adminAccess.allowed;

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('hasProductTabNavigation', !hidden);
    return () => document.body.classList.remove('hasProductTabNavigation');
  }, [hidden]);

  useEffect(() => {
    if (hidden) {
      return;
    }
    let active = true;
    const refreshAdminAccess = async () => {
      try {
        const response = await fetch('/api/admin/access', { cache: 'no-store' });
        const body = await response.json() as { isAdmin?: boolean };
        if (active) setAdminAccess({ pathname, allowed: response.ok && body.isAdmin === true });
      } catch {
        if (active) setAdminAccess({ pathname, allowed: false });
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshAdminAccess(); };
    void refreshAdminAccess();
    window.addEventListener('focus', refreshAdminAccess);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshAdminAccess);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hidden, pathname]);

  if (hidden) return null;

  const activeTab: Tab | null = pathname.startsWith('/dashboard/integrations')
    ? 'integrations'
    : pathname.startsWith('/dashboard/space')
      ? 'space'
      : pathname.startsWith('/dashboard/analytics')
        ? 'analytics'
      : pathname.startsWith('/dashboard/support')
        ? 'admin'
        : pathname.startsWith('/domains')
          ? 'domains'
          : pathname.startsWith('/dashboard')
            ? pathname === '/dashboard' && hash === '#account' ? 'account' : 'dashboard'
            : null;
  const dashboardHref = (anchor: string) => pathname === '/dashboard' ? anchor : `/dashboard${anchor}`;

  const tabs: Array<{ key: Tab; label: string; href: string; Icon: typeof Home }> = [
    { key: 'dashboard', label: 'Дашборд', href: dashboardHref('#overview'), Icon: FileSearch },
    { key: 'account', label: 'Акаунт', href: dashboardHref('#account'), Icon: UsersRound },
    { key: 'integrations', label: 'Інтеграції', href: '/dashboard/integrations', Icon: Code2 },
    { key: 'space', label: 'Спільний простір', href: '/dashboard/space', Icon: UsersRound },
    { key: 'domains', label: 'Індекс доменів', href: '/domains', Icon: ChartNoAxesColumn },
  ];
  const visibleTabs = isAdmin
    ? [...tabs, { key: 'analytics' as const, label: 'Аналітика', href: '/dashboard/analytics', Icon: ChartNoAxesColumn }]
    : tabs;
  return (
    <>
      <aside className={`productSidebar${isAdmin ? ' hasAdmin' : ''}`} aria-label="Навігація Sift">
        <Link className="productSidebarBrand" href="/"><span aria-hidden="true">S</span><b>SIFT</b></Link>
        <small className="productSidebarLabel">РОЗДІЛИ SIFT</small>
        <nav className="productSidebarNav">
          {visibleTabs.map(({ key, label, href, Icon }) => <a key={key} href={href} aria-current={activeTab === key ? 'page' : undefined}>
            <Icon aria-hidden="true"/><span>{label}</span>
          </a>)}
        </nav>
        <div className={`productSidebarBottom${isAdmin ? ' hasAdmin' : ''}`}>
          {isAdmin && <a className="productSidebarAdminLink" href="/dashboard/support" aria-current={activeTab === 'admin' ? 'page' : undefined}><ShieldCheck aria-hidden="true"/><span>Адмінка</span></a>}
          <Link className="productSidebarHome" href="/"><Home aria-hidden="true"/><span>На головну</span></Link>
        </div>
        <p className="productSidebarFoot">Зрозуміло до оплати.<br/><span>KNOW BEFORE YOU PAY</span></p>
      </aside>
      <nav className={`productTabNav${isAdmin ? ' hasAdmin' : ''}`} aria-label="Навігація Sift">
        {tabs.map(({ key, label, href, Icon }) => <a key={key} href={href} aria-current={activeTab === key ? 'page' : undefined} aria-label={label} title={label}>
          <Icon aria-hidden="true"/><span>{label}</span>
        </a>)}
        <div className={`productTabNavBottom${isAdmin ? ' hasAdmin' : ''}`}>
          {isAdmin && <a className="productTabAnalyticsLink" href="/dashboard/analytics" aria-current={activeTab === 'analytics' ? 'page' : undefined} aria-label="Аналітика" title="Аналітика"><ChartNoAxesColumn aria-hidden="true"/><span>Аналітика</span></a>}
          {isAdmin && <a className="productTabAdminLink" href="/dashboard/support" aria-current={activeTab === 'admin' ? 'page' : undefined} aria-label="Адмінка" title="Адмінка"><ShieldCheck aria-hidden="true"/><span>Адмінка</span></a>}
          <Link className="productTabHome" href="/"><Home aria-hidden="true"/><span>На головну</span></Link>
        </div>
      </nav>
    </>
  );
}
