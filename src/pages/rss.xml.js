import { allEntries, entryUrl, site } from '../lib/content';

const escapeXml = (value = '') => String(value).replace(/[<>&'\"]/g, (char) => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;', '\"':'&quot;'}[char]));

export async function GET() {
  const entries = await allEntries();
  const items = entries.slice(0, 30).map((entry) => `<item><title>${escapeXml(entry.data.title)}</title><link>${new URL(entryUrl(entry), site.url).href}</link><guid>${new URL(entryUrl(entry), site.url).href}</guid><description>${escapeXml(entry.data.description || '')}</description><pubDate>${new Date(`${entry.data.publishedAt}T12:00:00Z`).toUTCString()}</pubDate></item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(site.name)}</title><link>${site.url}</link><description>${escapeXml(site.tagline)}</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
