'use client';

import {useEffect} from 'react';
import ErrorStatus from './ErrorStatus';

export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error('Sift route error',error);},[error]);
  return <ErrorStatus reset={reset} digest={error.digest}/>;
}
