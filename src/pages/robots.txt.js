import { site, url } from '../lib/content';

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL(url('/sitemap.xml'), site.url).href}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
