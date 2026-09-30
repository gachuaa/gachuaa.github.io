import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { TYPES, slugify, validId, readConfig, getSources, parseMarkdown, markdownText, validate, today, pretty } from '../src/lib/model.mjs';

export const typeAlias=value=>({note:'notes',notes:'notes',writeup:'writeups','write-up':'writeups',writeups:'writeups',article:'articles',articles:'articles',blog:'articles'})[value];
function folderId(value) {
  const segments=String(value||'').split('/').filter(Boolean).map(slugify);
  if(!segments.length||segments.some(x=>!validId(x)))throw new Error('Choose a nonempty category name.');
  return segments.join('/');
}
export function addCategory(root,{type,name,parent='',id}) {
  const {taxonomy}=readConfig(root),key=id||slugify(name);
  if(!validId(key))throw new Error('Category ID must use lowercase letters, numbers, and hyphens.');
  if(type==='folder') {
    const group=parent?`${folderId(parent)}/${key}`:key;
    const directory=path.join(root,'content/notes',group);
    fs.mkdirSync(directory,{recursive:true});
    const meta=path.join(directory,'_folder.yml');
    if(!fs.existsSync(meta))fs.writeFileSync(meta,stringify({label:name||pretty(key)}));
    return group;
  }
  const map=type==='platform'?'platforms':type==='topic'?'topics':null;
  if(!map)throw new Error('Category type must be folder, platform, or topic.');
  taxonomy[map]??={};
  if(taxonomy[map][key])return key;
  if(parent && (type!=='topic'||!taxonomy.topics[parent]))throw new Error('Choose an existing parent topic.');
  taxonomy[map][key]={label:name||pretty(key),...(parent?{parent}:{})};
  fs.writeFileSync(path.join(root,'config/taxonomy.yml'),stringify(taxonomy,{lineWidth:0}));
  return key;
}
export function createEntry(root,options) {
  const type=typeAlias(options.type);
  if(!type)throw new Error('Choose note, writeup, or article.');
  if(!options.title?.trim())throw new Error('A title is required.');
  let category='';
  if(type==='notes') {
    category=folderId(options.category||'general');
    const directory=path.join(root,'content/notes',category);fs.mkdirSync(directory,{recursive:true});
    const meta=path.join(directory,'_folder.yml');
    if(!fs.existsSync(meta))fs.writeFileSync(meta,stringify({label:options.categoryLabel||pretty(category.split('/').at(-1))}));
  }
  if(type==='writeups') category=addCategory(root,{type:'platform',name:options.categoryLabel||options.category||'Other',id:slugify(options.category||'other')});
  const entryName=slugify(options.title),slug=options.slug||(type==='writeups'?`${category}-${entryName}`:entryName);
  if(!validId(slug))throw new Error('The generated slug is empty or invalid; use --slug.');
  if(getSources(root).some(e=>e.type===type&&e.data.slug===slug))throw new Error(`Slug ${slug} already exists. Use a different title or --slug.`);
  const topics=Array.isArray(options.topics)?options.topics:String(options.topics||'').split(',').map(x=>x.trim()).filter(Boolean);
  const {taxonomy}=readConfig(root);
  for(const topic of topics)if(!taxonomy.topics[topic])throw new Error(`Unknown topic ${topic}. Add it first with npm run category.`);
  const directory=path.join(root,'content',type,category,entryName||slug),file=path.join(directory,'index.md');
  if(fs.existsSync(file))throw new Error(`Entry folder already exists: ${path.relative(root,directory)}.`);
  const data={title:options.title.trim(),description:options.description||'',slug,topics,draft:true};
  if(options.difficulty)data.difficulty=options.difficulty;
  if(options.os)data.os=options.os;
  const template=fs.readFileSync(path.join(root,'templates',`${{notes:'note',writeups:'writeup',articles:'article'}[type]}.md`),'utf8');
  fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(path.join(directory,'images'),{recursive:true});
  fs.writeFileSync(file,markdownText(data,template));
  try{validate(root);}catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
  return file;
}
export function publishEntry(root,file) {
  const resolved=path.resolve(root,file),entry=getSources(root).find(e=>e.file===resolved);
  if(!entry)throw new Error('Choose an existing content index.md file.');
  const original=fs.readFileSync(resolved,'utf8'),{data,body}=parseMarkdown(original,resolved);
  const {site}=readConfig(root),date=today(site.timezone);
  if(data.publishedAt)data.updatedAt=date;else data.publishedAt=date;
  data.draft=false;fs.writeFileSync(resolved,markdownText(data,body));
  try{validate(root);}catch(error){fs.writeFileSync(resolved,original);throw error;}
  return data;
}
