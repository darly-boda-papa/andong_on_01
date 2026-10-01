// 안동시 버스정보(bus.andong.go.kr) 프록시. API 키 불필요.
//  /api/bus?mode=search&q=안동역        정류장 이름 검색
//  /api/bus?mode=nearby&lat=..&lng=..   좌표 주변 정류장
//  /api/bus?mode=arrivals&nodeId=..     정류장 도착 예정 버스
//  /api/bus?mode=route&routeId=..       노선 정류장 + 운행 중 차량 실시간 위치
const BASE = 'http://bus.andong.go.kr/m01/s04.do';

// 정류장 목록(약 1.3MB)은 거의 바뀌지 않으므로 인스턴스 메모리에 캐시한다.
let stationCache = { at: 0, list: null };
const STATION_TTL = 6 * 3600 * 1000;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AndongOn' } });
  if (!r.ok) throw new Error(`안동시 버스 서버 응답 ${r.status}`);
  return r.json();
}

async function stations() {
  if (stationCache.list && Date.now() - stationCache.at < STATION_TTL) return stationCache.list;
  const all = await getJson(`${BASE}?tab=1`);
  const list = all
    .filter((s) => s.useYn !== 'N')
    .map((s) => ({ nodeId: String(s.stationId), name: s.stationNm, no: s.mobiNum || '', lat: s.gpsY, lng: s.gpsX }));
  stationCache = { at: Date.now(), list };
  return list;
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export default async function handler(req, res) {
  const { mode = 'arrivals', q, lat, lng, nodeId, routeId } = req.query || {};
  try {
    if (mode === 'search') {
      const key = String(q || '').trim().slice(0, 30);
      if (!key) return res.status(400).json({ error: 'BAD_REQUEST', message: 'q 필요' });
      const items = (await stations()).filter((s) => s.name.includes(key) || s.no === key).slice(0, 30);
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ items });
    }
    if (mode === 'nearby') {
      const la = parseFloat(lat);
      const ln = parseFloat(lng);
      if (isNaN(la) || isNaN(ln)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'lat,lng 필요' });
      const items = (await stations())
        .map((s) => ({ ...s, dist: km(la, ln, s.lat, s.lng) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 10);
      return res.status(200).json({ items });
    }
    if (mode === 'route') {
      if (!/^\d+$/.test(String(routeId || ''))) return res.status(400).json({ error: 'BAD_REQUEST', message: 'routeId 필요' });
      const [stops, vehicles] = await Promise.all([
        getJson(`${BASE}?i=${routeId}&tab=4`),
        getJson(`${BASE}?i=${routeId}&tab=5`),
      ]);
      res.setHeader('Cache-Control', 's-maxage=5');
      return res.status(200).json({
        stops: stops
          .filter((s) => s.gpsX && s.gpsY)
          .sort((a, b) => a.stationOrd - b.stationOrd)
          .map((s) => ({ ord: s.stationOrd, id: String(s.stationId), name: s.stationNm, lat: s.gpsY, lng: s.gpsX })),
        vehicles: vehicles
          .filter((v) => v.gpsX && v.gpsY)
          .map((v) => ({ id: String(v.vehId), plate: v.plateNo, lat: v.gpsY, lng: v.gpsX, ord: v.stationOrd, speed: v.runSpd, at: v.eventDt })),
        fetchedAt: new Date().toISOString(),
      });
    }
    if (!/^\d+$/.test(String(nodeId || ''))) return res.status(400).json({ error: 'BAD_REQUEST', message: 'nodeId 필요' });
    const rows = await getJson(`${BASE}?i=${nodeId}&tab=2`);
    const items = rows
      .map((a) => ({
        routeId: String(a.routeId),
        route: String(a.routeNum),
        via: a.via || '',
        seconds: Math.round(Number(a.predictTm) * 60),
        stopsLeft: Number(a.remainStation),
      }))
      .filter((a) => !isNaN(a.seconds))
      .sort((a, b) => a.seconds - b.seconds);
    res.setHeader('Cache-Control', 's-maxage=15');
    res.status(200).json({ items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    const cause = e.cause?.code || '';
    res.status(502).json({ error: 'BUS_FETCH_FAILED', message: `${e.message || e}${cause ? ` (${cause})` : ''}` });
  }
}
