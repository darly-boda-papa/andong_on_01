// 안동 관련 최신 뉴스 (Google News RSS). API 키 불필요.
const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
};

export default async function handler(req, res) {
  const q = (req.query?.q || '안동시').toString().slice(0, 60);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AndongOn' } });
    if (!r.ok) throw new Error(`RSS ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map(([, it]) => {
      const rawTitle = pick(it, 'title');
      const source = pick(it, 'source');
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      return { title, source, link: pick(it, 'link'), pubDate: pick(it, 'pubDate') };
    });
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    const cause = e.cause?.code || e.cause?.message || '';
    res.status(502).json({ error: 'NEWS_FETCH_FAILED', message: `${e.message || e}${cause ? ` (${cause})` : ''}` });
  }
}
