import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'Порівняти дві підписки — Sift',
  description:'Зіставте регулярну ціну за рік, автопродовження, повернення та штрафні умови двох пропозицій.',
};

export default function CompareLayout({children}:{children:React.ReactNode}){return children}
