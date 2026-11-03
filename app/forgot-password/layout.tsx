import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata:Metadata={
  title:'Відновлення доступу — Sift',
  alternates:{canonical:'/forgot-password'},
  robots:{index:false,follow:false,googleBot:{index:false,follow:false}},
};

export default function ForgotPasswordLayout({children}:{children:ReactNode}){
  return children;
}
