import path from 'node:path';
import fs from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { readConfig,getSources,walk,pretty,slugify } from '../src/lib/model.mjs';
import { createEntry,addCategory,publishEntry,typeAlias } from './content-ops.mjs';
const [command,...argv]=process.argv.slice(2),args={};
for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))args[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;else(args._??=[]).push(argv[i]);}
const root=process.cwd();let rl;
const ask=async(label,fallback='')=>{rl??=createInterface({input:stdin,output:stdout});const value=(await rl.question(`${label}${fallback?` [${fallback}]`:''}: `)).trim();return value||fallback;};
async function choose(label,items){
  console.log(`\n${label}`);items.forEach((item,i)=>console.log(`  ${i+1}. ${item.label}`));
  while(true){const n=Number(await ask('Choose a number','1'));if(n>=1&&n<=items.length&&Number.isInteger(n))return items[n-1].value;console.log('Choose one of the listed numbers.');}
}
function help(){console.log(`\nContent commands\n\n  npm run new\n  npm run category\n  npm run publish:content\n\nNoninteractive examples:\n  npm run category -- --type folder --name "API Security"\n  npm run category -- --type topic --name Docker --parent linux\n  npm run new -- --type note --root --title "Amaterasu" --description "Lab notes" --topics linux --canvas\n  npm run new -- --type writeup --category offsec --title "Amaterasu" --description "My lab walkthrough" --topics linux --canvas\n  npm run publish:content -- content/writeups/first-lab/index.md\n\nNew entries are drafts. Publishing prepares local files; it never commits or pushes.\n`);}
try {
  if(args.help){help();}
  else if(command==='category') {
    const type=args.type||await choose('What are you adding?',[{value:'folder',label:'Notes folder'},{value:'platform',label:'Write-ups platform'},{value:'topic',label:'Shared topic'}]);
    const name=args.name||await ask('Display name');
    const parent=args.parent??(type==='platform'?'':await ask(type==='folder'?'Parent folder path (blank for top level)':'Parent topic ID (blank for top level)'));
    const id=addCategory(root,{type,name,parent,id:args.id});
    console.log(`Created ${type}: ${id}. It appears publicly when published content uses it.`);
  } else if(command==='new') {
    const type=typeAlias(args.type||await choose('What do you want to write?',[{value:'note',label:'Note'},{value:'writeup',label:'Write-up'},{value:'article',label:'Article / blog'}]));
    if(!type)throw new Error('Unknown content type.');
    const options={...args,type};
    if(type==='writeups'&&!options.category) {
      const {taxonomy}=readConfig(root);
      options.category=await choose('Platform',[...Object.entries(taxonomy.platforms).map(([value,x])=>({value,label:x.label})),{value:'__new',label:'Create a new platform'}]);
      if(options.category==='__new'){options.categoryLabel=await ask('Platform name');options.category=slugify(options.categoryLabel);}
    }
    if(type==='notes'&&!options.category&&!options.root){
      const folders=[...new Set(getSources(root).filter(x=>x.type==='notes').map(x=>x.folders.join('/')))].filter(Boolean);
      options.category=await choose('Notes folder',[{value:'',label:'Root level'},...folders.map(value=>({value,label:value})),{value:'__new',label:'Create a new folder'}]);
      if(options.category==='__new') {options.categoryLabel=await ask('Folder display name');const parent=await ask('Parent folder path (optional)');options.category=addCategory(root,{type:'folder',name:options.categoryLabel,parent});}
    }
    options.title??=await ask('Title');options.description??=await ask('One-sentence description');
    if(!options.topics){
      let {taxonomy}=readConfig(root);
      console.log('\nAvailable topics: '+Object.entries(taxonomy.topics).map(([id,x])=>`${id} (${x.label})`).join(', '));
      options.topics=await ask('Topic IDs, separated by commas','web-security');
      for(const id of options.topics.split(',').map(x=>x.trim()).filter(Boolean))if(!taxonomy.topics[id]) {
        if((await ask(`Create new topic "${id}"? y/n`,'n')).toLowerCase()==='y'){const label=await ask('Display label',pretty(id));const parent=await ask('Parent topic ID (optional)');addCategory(root,{type:'topic',name:label,id,parent});}
      }
    }
    if(type==='writeups'&&!args.type){options.difficulty=await ask('Difficulty: easy / medium / hard / insane (optional)');}
    const file=createEntry(root,options);console.log(`\nDraft created: ${path.relative(root,file)}\nWrite your content, then run npm run dev to preview.`);
  } else if(command==='publish') {
    let file=args._?.[0];
    if(!file){const entries=getSources(root);if(!entries.length)throw new Error('Create an entry first.');file=await choose('Choose an entry to publish or update',entries.map(e=>({value:e.sourcePath,label:`${e.draft?'Draft':'Published'} · ${e.data.title} (${e.sourcePath})`})) );}
    const data=publishEntry(root,file);console.log(`\nReady: ${data.title}\n${file}\nRun npm run build, then commit and push when ready.`);
  } else help();
} catch(error){console.error(`\n${error.message}`);process.exitCode=1;}finally{rl?.close();}
