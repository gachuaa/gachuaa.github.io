import { validate } from '../src/lib/model.mjs';
try {
  const {entries}=validate();
  console.log(`Content check passed: ${entries.filter(e=>!e.draft).length} published, ${entries.filter(e=>e.draft).length} drafts.`);
} catch(error) {console.error(`\nContent needs attention:\n${error.message}\n`);process.exitCode=1;}
