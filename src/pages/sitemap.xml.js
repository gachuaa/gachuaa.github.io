import { allEntries, site, url } from '../lib/content';

export async function GET() {
  const entries = await allEntries();
  const paths = ['/', '/write-ups/', '/notes/', '/articles/', '/topics/', '/archives/', '/about/', ...entries.map((entry) => `/${entry.data.type === 'writeups' ? 'write-ups' : entry.data.type}/${String(entry.id).toLowerCase()}/`)];
  const urls = [...new Set(paths)].map((path) => `<url><loc>${new URL(url(path), site.url).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
