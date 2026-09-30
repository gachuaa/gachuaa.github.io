import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { validate, references, processor, localTarget, withBase, markdownText, digest, walk } from '../src/lib/model.mjs';

function writeChanged(file,content) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
  if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes)) fs.writeFileSync(file,bytes);
}
export async function prepare(root=process.cwd(),dev=false) {
  const {site,taxonomy,entries}=validate(root), selected=entries.filter(e=>dev||!e.draft);
  const targets=new Map(entries.map(e=>[e.file,e]));
  const generated=path.join(root,'.generated/content'),media=path.join(root,'public/_content'),source=path.join(root,'public/_source');
  const keep=new Set();
  for(const type of ['notes','writeups','articles']) fs.mkdirSync(path.join(generated,type),{recursive:true});
  for(const entry of selected) {
    const {tree,result}=references(entry.body);
    for(const ref of result) {
      const url=ref.url;
      if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
      if(url.startsWith('/')) {ref.node.url=withBase(url,site.base);continue;}
      const target=localTarget(entry,url),suffix=url.match(/[?#].*$/)?.[0]||'';
      if(target.endsWith('.md')) {ref.node.url=withBase(targets.get(target).route,site.base)+suffix;continue;}
      let bytes=fs.readFileSync(target),ext=path.extname(target).toLowerCase();
      if(ref.image && ['.png','.jpg','.jpeg','.webp'].includes(ext)) {
        bytes=await sharp(bytes).rotate().resize({width:1920,withoutEnlargement:true}).webp({quality:92}).toBuffer();ext='.webp';
      }
      const asset=`${entry.type}/${entry.data.slug}/${digest(bytes)}${ext}`;
      const dest=path.join(media,asset);writeChanged(dest,bytes);keep.add(dest);
      ref.node.url=withBase(`/_content/${asset}`,site.base)+suffix;
    }
    const meta={...entry.data,draft:entry.draft,type:entry.type,sourcePath:entry.sourcePath,sourceUrl:withBase(`/_source/${entry.type}/${entry.data.slug}.md`,site.base),folders:entry.folders,folderLabels:entry.folderLabels,platform:entry.platform||'',minutes:Math.max(1,Math.ceil(entry.body.split(/\s+/).length/220))};
    const dest=path.join(generated,entry.type,`${entry.data.slug}.md`);
    const preparedMarkdown=markdownText(meta,processor.stringify(tree));
    writeChanged(dest,preparedMarkdown);keep.add(dest);
    const sourceDest=path.join(source,entry.type,`${entry.data.slug}.md`);
    writeChanged(sourceDest,markdownText(entry.data,processor.stringify(tree)));keep.add(sourceDest);
  }
  // A tiny client-side index keeps local development and GitHub Pages search
  // instant. Pagefind is also generated in the production build for crawlers
  // and future search upgrades.
  const searchIndex=selected.map(entry=>({
    title:entry.data.title,
    description:entry.data.description||'',
    type:entry.type,
    topics:entry.data.topics||[],
    url:withBase(entry.route,site.base),
    text:`${entry.data.title} ${entry.data.description||''} ${entry.body}`.replace(/[`*_>#-]/g,' ').replace(/\s+/g,' ').trim()
  }));
  const searchFile=path.join(root,'public/search.json');
  writeChanged(searchFile,JSON.stringify(searchIndex,null,2));
  keep.add(searchFile);
  for(const directory of [generated,media,source]) for(const file of walk(directory)) if(!keep.has(file)) fs.unlinkSync(file);
  return {entries:selected,site,taxonomy};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href) {
  try {const {entries}=await prepare(process.cwd(),process.argv.includes('--dev'));console.log(`Prepared ${entries.length} entries for ${process.argv.includes('--dev')?'local preview':'production'}.`);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
