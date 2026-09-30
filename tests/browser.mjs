import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const root=process.cwd();
const pages=['index.html','notes/index.html','notes/virtual-host-discovery/index.html','write-ups/index.html','search/index.html'];
for(const relative of pages){
  const file=path.join(root,'dist',relative);
  if(!fs.existsSync(file)) throw new Error(`Run npm run build before browser smoke test: ${relative}`);
  const {document}=parseHTML(fs.readFileSync(file,'utf8'));
  assert.ok(document.querySelector('main#main'),`${relative}: main landmark`);
  assert.ok(document.querySelector('.global-search'),`${relative}: global search`);
  assert.ok(document.querySelector('[data-theme-choice="dark"]'),`${relative}: dark theme control`);
  if(relative==='index.html') assert.ok(document.querySelector('.entry-tile'),`${relative}: post tile`);
  if(relative.includes('/virtual-host-discovery/')) assert.ok(document.querySelector('[data-markdown-viewer]'),`${relative}: Markdown viewer`);
}
console.log(`Static browser smoke passed for ${pages.length} routes.`);
