import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { validate, references, readCanvas, canvasFileTarget, isSharedAsset, processor, localTarget, withBase, markdownText, digest, walk } from '../src/lib/model.mjs';

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
    const writeAsset=(bytes,ext,shared=false)=>{
      const asset=`${shared?'shared':`${entry.type}/${entry.data.slug}`}/${digest(bytes)}${ext}`;
      const dest=path.join(media,asset);writeChanged(dest,bytes);keep.add(dest);
      return withBase(`/_content/${asset}`,site.base);
    };
    const copyAsset=async(file,shared=false)=>{
      let bytes=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
      if(['.png','.jpg','.jpeg','.webp'].includes(ext)) {
        bytes=await sharp(bytes).rotate().resize({width:1920,withoutEnlargement:true}).webp({quality:92}).toBuffer();ext='.webp';
      }
      return writeAsset(bytes,ext,shared);
    };
    const prepareCanvas=async(target)=>{
      const canvas=readCanvas(target);
      for(const node of canvas.nodes) if(node.type==='file'&&typeof node.file==='string'&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(node.file)) {
        const file=canvasFileTarget(entry,target,node.file,root);
        node.file=await copyAsset(file,isSharedAsset(root,file));
      }
      return writeAsset(Buffer.from(JSON.stringify(canvas)),'.canvas');
    };
    let canvasUrl='';
    const refs=entry.data.canvas?[...result,{url:entry.data.canvas,canvas:true,sidecar:true}]:result;
    for(const ref of refs) {
      const url=ref.url;
      if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
      if(url.startsWith('/')) {ref.node.url=withBase(url,site.base);continue;}
      const target=localTarget(entry,url),shared=isSharedAsset(root,target),suffix=url.match(/[?#].*$/)?.[0]||'';
      if(target.endsWith('.md')) {ref.node.url=withBase(targets.get(target).route,site.base)+suffix;continue;}
      if(ref.canvas) {
        canvasUrl=await prepareCanvas(target);
        if(!ref.sidecar)ref.node.value=`<div class="canvas-board" data-canvas-src="${canvasUrl}"></div>`;
        continue;
      }
      let bytes=fs.readFileSync(target),ext=path.extname(target).toLowerCase();
      if(ref.image && ['.png','.jpg','.jpeg','.webp'].includes(ext)) {
        bytes=await sharp(bytes).rotate().resize({width:1920,withoutEnlargement:true}).webp({quality:92}).toBuffer();ext='.webp';
      }
      const assetUrl=writeAsset(bytes,ext,shared)+suffix;
      if(ref.replaceUrl)ref.replaceUrl(assetUrl);
      else ref.node.url=assetUrl;
    }
    const meta={...entry.data,canvasUrl,draft:entry.draft,type:entry.type,sourcePath:entry.sourcePath,sourceUrl:withBase(`/_source/${entry.type}/${entry.data.slug}.md`,site.base),folders:entry.folders,folderLabels:entry.folderLabels,platform:entry.platform||'',minutes:Math.max(1,Math.ceil(entry.body.split(/\s+/).length/220))};
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
