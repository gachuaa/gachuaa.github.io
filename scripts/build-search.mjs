import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const site=fs.existsSync('dist/client')?'dist/client':'dist';
const entries=JSON.parse(fs.readFileSync(`${site}/search.json`,'utf8'));
if(entries.length) execFileSync('pagefind',['--site',site],{stdio:'inherit'});
else console.log('No published entries; skipping Pagefind index.');
