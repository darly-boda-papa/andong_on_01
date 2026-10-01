// 한국관광공사 TourAPI(KorService2) 프록시. 안동 = 법정동 시도 47 / 시군구 170
// type = festival(축제·행사) | spot(관광지) | food(음식점)
const BASE = 'https://apis.data.go.kr/B551011/KorService2';
const TYPES = {
  festival: { op: 'searchFestival2', extra: () => ({ eventStartDate: ymd(addDays(new Date(), -60)) }) },
  spot: { op: 'areaBasedList2', extra: () => ({ contentTypeId: 12, arrange: 'C' }) },
  food: { op: 'areaBasedList2', extra: () => ({ contentTypeId: 39, arrange: 'C' }) },
};

const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function call(base, op, params) {
  const qs = new URLSearchParams({
    serviceKey: process.env.TOUR_API_KEY,
    MobileOS: 'ETC',
    MobileApp: 'AndongOn',
    _type: 'json',
    numOfRows: '100',
    pageNo: '1',
    lDongRegnCd: '47',
    lDongSignguCd: '170',
    ...params,
  });
  const r = await fetch(`${base}/${op}?${qs}`);
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`TourAPI 응답 오류(${r.status}): ${text.slice(0, 120)}`);
  }
  const code = json?.response?.header?.resultCode;
  if (code && code !== '0000') throw new Error(`TourAPI ${code}: ${json.response.header.resultMsg}`);
  const item = json?.response?.body?.items?.item;
  return Array.isArray(item) ? item : item ? [item] : [];
}

export default async function handler(req, res) {
  if (!process.env.TOUR_API_KEY) {
    return res.status(503).json({ error: 'NO_KEY', message: 'TOUR_API_KEY 환경변수가 설정되지 않았습니다.' });
  }
  const type = TYPES[req.query?.type] ? req.query.type : 'festival';
  const { op, extra } = TYPES[type];
  try {
    let list = await call(BASE, op, extra());
    const today = ymd(new Date());
    if (type === 'festival') {
      list = list.filter((i) => !i.eventenddate || i.eventenddate >= today);
      list.sort((a, b) => (a.eventstartdate || '').localeCompare(b.eventstartdate || ''));
    }
    const items = list.map((i) => ({
      id: i.contentid,
      title: i.title,
      addr: [i.addr1, i.addr2].filter(Boolean).join(' '),
      image: i.firstimage || i.firstimage2 || '',
      lat: parseFloat(i.mapy) || null,
      lng: parseFloat(i.mapx) || null,
      tel: i.tel || '',
      cat1: i.lclsSystm1 || '',
      cat2: i.lclsSystm2 || '',
      start: i.eventstartdate || '',
      end: i.eventenddate || '',
    }));
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200');
    return res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: 'TOUR_FETCH_FAILED', message: String(e?.message || e) });
  }
}
