'use client';

import ErrorStatus from './ErrorStatus';
import './service-status.css';

export default function GlobalError({error}:{error:Error&{digest?:string}}){
  return <html lang="uk"><body><ErrorStatus digest={error.digest}/></body></html>;
}
