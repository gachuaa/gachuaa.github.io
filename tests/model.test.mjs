import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSources, normalizeBase, normalizeRoute, parseMarkdown, references, today, validate, withBase, processor } from '../src/lib/model.mjs';
import { prepare } from '../scripts/prepare.mjs';
import { createEntry } from '../scripts/content-ops.mjs';

const root=process.cwd();

test('base paths stay correct for user and project pages',()=>{
  assert.equal(normalizeBase('/'),'/' );
  assert.equal(normalizeBase('notes-site'),'/notes-site/');
  assert.equal(withBase('/notes/example/','/notes-site/'),'/notes-site/notes/example/');
  assert.equal(withBase('/notes-site/notes/example/','/notes-site/'),'/notes-site/notes/example/');
});

test('public routes compare case-insensitively while keeping canonical lowercase URLs',()=>{
  const canonical='/write-ups/insanityhosting/';
  assert.equal(normalizeRoute('/write-ups/InsanityHosting/',new Map([[canonical,true]])),canonical);
  assert.equal(normalizeRoute('/WRITE-UPS/INSANITYHOSTING/',new Map([[canonical,true]])),canonical);
  assert.equal(normalizeRoute('/write-ups/unknown/',new Map([[canonical,true]])),undefined);
});

test('content model discovers write-ups from per-entry index files',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'writeup-discovery-'));
  try {
    fs.mkdirSync(path.join(temp,'config'),{recursive:true});
    fs.mkdirSync(path.join(temp,'content/writeups/example-writeup'),{recursive:true});
    fs.writeFileSync(path.join(temp,'config/site.yml'),'name: Test\nurl: https://example.test\nbase: /\npageSize: 10\ntimezone: UTC\n');
    fs.writeFileSync(path.join(temp,'config/taxonomy.yml'),'topics: {}\nplatforms:\n  offsec:\n    label: OffSec\n');
    fs.writeFileSync(path.join(temp,'content/writeups/example-writeup/index.md'),'---\ntitle: Example Write-up\nslug: example-writeup\ndraft: true\nplatform: offsec\n---\n\nExample content.\n');

    const result=validate(temp),entry=result.entries.find(item=>item.data.slug==='example-writeup');
    assert.ok(entry);
    assert.equal(entry.platform,'offsec');
    assert.equal(entry.draft,true);
    assert.equal(entry.sourcePath,'content/writeups/example-writeup/index.md');
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('Obsidian canvas embeds become local attachment references',()=>{
  const {tree,result}=references('Before ![[boards/Amaterasu.canvas]] after.');
  assert.deepEqual(result.filter(ref=>ref.canvas).map(ref=>ref.url),['boards/Amaterasu.canvas']);
  assert.match(processor.stringify(tree),/<div class="canvas-board" data-canvas-src=""><\/div>/);
});

test('local HTML image sources can be rewritten without losing sizing',()=>{
  const {tree,result}=references('<span class="spoiler"><img src="./image/demo.gif" alt="Demo" width="160"></span>');
  assert.equal(result[0].url,'./image/demo.gif');
  result[0].replaceUrl('/_content/writeups/demo/asset.gif');
  assert.match(processor.stringify(tree),/<span class="spoiler"><img src="\/_content\/writeups\/demo\/asset.gif" alt="Demo" width="160"><\/span>/);
});

test('assets under content/assets can be reused from Markdown and Canvas',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'root-assets-'));
  try {
    const entry=path.join(temp,'content/notes/shared-media');
    fs.mkdirSync(entry,{recursive:true});
    fs.mkdirSync(path.join(temp,'content/assets/images'),{recursive:true});
    fs.mkdirSync(path.join(temp,'content/assets/memes'),{recursive:true});
    fs.mkdirSync(path.join(temp,'config'),{recursive:true});
    fs.writeFileSync(path.join(temp,'config/site.yml'),'name: Test\ndescription: Test\ntagline: Test\nurl: https://example.test\nbase: /\ntimezone: UTC\npageSize: 10\nsocials: {}\nabout: Test\n');
    fs.writeFileSync(path.join(temp,'config/taxonomy.yml'),'topics:\n  security:\n    label: Security\nplatforms: {}\n');
    fs.writeFileSync(path.join(entry,'index.md'),'---\ntitle: Shared media\ndescription: Shared media test.\nslug: shared-media\ndraft: false\npublishedAt: 2026-09-30\ntopics: [security]\ncanvas: board.canvas\n---\n\n![Diagram](../../assets/images/diagram.svg)\n\n<img src="../../assets/memes/reaction.svg" alt="Reaction">\n');
    fs.writeFileSync(path.join(entry,'board.canvas'),JSON.stringify({nodes:[{id:'shared-image',type:'file',file:'assets/images/diagram.svg',x:0,y:0,width:300,height:180}],edges:[]}));
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
    fs.writeFileSync(path.join(temp,'content/assets/images/diagram.svg'),svg);
    fs.writeFileSync(path.join(temp,'content/assets/memes/reaction.svg'),svg.replace('<rect','<circle').replace('/></svg>',' r="1"/></svg>'));

    await prepare(temp);
    const generated=fs.readFileSync(path.join(temp,'.generated/content/notes/shared-media.md'),'utf8');
    assert.equal((generated.match(/\/_content\/shared\//g)||[]).length,2);
    assert.equal(fs.readdirSync(path.join(temp,'public/_content/shared')).length,2);
    const {data}=parseMarkdown(generated);
    const canvas=JSON.parse(fs.readFileSync(path.join(temp,'public',data.canvasUrl.slice(1)),'utf8'));
    assert.match(canvas.nodes[0].file,/^\/_content\/shared\/[a-f0-9]+\.svg$/);

    fs.writeFileSync(path.join(temp,'outside.png'),'not an allowed shared asset');
    fs.writeFileSync(path.join(entry,'index.md'),'---\ntitle: Shared media\ndescription: Shared media test.\nslug: shared-media\ndraft: false\npublishedAt: 2026-09-30\ntopics: [security]\n---\n\n![Escape](../../../outside.png)\n');
    assert.throws(()=>validate(temp),/keep attachments inside their own entry folder or content\/assets/);
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('content preparation publishes Canvas boards and local file nodes',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'canvas-content-'));
  try {
    const entry=path.join(temp,'content/notes/board-note');
    fs.mkdirSync(path.join(entry,'image'),{recursive:true});
    fs.mkdirSync(path.join(temp,'config'),{recursive:true});
    fs.writeFileSync(path.join(temp,'config/site.yml'),'name: Test\ndescription: Test\ntagline: Test\nurl: https://example.test\nbase: /\ntimezone: UTC\npageSize: 10\nsocials: {}\nabout: Test\n');
    fs.writeFileSync(path.join(temp,'config/taxonomy.yml'),'topics:\n  security:\n    label: Security\nplatforms: {}\n');
    fs.writeFileSync(path.join(entry,'index.md'),'---\ntitle: Board note\ndescription: A Canvas note.\nslug: board-note\ndraft: false\npublishedAt: 2026-09-30\ntopics: [security]\ncanvas: board.canvas\n---\n\nMarkdown body for the entry.\n');
    fs.writeFileSync(path.join(entry,'board.canvas'),JSON.stringify({nodes:[{id:'image',type:'file',file:'notes/board-note/images/shot.svg',x:0,y:0,width:300,height:180}],edges:[]}));
    fs.writeFileSync(path.join(entry,'image/shot.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');

    await prepare(temp);
    const generated=fs.readFileSync(path.join(temp,'.generated/content/notes/board-note.md'),'utf8');
    const {data:generatedData,body:generatedBody}=parseMarkdown(generated);
    const canvasUrl=generatedData.canvasUrl;
    assert.ok(canvasUrl);
    assert.match(generatedBody,/Markdown body for the entry/);
    assert.doesNotMatch(generatedBody,/canvas-board/);
    const publishedCanvas=path.join(temp,'public',canvasUrl.slice(1));
    const canvas=JSON.parse(fs.readFileSync(publishedCanvas,'utf8'));
    assert.match(canvas.nodes[0].file,/^\/_content\/notes\/board-note\/[a-f0-9]+\.svg$/);
    assert.ok(fs.existsSync(path.join(temp,'public',canvas.nodes[0].file.slice(1))));
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('new notes and write-ups use per-entry index, image, and Canvas files',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'entry-layout-'));
  try {
    fs.mkdirSync(path.join(temp,'config'),{recursive:true});
    fs.cpSync(path.join(root,'templates'),path.join(temp,'templates'),{recursive:true});
    fs.writeFileSync(path.join(temp,'config/site.yml'),'name: Test\ndescription: Test\ntagline: Test\nurl: https://example.test\nbase: /\ntimezone: UTC\npageSize: 10\nsocials: {}\nabout: Test\n');
    fs.writeFileSync(path.join(temp,'config/taxonomy.yml'),'topics:\n  security:\n    label: Security\nplatforms:\n  offsec:\n    label: OffSec\n');

    const note=createEntry(temp,{type:'note',title:'Amaterasu',topics:['security'],canvas:true});
    const noteDir=path.dirname(note);
    assert.equal(path.relative(temp,note),'content/notes/amaterasu/index.md');
    assert.ok(fs.existsSync(path.join(noteDir,'image')));
    assert.ok(fs.existsSync(path.join(noteDir,'amaterasu.canvas')));
    const noteMarkdown=fs.readFileSync(note,'utf8');
    assert.match(noteMarkdown,/canvas: amaterasu\.canvas/);
    assert.doesNotMatch(noteMarkdown,/!\[\[amaterasu\.canvas\]\]/);

    const writeup=createEntry(temp,{type:'writeup',category:'offsec',title:'BBS Cute',topics:['security'],canvas:true});
    const writeupDir=path.dirname(writeup);
    assert.equal(path.relative(temp,writeup),'content/writeups/bbs-cute/index.md');
    assert.ok(fs.existsSync(path.join(writeupDir,'image')));
    assert.ok(fs.existsSync(path.join(writeupDir,'bbs-cute.canvas')));
    const writeupMarkdown=fs.readFileSync(writeup,'utf8');
    assert.match(writeupMarkdown,/platform: offsec/);
    assert.match(writeupMarkdown,/canvas: bbs-cute\.canvas/);
    assert.equal(validate(temp).entries.length,2);
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
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
