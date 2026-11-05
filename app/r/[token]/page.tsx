import type {Metadata} from 'next';
import ReferralRedirect from './redirect';
import '../../service-status.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Запрошення — Sift',robots:{index:false,follow:false},referrer:'no-referrer'};

export default async function ReferralPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  return <ReferralRedirect token={token}/>;
}
