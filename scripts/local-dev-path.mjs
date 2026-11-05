import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const localDevDir=process.env.LOCALAPPDATA
  ?join(process.env.LOCALAPPDATA,'Sift','local-dev')
  :join(tmpdir(),'sift-local-dev');
