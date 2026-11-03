import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata:Metadata={
  title:'Dashboard — Sift',
  alternates:{canonical:'/dashboard'},
  robots:{index:false,follow:false,googleBot:{index:false,follow:false}},
};

export default function DashboardLayout({children}:{children:ReactNode}){
  return children;
}
