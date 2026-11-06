import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata:Metadata={
  title:'Підтвердження email — Sift',
  alternates:{canonical:'/verify-email'},
  robots:{index:false,follow:false,googleBot:{index:false,follow:false}},
};

export default function VerifyEmailLayout({children}:{children:ReactNode}){
  return children;
}
