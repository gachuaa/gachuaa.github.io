import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const entries=JSON.parse(fs.readFileSync('dist/search.json','utf8'));
if(entries.length) execFileSync('pagefind',['--site','dist'],{stdio:'inherit'});
else console.log('No published entries; skipping Pagefind index.');
