import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse, stringify } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

export const TYPES = ['notes', 'writeups', 'articles'];
export const PREFIX = { notes: 'notes', writeups: 'write-ups', articles: 'articles' };
export const LABELS = { notes: 'Note', writeups: 'Write-up', articles: 'Article' };
export const slugify = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const validId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const pretty = value => value.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
export const normalizeBase = value => value && value !== '/' ? `/${value.replace(/^\/+|\/+$/g, '')}/` : '/';
export function normalizeRoute(value, routes) {
  const path = String(value).replace(/^\/+|\/+$/g, '');
  const candidates = routes instanceof Map ? routes.keys() : routes;
  const normalized = path.toLowerCase();
  for (const candidate of candidates) {
    const candidatePath = String(candidate).replace(/^\/+|\/+$/g, '').toLowerCase();
    if (candidatePath === normalized) return candidate;
  }
}
export function resolveCaseInsensitivePath(file) {
  if (fs.existsSync(file)) return file;
  const parent = path.dirname(file), name = path.basename(file);
  if (!fs.existsSync(parent)) return file;
  const match = fs.readdirSync(parent).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return match ? path.join(parent,match) : file;
}
export function withBase(value, base = '/') {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
  const b = normalizeBase(base);
  if (b !== '/' && (value === b.slice(0,-1) || value.startsWith(b))) return value;
  return b + value.replace(/^\/+/, '');
}
export function today(timezone = 'Asia/Kolkata', now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  return ['year','month','day'].map(k => p.find(x=>x.type===k).value).join('-');
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function readYaml(file) {
  return parse(fs.readFileSync(file, 'utf8'), { uniqueKeys: true }) ?? {};
}
export function readConfig(root = process.cwd()) {
  const site = readYaml(path.join(root, 'config/site.yml'));
  const taxonomy = readYaml(path.join(root, 'config/taxonomy.yml'));
  site.base = normalizeBase(process.env.SITE_BASE ?? site.base);
  site.url = process.env.SITE_URL ?? site.url;
  return { site, taxonomy };
}
export function parseMarkdown(text, file = 'Markdown') {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${file}: expected a YAML block between --- lines.`);
  const data = parse(match[1], { uniqueKeys:true });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: metadata must be a YAML object.`);
  return { data, body: match[2] };
}
export function markdownText(data, body) { return `---\n${stringify(data, {lineWidth:0})}---\n\n${body.trim()}\n`; }
export function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(item => {
    if (item.name.startsWith('.')) return [];
    const full = path.join(directory,item.name);
    if (item.isSymbolicLink()) throw new Error(`Symlinks are not supported in content: ${full}`);
    return item.isDirectory() ? walk(full) : [full];
  });
}
export function getSources(root = process.cwd()) {
  const entries = [];
  for (const type of TYPES) {
    const base = path.join(root,'content',type);
    for (const file of walk(base).filter(f=>path.basename(f)==='index.md')) {
      const {data,body} = parseMarkdown(fs.readFileSync(file,'utf8'), path.relative(root,file));
      const parts = path.relative(base,path.dirname(file)).split(path.sep);
      const folders = parts.slice(0,-1);
      const folderLabels = folders.map((id,i) => {
        const meta = path.join(base,...folders.slice(0,i+1),'_folder.yml');
        return fs.existsSync(meta) ? readYaml(meta).label || pretty(id) : pretty(id);
      });
      entries.push({ type, file, sourcePath:path.relative(root,file).split(path.sep).join('/'), body, data, folders, folderLabels, platform:type==='writeups'?(data.platform||folders[0]):undefined, route:`/${PREFIX[type]}/${data.slug}/`, draft:data.draft !== false });
    }
  }
  return entries;
}
export const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, {bullet:'-',fences:true});
export function references(body) {
  const tree=processor.parse(body), defs=new Map(), result=[];
  visit(tree,'definition',n=>defs.set(n.identifier.toLowerCase(),n));
  visit(tree, n=> {
    if (n.type==='link'||n.type==='image') result.push({url:n.url,image:n.type==='image',node:n});
    if (n.type==='linkReference'||n.type==='imageReference') {
      const def=defs.get(n.identifier.toLowerCase());
      if (def) result.push({url:def.url,image:n.type==='imageReference',node:def});
    }
  });
  visit(tree,'html',node=>{
    const imageTags=/<img\b[^>]*>/gi;
    for(const match of node.value.matchAll(imageTags)) {
      const tag=match[0],attribute=/\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
      if(!attribute)continue;
      const url=attribute[1]??attribute[2]??attribute[3];
      if(!url)continue;
      result.push({url,image:true,node,replaceUrl:value=>{
        const replacement=tag.replace(attribute[0],prefix=>prefix.replace(url,value));
        node.value=node.value.replace(tag,replacement);
      }});
    }
  });
  visit(tree,'text',(node,index,parent)=>{
    if(!parent||index===undefined)return;
    const matches=[...node.value.matchAll(/!\[\[([^\]\r\n]+\.canvas)\]\]/gi)];
    if(!matches.length)return;
    const children=[];let cursor=0;
    for(const match of matches){
      if(match.index>cursor)children.push({type:'text',value:node.value.slice(cursor,match.index)});
      const embed={type:'html',value:'<div class="canvas-board" data-canvas-src=""></div>'};
      children.push(embed);result.push({url:match[1],image:true,canvas:true,node:embed});
      cursor=match.index+match[0].length;
    }
    if(cursor<node.value.length)children.push({type:'text',value:node.value.slice(cursor)});
    parent.children.splice(index,1,...children);
  });
  return {tree,result};
}
export function readCanvas(file) {
  const canvas=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!canvas||!Array.isArray(canvas.nodes)||!Array.isArray(canvas.edges)) throw new Error(`${file}: expected an Obsidian Canvas with nodes and edges arrays.`);
  return canvas;
}
export function localTarget(entry,url) {
  let pathname;
  try { pathname=decodeURIComponent(url.split(/[?#]/)[0]); } catch {throw new Error(`${entry.sourcePath}: invalid link encoding: ${url}`);}
  return resolveCaseInsensitivePath(path.resolve(path.dirname(entry.file),pathname));
}
export function isSharedAsset(root,file) {
  return path.resolve(file).startsWith(path.resolve(root,'content/assets')+path.sep);
}
export function canvasFileTarget(entry,canvasFile,url,root=process.cwd()) {
  let pathname;
  try {pathname=decodeURIComponent(url);} catch {throw new Error(`${entry.sourcePath}: invalid Canvas file encoding: ${url}`);}
  const variants=[pathname,pathname.replace(/(^|\/)images(?=\/|$)/g,'$1image')];
  const bases=[path.dirname(canvasFile),path.join(root,'content'),root];
  const directory=path.dirname(entry.file),candidates=[...new Set(bases.flatMap(base=>variants.map(value=>path.resolve(base,value))))];
  const safe=candidates.filter(file=>file.startsWith(directory+path.sep)||isSharedAsset(root,file));
  return safe.map(resolveCaseInsensitivePath).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile())||safe[0]||path.resolve(path.dirname(canvasFile),pathname);
}
export function validate(root = process.cwd()) {
  const {site,taxonomy} = readConfig(root), entries=getSources(root), errors=[];
  const fail = message=>errors.push(message);
  if (typeof site.name!=='string'||!site.name.trim()) fail('config/site.yml: name is required.');
  if (!/^https?:\/\//.test(site.url||'')) fail('config/site.yml: url must be an absolute http(s) URL.');
  if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(site.base)) fail('config/site.yml: base must look like / or /repository/.');
  if (!Number.isInteger(site.pageSize)||site.pageSize<1||site.pageSize>50) fail('config/site.yml: pageSize must be 1–50.');
  let date;
  try { date=today(site.timezone); } catch { fail('config/site.yml: invalid timezone.');date=today(); }
  const topics=taxonomy.topics||{}, platforms=taxonomy.platforms||{};
  for (const [kind,items] of [['topics',topics],['platforms',platforms]]) for(const [id,value] of Object.entries(items)) {
    if (!validId(id)||!value||typeof value.label!=='string'||!value.label.trim()) fail(`config/taxonomy.yml: invalid ${kind} entry ${id}.`);
    if (value?.parent && !topics[value.parent]) fail(`Topic ${id}: parent ${value.parent} does not exist.`);
  }
  for(const id of Object.keys(topics)) {
    let cursor=id;const seen=new Set();
    while(cursor&&topics[cursor]) { if(seen.has(cursor)){fail(`Topic ${id}: parent cycle.`);break;}seen.add(cursor);cursor=topics[cursor].parent; }
  }
  const routes=new Set(['/','/notes/','/write-ups/','/articles/','/topics/','/archives/','/about/','/search/','/404/']);
  for(const topic of Object.keys(topics)) routes.add(`/topics/${topic}/`);
  const seenSlugs=new Set();
  for(const entry of entries) {
    const d=entry.data, prefix=entry.sourcePath;
    if(typeof d.title!=='string'||!d.title.trim()) fail(`${prefix}: title is required.`);
    if(!validId(d.slug)) fail(`${prefix}: slug must contain lowercase words separated by hyphens.`);
    if(d.canvas!==undefined&&(typeof d.canvas!=='string'||!d.canvas.toLowerCase().endsWith('.canvas')||/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(d.canvas))) fail(`${prefix}: canvas must be a local .canvas file inside the entry folder.`);
    const key=`${entry.type}/${d.slug}`;
    if(seenSlugs.has(key)) fail(`${prefix}: duplicate slug ${d.slug}.`);
    seenSlugs.add(key);routes.add(entry.route.toLowerCase());
    if(d.draft!==undefined&&typeof d.draft!=='boolean') fail(`${prefix}: draft must be true or false.`);
    if(entry.folders.some(x=>!validId(x))) fail(`${prefix}: folder names must use lowercase-hyphenated IDs.`);
    if(entry.type==='writeups' && !platforms[entry.platform]) fail(`${prefix}: register its platform using npm run category.`);
    if(d.topics!==undefined&&(!Array.isArray(d.topics)||d.topics.some(x=>typeof x!=='string'))) fail(`${prefix}: topics must be a list of topic IDs.`);
    for(const topic of Array.isArray(d.topics)?d.topics:[]) if(!topics[topic]) fail(`${prefix}: unknown topic ${topic}. Use npm run category.`);
    if(!entry.draft) {
      if(typeof d.description!=='string'||!d.description.trim()) fail(`${prefix}: description is required before publishing.`);
      if(!validDate(d.publishedAt)) fail(`${prefix}: publishedAt must be YYYY-MM-DD.`);
      if(d.publishedAt>date) fail(`${prefix}: future publications must remain drafts.`);
      if(!Array.isArray(d.topics)||!d.topics.length) fail(`${prefix}: choose at least one topic before publishing.`);
      if(!entry.body.trim()) fail(`${prefix}: content is empty.`);
    }
    for(const key of ['publishedAt','updatedAt']) if(d[key]!==undefined&&!validDate(d[key])) fail(`${prefix}: ${key} must be a real YYYY-MM-DD date.`);
    if(d.updatedAt && d.publishedAt && d.updatedAt<d.publishedAt) fail(`${prefix}: updatedAt cannot be earlier than publishedAt.`);
    if(d.difficulty&&!['easy','medium','hard','insane'].includes(d.difficulty)) fail(`${prefix}: invalid difficulty.`);
    if(d.order!==undefined&&(!Number.isFinite(d.order)||d.order<0)) fail(`${prefix}: order must be a non-negative number.`);
    if(d.aliases!==undefined&&(!Array.isArray(d.aliases)||d.aliases.some(x=>typeof x!=='string'||!/^\/(?:[a-z0-9-]+\/)+$/.test(x)))) fail(`${prefix}: aliases must be root-relative paths with a trailing slash.`);
  }
  const byFile=new Map(entries.map(e=>[e.file,e])),byRoute=new Map(entries.map(e=>[e.route.toLowerCase(),e]));
  for(const entry of entries) {
    for(const alias of Array.isArray(entry.data.aliases)?entry.data.aliases:[]) {
      const normalizedAlias=alias.toLowerCase();
      if(routes.has(normalizedAlias)) fail(`${entry.sourcePath}: alias collision ${alias}.`);
      routes.add(normalizedAlias);
    }
    const refs=references(entry.body).result;
    if(typeof entry.data.canvas==='string')refs.push({url:entry.data.canvas,canvas:true,sidecar:true});
    for(const ref of refs) {
      const url=ref.url;
      if(/^(?:javascript|data|vbscript):/i.test(url)) {fail(`${entry.sourcePath}: unsupported URL scheme ${url.split(':')[0]}.`);continue;}
      if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
      if(url.startsWith('/')) {
        const clean=url.split(/[?#]/)[0];
        const unbased=site.base!=='/'&&clean.startsWith(site.base)?'/'+clean.slice(site.base.length):clean;
        const canonicalRoute=normalizeRoute(unbased.endsWith('/')?unbased:`${unbased}/`,byRoute);
        const target=canonicalRoute?byRoute.get(canonicalRoute.toLowerCase()):undefined;
        if(!entry.draft&&target?.draft) fail(`${entry.sourcePath}: public content links to draft ${target.sourcePath}.`);
        continue;
      }
      const target=localTarget(entry,url),shared=isSharedAsset(root,target);
      if(!fs.existsSync(target)||!fs.statSync(target).isFile()) {fail(`${entry.sourcePath}: missing local file ${url}.`);continue;}
      if(target.endsWith('.md')) {
        const found=byFile.get(target);
        if(!found) fail(`${entry.sourcePath}: link does not point to a content entry: ${url}.`);
        else if(!entry.draft&&found.draft) fail(`${entry.sourcePath}: public content links to draft ${found.sourcePath}.`);
      } else if(!shared&&!target.startsWith(path.dirname(entry.file)+path.sep)) fail(`${entry.sourcePath}: keep attachments inside their own entry folder or content/assets: ${url}.`);
      if(ref.canvas) {
        let canvas;
        try {canvas=readCanvas(target);} catch(error) {fail(`${entry.sourcePath}: ${error.message}`);continue;}
        for(const node of canvas.nodes) if(node.type==='file'&&typeof node.file==='string'&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(node.file)) {
          let file;
          try {file=canvasFileTarget(entry,target,node.file,root);} catch(error) {fail(error.message);continue;}
          if(!isSharedAsset(root,file)&&!file.startsWith(path.dirname(entry.file)+path.sep)) fail(`${entry.sourcePath}: keep Canvas attachments inside their own entry folder or content/assets: ${node.file}.`);
          else if(!fs.existsSync(file)||!fs.statSync(file).isFile()) fail(`${entry.sourcePath}: missing Canvas attachment ${node.file}.`);
        }
      }
    }
  }
  if(errors.length) throw new Error(errors.join('\n'));
  return {site,taxonomy,entries};
}
export const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);
