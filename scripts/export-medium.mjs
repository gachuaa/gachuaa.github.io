import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { getSources, parseMarkdown, readConfig } from '../src/lib/model.mjs';
import { prepare } from './prepare.mjs';

function containsCanvasLink(node) {
  if (node.type === 'link' && /#canvas(?:$|[?&])/i.test(node.url || '')) return true;
  return node.children?.some(containsCanvasLink) || false;
}

function cleanCanvas(tree) {
  function visit(node) {
    if (!Array.isArray(node.children)) return;
    node.children = node.children.filter(child =>
      !(child.type === 'html' && /canvas-board/i.test(child.value || '')) && !containsCanvasLink(child)
    );
    node.children.forEach(visit);
  }
  visit(tree);
}

function absoluteUrl(value, site) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
  return new URL(value, `${site.url}${site.base}`).href;
}

function makeUrlsAbsolute(tree, site) {
  function visit(node) {
    if (node.type === 'link' || node.type === 'image') node.url = absoluteUrl(node.url, site);
    if (node.type === 'html') {
      node.value = node.value.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (match, key, quote, value) =>
        `${key}=${quote}${absoluteUrl(value, site)}${quote}`
      );
    }
    node.children?.forEach(visit);
  }
  visit(tree);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export async function exportMedium(root, sourcePath) {
  const sourceFile = path.resolve(root, sourcePath);
  const writeupsDir = path.resolve(root, 'content/writeups');
  const relative = path.relative(writeupsDir, sourceFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.basename(sourceFile) !== 'index.md') {
    throw new Error('Provide a write-up index.md path under content/writeups/.');
  }

  const entry = getSources(root).find(item => item.file === sourceFile && item.type === 'writeups');
  if (!entry) throw new Error(`Write-up not found: ${sourcePath}`);
  if (entry.draft) throw new Error('Publish the write-up on your site before exporting it for Medium.');

  const { site } = readConfig(root);
  await prepare(root);
  const preparedPath = path.join(root, '.generated/content/writeups', `${entry.data.slug}.md`);
  const { body } = parseMarkdown(fs.readFileSync(preparedPath, 'utf8'), preparedPath);
  const tree = marked.lexer(body);
  cleanCanvas(tree);
  makeUrlsAbsolute(tree, site);
  const article = marked.parser(tree);
  const canonical = new URL(entry.route, `${site.url}${site.base}`).href;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="canonical-url" content="${escapeHtml(canonical)}">
  <title>${escapeHtml(entry.data.title)} - Medium export</title>
  <style>
    body{max-width:760px;margin:48px auto;padding:0 24px;color:#252525;font:18px/1.7 Georgia,serif}
    h1,h2,h3,h4{font-family:system-ui,sans-serif;line-height:1.25;margin:1.8em 0 .6em}
    h1{font-size:2em}h2{font-size:1.55em}h3{font-size:1.25em}
    img{display:block;max-width:100%;height:auto;margin:1.5em auto}
    pre{overflow:auto;padding:18px;background:#f3f3f3;border-radius:4px;font:14px/1.6 ui-monospace,monospace}
    code{font-family:ui-monospace,monospace}blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:20px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}
    hr{border:0;border-top:1px solid #ccc;margin:2em 0}
  </style>
</head>
<body>
  <article>${article}</article>
</body>
</html>
`;
  const output = path.join(root, 'exports/medium', `${entry.data.slug}.html`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const source = process.argv[2];
    if (!source || source.startsWith('--')) throw new Error('Usage: npm run export:medium -- content/writeups/<entry>/index.md');
    const output = await exportMedium(process.cwd(), source);
    console.log(`Medium export ready: ${path.relative(process.cwd(), output)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}