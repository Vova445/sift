import type {Metadata,Viewport} from 'next';
import {pageMetadata,serializeStructuredData,SITE_URL} from '../lib/seo';
import './globals.css';import './mobile-modals.css';import './responsive-layout.css';import './verification.css';import './password.css';import './anti-abuse.css';import './legal-consent.css';

const description='Перевірте ціну, автопродовження, повернення та умови скасування перед оплатою.';
const jsonLdMarkup=serializeStructuredData();

export const metadata:Metadata={
  ...pageMetadata('/','Sift — know before you pay',description),
  metadataBase:new URL(SITE_URL),
  icons:{icon:'/favicon.svg'},
};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="uk"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLdMarkup}}/>{children}</body></html>}
