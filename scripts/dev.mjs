import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import chokidar from 'chokidar';
import { prepare } from './prepare.mjs';
const require=createRequire(import.meta.url),pkg=require.resolve('astro/package.json');
const bin=JSON.parse(fs.readFileSync(pkg,'utf8')).bin.astro;
try {await prepare(process.cwd(),true);}catch(error){console.error(error.message);process.exit(1);}
const child=spawn(process.execPath,[path.resolve(path.dirname(pkg),bin),'dev',...process.argv.slice(2)],{stdio:'inherit'});
let timer,running=false,again=false;
async function refresh(){
  if(running){again=true;return;}running=true;
  try {await prepare(process.cwd(),true);console.log('Content preview updated.');}catch(error){console.error(`Content not refreshed: ${error.message}`);}
  running=false;if(again){again=false;await refresh();}
}
const watcher=chokidar.watch(['content','config'],{ignoreInitial:true}).on('all',()=>{clearTimeout(timer);timer=setTimeout(refresh,180);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{watcher.close();clearTimeout(timer);process.exitCode=code??0;});
