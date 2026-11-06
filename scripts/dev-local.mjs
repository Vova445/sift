import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {localDevDir} from './local-dev-path.mjs';

const vinextCli=fileURLToPath(new URL('../node_modules/vinext/dist/cli.js',import.meta.url));
const wranglerCli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
mkdirSync(localDevDir,{recursive:true});
const persistPath=join(localDevDir,'worker-state');
const env={
  ...process.env,
  SIFT_LOCAL_DEV:'1',
  TEMP:localDevDir,
  TMP:localDevDir,
  WRANGLER_WRITE_LOGS:'false',
  WRANGLER_LOG_PATH:join(localDevDir,'logs'),
  MINIFLARE_REGISTRY_PATH:join(localDevDir,'registry'),
};

const migration=spawnSync(process.execPath,[wranglerCli,'d1','migrations','apply','sift-local','--local','--config','wrangler.local.jsonc','--persist-to',persistPath],{
  env,
  stdio:'inherit',
});
if(migration.status!==0)process.exit(migration.status??1);

const child=spawn(process.execPath,[vinextCli,'dev',...process.argv.slice(2)],{
  env,
  stdio:'inherit',
});

for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>child.kill(signal));
}

child.on('exit',(code,signal)=>{
  process.exitCode=code??(signal==='SIGINT'?0:1);
});
