import {createHash} from 'node:crypto';

export function billingEventKey(value){return createHash('sha256').update(value,'utf8').digest('hex')}
export function wayForPayEventKey(signedFields,signature){return billingEventKey(`${signedFields};${signature}`)}
