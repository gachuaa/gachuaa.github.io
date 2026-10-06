import { getCollection } from 'astro:content';
import siteRaw from '../../config/site.yml?raw';
import taxonomyRaw from '../../config/taxonomy.yml?raw';
import { parse } from 'yaml';
import { normalizeBase, withBase, PREFIX, LABELS } from './model.mjs';
export const site=parse(siteRaw);
site.base=normalizeBase(import.meta.env.SITE_BASE||site.base);
site.url=import.meta.env.SITE_URL||site.url;
export const taxonomy=parse(taxonomyRaw);
export const url=(path:string)=>withBase(path,site.base);
export const entryUrl=(entry:any)=>url(`/${PREFIX[entry.data.type as keyof typeof PREFIX]}/${String(entry.id).toLowerCase()}/`);
export const typeLabel=(type:string)=>LABELS[type as keyof typeof LABELS];
export const formatDate=(value?:string)=>value?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):'Draft';
export const topicLabel=(id:string)=>taxonomy.topics[id]?.label||id;
export async function allEntries(){
  const groups=await Promise.all(['notes','writeups','articles'].map(type=>getCollection(type)));
  return groups.flat().filter(e=>import.meta.env.DEV||!e.data.draft).sort((a,b)=>(b.data.publishedAt||'9999').localeCompare(a.data.publishedAt||'9999')||a.data.title.localeCompare(b.data.title));
}
export function expandedTopics(ids:string[]){
  const output=new Set(ids);
  for(const id of ids){let parent=taxonomy.topics[id]?.parent;while(parent&&!output.has(parent)){output.add(parent);parent=taxonomy.topics[parent]?.parent;}}
  return [...output];
}
export function topicEntries(entries:any[],id:string){return entries.filter(e=>expandedTopics(e.data.topics).includes(id));}
export function relatedEntries(entry:any,entries:any[]){
  return entries.filter(e=>!(e.id===entry.id&&e.data.type===entry.data.type)).map(e=>({entry:e,score:e.data.topics.filter((t:string)=>entry.data.topics.includes(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.entry);
}
