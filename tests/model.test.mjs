import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getSources, normalizeBase, today, validate, withBase } from '../src/lib/model.mjs';

const root=process.cwd();

test('content model validates an empty content library',()=>{
  const result=validate(root);
  assert.equal(result.entries.length,0);
});

test('base paths stay correct for user and project pages',()=>{
  assert.equal(normalizeBase('/'),'/' );
  assert.equal(normalizeBase('notes-site'),'/notes-site/');
  assert.equal(withBase('/notes/example/','/notes-site/'),'/notes-site/notes/example/');
  assert.equal(withBase('/notes-site/notes/example/','/notes-site/'),'/notes-site/notes/example/');
});

test('content sources remain empty until real entries are added',()=>{
  assert.equal(getSources(root).length,0);
});

test('timezone date helper returns an ISO calendar date',()=>{
  assert.match(today('Asia/Kolkata',new Date('2026-09-28T20:00:00Z')),/^2026-09-29$/);
});

test('theme toggle thumb changes position in each state',()=>{
  const css=fs.readFileSync(path.join(root,'src/styles/global.css'),'utf8');
  assert.match(css,/:root\[data-theme=dark\] \.theme-switch \.theme-switch-thumb\{[^}]*transform:translate\(1\.35rem,-50%\)/s);
  assert.match(css,/:root:not\(\[data-theme=dark\]\) \.theme-switch \.theme-switch-thumb\{[^}]*transform:translate\(0,-50%\)/s);
});

test('writeup previews keep show-all without pagination controls',()=>{
  const collection=fs.readFileSync(path.join(root,'src/components/Collection.astro'),'utf8');
  const writeups=fs.readFileSync(path.join(root,'src/components/Writeups.astro'),'utf8');
  const listing=fs.readFileSync(path.join(root,'src/components/Listing.astro'),'utf8');
  const route=fs.readFileSync(path.join(root,'src/pages/[...path].astro'),'utf8');
  assert.match(collection,/paginate=true/);
  assert.match(writeups,/limit=\{10\}/);
  assert.match(writeups,/paginate=\{false\}/);
  assert.match(listing,/view!=='platform'&&<Pagination/);
  assert.match(route,/add\(`write-ups\/platform\/\$\{id\}`/);
});

test('entry tiles keep the original compact card shape without optional images',()=>{
  const schema=fs.readFileSync(path.join(root,'src/content.config.ts'),'utf8');
  const tile=fs.readFileSync(path.join(root,'src/components/EntryTile.astro'),'utf8');
  assert.doesNotMatch(schema,/image:\s*z\.string\(\)\.optional\(\)/);
  assert.doesNotMatch(tile,/entry-tile-image/);
});

test('production output contains no draft routes after a build',()=>{
  const index=path.join(root,'dist','search.json');
  if(!fs.existsSync(index)) return;
  const search=JSON.parse(fs.readFileSync(index,'utf8'));
  assert.deepEqual(search,[]);
});
