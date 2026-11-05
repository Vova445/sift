import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {pageMetadata} from '../../../lib/seo';
import DomainCorrectionForm from '../DomainCorrectionForm';
import '../domain-index.css';

export const metadata:Metadata={...pageMetadata('/domains/respond','Відповідь або виправлення для сервісу — Sift','Форма для представників сайтів: надішліть офіційну відповідь або виправлення до індексу Sift.'),robots:{index:false,follow:true}};

export default function DomainResponsePage(){
  return <main className="domainIndexPage"><header className="domainIndexNav"><Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link><nav><Link href="/domains">До індексу <ArrowLeft aria-hidden="true"/></Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav></header><article className="domainMethodology"><small>ДЛЯ ПРЕДСТАВНИКІВ СЕРВІСІВ</small><h1>Маєте уточнення<br/><em>до профілю?</em></h1><p className="domainMethodLead">Надішліть офіційне пояснення або конкретне виправлення до будь-якого домену. Команда Sift перевірить ваш зв’язок із сервісом і першоджерела, перш ніж щось публікувати.</p><DomainCorrectionForm initialOpen/><Link className="domainMethodBack" href="/domains/methodology">Як формується індекс</Link></article><footer className="domainIndexFooter"><span>© AVEIron · агреговані сигнали, не юридична оцінка</span><Link href="/privacy">Приватність</Link><Link href="/domains">Індекс доменів</Link></footer></main>;
}
