import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'Sift — know before you pay',description:'Перевірте приховані платежі, автопродовження, повернення та умови скасування до покупки.',openGraph:{title:'Sift — не натискайте «Оплатити» навмання',description:'Purchase preflight для курсів, підписок, подорожей, оренди та онлайн-покупок.'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="uk"><body>{children}</body></html>}
