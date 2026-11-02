import type {Metadata,Viewport} from 'next';import './globals.css';import './mobile-modals.css';import './responsive-layout.css';import './verification.css';import './password.css';import './anti-abuse.css';import './legal-consent.css';
export const metadata:Metadata={title:'Sift — know before you pay',description:'Перевірте приховані платежі, автопродовження, повернення та умови скасування до покупки.',openGraph:{title:'Sift — не натискайте «Оплатити» навмання',description:'Purchase preflight для курсів, підписок, подорожей, оренди та онлайн-покупок.'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="uk"><body>{children}</body></html>}
