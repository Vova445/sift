import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata:Metadata={
  title:'Зміна пароля — Sift',
  alternates:{canonical:'/reset-password'},
  robots:{index:false,follow:false,googleBot:{index:false,follow:false}},
};

export default function ResetPasswordLayout({children}:{children:ReactNode}){
  return children;
}
