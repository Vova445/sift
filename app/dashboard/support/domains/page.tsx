import type {Metadata} from 'next';
import DomainCorrectionsQueue from '../DomainCorrectionsQueue';

export const metadata:Metadata={title:'Звернення власників доменів — Support | Sift',robots:{index:false,follow:false}};
export default function DomainCorrectionsAdminPage(){return <DomainCorrectionsQueue/>}
