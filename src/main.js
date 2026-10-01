import './style.css';
import { PRESETS, PLACES, HERITAGE, CHRONICLE } from './data.js';
import { store } from './store.js';
import * as api from './api.js';
import { CHIPS, catLabel } from './categories.js';

// ───────────────────────── 유틸 ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');

function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function ago(dateStr) {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m || 1}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  if (m < 43200) return `${Math.floor(m / 1440)}일 전`;
  return new Date(t).toLocaleDateString('ko-KR');
}

const fmtYmd = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : '');
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '--:--');

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  const icon = kind === 'ok' ? 'ph-check-circle text-emerald-400' : 'ph-warning-circle text-amber-400';
  el.className =
    'toast-anim mb-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-stone-900/95 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md';
  el.innerHTML = `<i class="ph-fill ${icon} text-base"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  }, 2800);
}

// 간단한 TTL 캐시 (새로고침 버튼으로 비움)
const cache = new Map();
function cached(key, loader, ttl = 5 * 60000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = loader().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { t: Date.now(), p });
  return p;
}

// ───────────────────────── 상태 ─────────────────────────
let here = { ...PRESETS.andong_station, label: PRESETS.andong_station.name, gps: false };
const live = { news: [], events: [], spots: [], foods: [] }; // 검색용 최신 데이터 스냅샷
let lastSync = null;

const NAV = [
  { id: 'home', label: '홈', icon: 'ph-house' },
  { id: 'news', label: '소식', icon: 'ph-newspaper' },
  { id: 'places', label: '명소', icon: 'ph-mountains' },
  { id: 'food', label: '미식', icon: 'ph-fork-knife' },
  { id: 'heritage', label: '역사·전통', icon: 'ph-scroll' },
];

const TAG = {
  blue: 'bg-blue-50 text-andong-navy',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-andong-vermilion',
  stone: 'bg-stone-100 text-stone-700',
};

// ───────────────────────── 위치 ─────────────────────────
function distText(lat, lng) {
  if (lat == null || lng == null) return '';
  const km = haversine(here.lat, here.lng, lat, lng);
  if (km < 1) return `📍 ${Math.round(km * 1000)}m · 도보 약 ${Math.max(2, Math.round(km * 14))}분`;
  return `📍 ${km.toFixed(1)}km · 차량 약 ${Math.max(3, Math.round((km / 40) * 60))}분`;
}

function updateDistances() {
  document.querySelectorAll('[data-dist]').forEach((el) => {
    el.textContent = distText(parseFloat(el.dataset.lat), parseFloat(el.dataset.lng));
  });
  const name = $('#here-name');
  if (name) name.textContent = here.gps ? '현재 내 위치(GPS)' : `기준: ${here.label}`;
  const lbl = $('#gps-label');
  if (lbl) lbl.textContent = here.gps ? 'GPS 사용 중' : '내 위치';
}

function getPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('NO_GEO'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000,
      ...opts,
    });
  });
}

async function useGps() {
  toast('현재 위치를 확인하는 중입니다…');
  try {
    const p = await getPosition();
    here = { lat: p.coords.latitude, lng: p.coords.longitude, label: '내 위치', gps: true, accuracy: p.coords.accuracy };
    updateDistances();
    toast(`내 위치를 반영했습니다 (오차 약 ${Math.round(p.coords.accuracy)}m)`);
    return true;
  } catch (e) {
    toast(
      e.code === 1 ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.' : '위치를 가져오지 못했습니다.',
      'warn'
    );
    return false;
  }
}

function setPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  here = { ...p, label: p.name, gps: false };
  updateDistances();
  toast(`${p.name} 기준으로 거리를 다시 계산했습니다.`);
}

// ───────────────────────── 공용 컴포넌트 ─────────────────────────
const loadingBlock = (n = 3) =>
  Array.from({ length: n }, () => `<div class="skeleton h-20 rounded-2xl"></div>`).join('');

function errorBlock(e, what) {
  if (e?.code === 'NO_KEY') {
    return `<div class="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
      <b>${esc(what)}</b> 표시에는 공공데이터포털 API 키 설정이 필요합니다.<br/>
      <span class="text-amber-800/80">배포 환경 변수(또는 로컬 .env)에 키를 넣어 주세요. 자세한 방법은 README 참고.</span></div>`;
  }
  return `<div class="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600">
    <span>${esc(what)}을(를) 불러오지 못했습니다. <span class="text-stone-400">${esc(e?.message || '')}</span></span>
    <button data-action="refresh" class="shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 font-bold text-andong-navy">다시 시도</button></div>`;
}

function bmData(it) {
  return esc(JSON.stringify({ id: it.id, title: it.title || it.name, addr: it.addr || '', lat: it.lat ?? null, lng: it.lng ?? null, kind: it.kind || 'tour' }));
}

function bookmarkBtn(it) {
  const on = store.isBookmarked(it.id);
  return `<button data-action="bookmark" data-item="${bmData(it)}" aria-label="보관" class="rounded-full p-1.5 transition hover:bg-stone-100 ${on ? 'text-andong-vermilion' : 'text-stone-400'}">
    <i class="ph${on ? '-fill' : ''} ph-bookmark-simple text-lg"></i></button>`;
}

function navBtn(name, lat, lng, cls = '') {
  if (lat == null || lng == null) return '';
  return `<button data-action="nav" data-name="${esc(name)}" data-lat="${lat}" data-lng="${lng}"
    class="flex items-center gap-1 rounded-lg bg-andong-navy px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95 ${cls}">
    <i class="ph ph-navigation-arrow"></i> 길찾기</button>`;
}

function placeCard(p) {
  const stamped = store.hasStamp(p.id);
  const canStamp = p.kind === 'attraction' && p.lat != null;
  return `<article id="card-${p.id}" class="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
    <div class="mb-1 flex items-start justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="rounded px-2 py-0.5 text-[10px] font-bold ${TAG[p.tagColor] || TAG.stone}">${esc(p.tag)}</span>
        <span data-dist data-lat="${p.lat ?? ''}" data-lng="${p.lng ?? ''}" class="text-[11px] font-bold text-amber-600">${distText(p.lat, p.lng)}</span>
      </div>
      ${bookmarkBtn({ ...p, title: p.name })}
    </div>
    <h3 class="font-serif text-lg font-bold text-stone-900">${esc(p.name)}</h3>
    <p class="text-[11px] text-stone-400">${esc(p.sub)}</p>
    <p class="mt-1.5 text-xs leading-relaxed text-stone-600">${esc(p.desc)}</p>
    ${p.extra ? `<div class="mt-2 flex flex-wrap gap-1.5 text-[11px] text-stone-500">${p.extra.map((x) => `<span class="rounded bg-stone-100 px-2 py-1">${esc(x)}</span>`).join('')}</div>` : ''}
    <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 mt-3">
      <span class="text-[11px] text-stone-500">${esc(p.addr)}</span>
      <div class="flex items-center gap-1.5">
        <button data-action="audio" data-id="${p.id}" class="flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200"><i class="ph ph-headphones"></i> 해설</button>
        ${canStamp ? `<button data-action="stamp" data-id="${p.id}" class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${stamped ? 'bg-emerald-100 text-emerald-700' : 'bg-andong-vermilion/10 text-andong-vermilion hover:bg-andong-vermilion/20'}"><i class="ph${stamped ? '-fill' : ''} ph-seal-check"></i> ${stamped ? '스탬프 완료' : '스탬프'}</button>` : ''}
        ${navBtn(p.name, p.lat, p.lng)}
      </div>
    </div>
  </article>`;
}

function tourCard(it, kind) {
  const full = { ...it, id: `tour:${it.id}`, kind };
  const period = it.start ? `${fmtYmd(it.start)} ~ ${fmtYmd(it.end)}` : '';
  return `<article id="card-tour-${esc(it.id)}" class="flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
    ${it.image ? `<img src="${esc(safeUrl(it.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" class="aspect-[16/10] w-full object-cover" onerror="this.remove()" />` : ''}
    <div class="flex flex-1 flex-col p-4">
      ${catLabel(it.cat2) ? `<span class="mb-1.5 w-fit rounded-full bg-andong-navy/10 px-2 py-0.5 text-[10px] font-bold text-andong-navy">${esc(catLabel(it.cat2))}</span>` : ''}
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-serif text-base font-bold leading-snug text-stone-900">${esc(it.title)}</h3>
        ${bookmarkBtn(full)}
      </div>
      ${period ? `<p class="mt-1 text-[11px] font-bold text-andong-vermilion">${period}</p>` : ''}
      <p class="mt-1 text-[11px] text-stone-500">${esc(it.addr)}</p>
      <div class="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
        <span data-dist data-lat="${it.lat ?? ''}" data-lng="${it.lng ?? ''}" class="text-[11px] font-bold text-amber-600">${distText(it.lat, it.lng)}</span>
        <div class="flex gap-1.5">
          ${it.tel ? `<a href="tel:${esc(it.tel.replace(/[^0-9+\-]/g, ''))}" class="flex items-center rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-700"><i class="ph ph-phone"></i></a>` : ''}
          ${navBtn(it.title, it.lat, it.lng)}
        </div>
      </div>
    </div>
  </article>`;
}

function newsList(items, limit) {
  if (!items.length) return `<p class="rounded-2xl bg-white p-4 text-xs text-stone-500">표시할 소식이 없습니다.</p>`;
  return `<ul class="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
    ${items.slice(0, limit).map((n) => `<li><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer" class="block px-4 py-3 transition hover:bg-stone-50">
      <p class="text-sm font-semibold leading-snug text-stone-900">${esc(n.title)}</p>
      <p class="mt-1 text-[11px] text-stone-400">${esc(n.source)}${n.source ? ' · ' : ''}${ago(n.pubDate)}</p></a></li>`).join('')}
  </ul>`;
}

const sectionHead = (title, sub = '', link = '') => `<div class="mb-3 flex items-end justify-between">
  <div><h2 class="font-serif text-xl font-bold text-andong-dark">${title}</h2>${sub ? `<p class="text-[11px] text-stone-500">${sub}</p>` : ''}</div>
  ${link ? `<a href="${link}" class="text-xs font-bold text-andong-navy">더보기 ›</a>` : ''}</div>`;

// ───────────────────────── 뷰 ─────────────────────────
const views = {
  home() {
    const stop = store.busStop();
    return `
    <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-andong-navy via-[#1e344d] to-slate-900 p-5 text-white md:p-8">
      <div class="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5 blur-2xl"></div>
      <div class="relative grid gap-5 md:grid-cols-2 md:items-center">
        <div>
          <span class="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"></span> 오늘의 안동</span>
          <h1 class="mt-3 font-serif text-2xl font-bold leading-tight md:text-4xl">천년의 숨결이 흐르는<br/><span class="font-black text-amber-200">낙동강과 하회마을</span></h1>
          <p class="mt-2 text-xs leading-relaxed text-stone-300 md:text-sm">고택의 돌담길과 서원, 향토 음식까지 — 지금 안동의 날씨와 소식을 함께 확인하세요.</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button data-action="audio" data-id="hahoe" class="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-andong-dark shadow-md transition active:scale-95"><i class="ph ph-headphones text-base text-andong-navy"></i> 오디오 해설 듣기</button>
            <a href="#/places" class="flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-semibold backdrop-blur-sm transition hover:bg-white/25"><i class="ph ph-compass"></i> 명소 보기</a>
          </div>
        </div>
        <div id="weather-card" class="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">${weatherSkeleton()}</div>
      </div>
    </section>

    <section class="mt-4 rounded-2xl border border-stone-200/90 bg-white p-3.5 shadow-sm">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-stone-800">위치 기준 거리 안내</span>
        <span id="here-name" class="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-andong-navy"></span>
      </div>
      <div class="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto py-0.5">
        <button data-action="gps" class="flex shrink-0 items-center gap-1 rounded-lg bg-andong-navy px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition active:scale-95"><i class="ph-bold ph-crosshair"></i> 내 GPS 위치</button>
        ${Object.entries(PRESETS).map(([k, p]) => `<button data-action="preset" data-key="${k}" class="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-700 transition hover:bg-stone-200">${esc(p.name)}</button>`).join('')}
      </div>
    </section>

    <div class="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        ${sectionHead('버스 도착 정보', '안동시 버스정보시스템')}
        <div class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm" id="bus-card">
          <form data-form="bus-search" class="flex gap-2">
            <input name="q" placeholder="정류장 이름 (예: 안동역)" value="" class="h-10 min-w-0 flex-1 rounded-lg border border-stone-200 px-3 text-sm outline-none focus:border-andong-navy" />
            <button class="rounded-lg bg-andong-navy px-3 text-xs font-bold text-white">검색</button>
            <button type="button" data-action="bus-nearby" class="rounded-lg bg-stone-100 px-3 text-xs font-bold text-andong-navy" title="내 주변 정류장"><i class="ph-bold ph-crosshair"></i></button>
          </form>
          <div id="bus-results" class="mt-2"></div>
          <div id="bus-arrivals" class="mt-3">${stop ? loadingBlock(2) : `<p class="text-xs text-stone-500">정류장을 검색해 선택하면 도착 예정 버스가 표시됩니다.</p>`}</div>
        </div>
      </section>
      <section>
        ${sectionHead('최신 안동 소식', 'Google News', '#/news')}
        <div id="home-news" class="space-y-2">${loadingBlock(4)}</div>
      </section>
    </div>

    <section class="mt-6">
      ${sectionHead('진행·예정 행사', '한국관광공사 TourAPI', '#/news')}
      <div id="home-events" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${loadingBlock(3)}</div>
    </section>

    <section class="mt-8">
      ${sectionHead('테마 탐방')}
      <div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        ${[
          ['heritage', 'ph-mask-happy', 'bg-orange-50 text-orange-600', '안동의 역사', '차전놀이·놋다리'],
          ['places', 'ph-mountains', 'bg-blue-50 text-andong-navy', '유네스코 명소', '하회·도산·병산'],
          ['food', 'ph-fork-knife', 'bg-red-50 text-andong-vermilion', '향토 음식', '찜닭·간고등어'],
          ['saved', 'ph-seal-check', 'bg-emerald-50 text-emerald-600', '스탬프 투어', `${store.stampCount()} / ${PLACES.filter((p) => p.kind === 'attraction').length} 완료`],
        ].map(([to, ic, c, t, s]) => `<a href="#/${to}" class="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-sm transition hover:border-andong-navy">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${c}"><i class="ph ${ic}"></i></div>
          <div class="min-w-0"><h4 class="text-sm font-bold text-stone-800">${t}</h4><p class="truncate text-[11px] text-stone-500">${s}</p></div></a>`).join('')}
      </div>
    </section>`;
  },

  news() {
    return `
    <h1 class="font-serif text-2xl font-bold text-andong-dark md:text-3xl">안동 소식</h1>
    <p class="mt-1 text-xs text-stone-500">최신 뉴스와 진행 중·예정된 행사를 모았습니다.</p>

    <section class="mt-6">
      ${sectionHead('행사·축제', '한국관광공사 TourAPI')}
      <div id="events-list-chips"></div>
      <div id="events-list" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${loadingBlock(3)}</div>
    </section>

    <section class="mt-8">
      <div class="mb-3 flex items-end justify-between">
        <h2 class="font-serif text-xl font-bold text-andong-dark">뉴스</h2>
        <div class="flex gap-1.5" id="news-topics">
          ${['안동시', '안동 축제', '안동 관광', '안동 맛집'].map((q, i) => `<button data-action="news-topic" data-q="${q}" class="rounded-full border px-3 py-1 text-xs font-medium transition ${i === 0 ? 'border-andong-dark bg-andong-dark text-white' : 'border-stone-200 bg-white text-stone-600'}">${q.replace('안동 ', '').replace('안동시', '전체')}</button>`).join('')}
        </div>
      </div>
      <div id="news-list">${loadingBlock(5)}</div>
    </section>`;
  },

  places() {
    return `
    <h1 class="font-serif text-2xl font-bold text-andong-dark md:text-3xl">유네스코 명소 & 문화유산</h1>
    <p class="mt-1 text-xs text-stone-500">현장에서 '스탬프'를 누르면 위치(300m 이내)를 확인해 방문 기록을 남깁니다.</p>
    <div class="mt-5 grid gap-3 md:grid-cols-2">${PLACES.filter((p) => p.kind === 'attraction').map(placeCard).join('')}</div>
    <section class="mt-10">
      ${sectionHead('더 많은 관광지', '한국관광공사 TourAPI')}
      <div id="spots-list-chips"></div>
      <div id="spots-list" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${loadingBlock(3)}</div>
      <div id="spots-list-more"></div>
    </section>
    <section class="mt-10">
      ${sectionHead('안동 이야기')}
      <div class="grid gap-3 md:grid-cols-2">${CHRONICLE.map((c) => `<div class="rounded-2xl border border-stone-200/80 border-l-4 border-l-andong-navy bg-white p-4 shadow-sm"><h4 class="text-sm font-bold text-stone-900">${c.icon} ${esc(c.title)}</h4><p class="mt-1 text-xs leading-relaxed text-stone-600">${esc(c.body)}</p></div>`).join('')}</div>
    </section>`;
  },

  food() {
    return `
    <h1 class="font-serif text-2xl font-bold text-andong-dark md:text-3xl">안동 향토 음식</h1>
    <p class="mt-1 text-xs text-stone-500">찜닭·간고등어·헛제사밥, 그리고 안동의 맛집.</p>
    <div class="mt-5 grid gap-3 md:grid-cols-2">${PLACES.filter((p) => p.kind === 'food').map(placeCard).join('')}</div>
    <section class="mt-10">
      ${sectionHead('주변 음식점', '한국관광공사 TourAPI')}
      <div id="foods-list-chips"></div>
      <div id="foods-list" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${loadingBlock(3)}</div>
      <div id="foods-list-more"></div>
    </section>`;
  },

  heritage() {
    return `
    <h1 class="font-serif text-2xl font-bold text-andong-dark md:text-3xl">천년의 정신문화, 대동놀이와 탈춤</h1>
    <p class="mt-1 text-xs text-stone-500">선비의 기개와 민초의 공동체 정신이 살아 있는 무형유산.</p>
    <div class="mt-5 grid gap-3 md:grid-cols-3">
      ${HERITAGE.map((h) => `<article id="card-${h.id}" class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between"><span class="rounded px-2 py-0.5 text-[10px] font-bold ${TAG[h.badgeColor]}">${esc(h.badge)}</span><span class="text-xs text-stone-400">${esc(h.kicker)}</span></div>
        <h3 class="font-serif text-lg font-bold text-stone-900">${esc(h.title)}</h3>
        <p class="mt-1.5 text-xs leading-relaxed text-stone-600">${esc(h.body)}</p></article>`).join('')}
    </div>`;
  },

  saved() {
    const marks = store.bookmarks();
    const attractions = PLACES.filter((p) => p.kind === 'attraction');
    return `
    <h1 class="font-serif text-2xl font-bold text-andong-dark md:text-3xl">보관함</h1>
    <section class="mt-5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <div><h2 class="text-sm font-bold text-stone-800">나의 스탬프 투어</h2><p class="text-[11px] text-stone-500">${store.stampCount()} / ${attractions.length} 완료 · 현장에서 GPS로 확인됩니다</p></div>
        ${store.stampCount() ? `<button data-action="clear-stamps" class="text-[11px] text-stone-400 underline">초기화</button>` : ''}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        ${attractions.map((p) => `<a href="#/places" class="flex flex-col items-center rounded-xl p-3 text-center text-xs font-bold ${store.hasStamp(p.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-50 text-stone-400'}">
          <i class="ph${store.hasStamp(p.id) ? '-fill' : ''} ph-seal-check text-2xl"></i><span class="mt-1">${esc(p.name.split(' ')[0])}</span></a>`).join('')}
      </div>
    </section>
    <section class="mt-8">
      ${sectionHead('저장한 장소', `${marks.length}곳`)}
      ${marks.length
        ? `<div class="grid gap-3 md:grid-cols-2">${marks.map((m) => `<article class="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
            <div class="min-w-0"><h3 class="truncate text-sm font-bold text-stone-900">${esc(m.title)}</h3><p class="truncate text-[11px] text-stone-500">${esc(m.addr)}</p>
            <span data-dist data-lat="${m.lat ?? ''}" data-lng="${m.lng ?? ''}" class="text-[11px] font-bold text-amber-600">${distText(m.lat, m.lng)}</span></div>
            <div class="flex shrink-0 items-center gap-1">${navBtn(m.title, m.lat, m.lng)}${bookmarkBtn(m)}</div></article>`).join('')}</div>`
        : `<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">카드의 <i class="ph ph-bookmark-simple"></i> 버튼을 눌러 가고 싶은 곳을 저장해 보세요.</p>`}
    </section>`;
  },
};

// ───────────────────────── 비동기 로더 ─────────────────────────
function weatherSkeleton() {
  return `<div class="skeleton h-24 rounded-xl opacity-30"></div>`;
}

async function loadWeather() {
  const box = $('#weather-card');
  if (!box) return;
  try {
    const { weather, air } = await cached('weather', api.fetchWeather, 10 * 60000);
    if (!$('#weather-card')) return;
    const c = weather.current;
    const d = weather.daily;
    const [desc, icon, color] = api.describeWeather(c.weather_code, c.is_day);
    const pm25 = air?.current?.pm2_5;
    const pm10 = air?.current?.pm10;
    const dust = api.gradeDust(pm25, pm10);
    box.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="ph-fill ${icon} ${color} text-5xl"></i>
          <div><div class="text-3xl font-black leading-none">${Math.round(c.temperature_2m)}°C</div>
          <div class="mt-1 text-xs text-stone-300">${desc} · 체감 ${Math.round(c.apparent_temperature)}°</div></div>
        </div>
        <div class="text-right text-[11px] text-stone-300">안동시<br/>${hhmm(c.time)} 기준</div>
      </div>
      <div class="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
        <div class="rounded-lg bg-white/10 p-2"><div class="text-stone-400">최고/최저</div><b>${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°</b></div>
        <div class="rounded-lg bg-white/10 p-2"><div class="text-stone-400">강수확률</div><b>${d.precipitation_probability_max[0] ?? '-'}%</b></div>
        <div class="rounded-lg bg-white/10 p-2"><div class="text-stone-400">미세먼지</div><b class="${dust ? dust[1] : ''}">${dust ? dust[0] : '-'}</b></div>
        <div class="rounded-lg bg-white/10 p-2"><div class="text-stone-400">일몰</div><b>${hhmm(d.sunset[0])}</b></div>
      </div>
      ${pm25 != null ? `<p class="mt-2 text-[10px] text-stone-400">초미세먼지 ${Math.round(pm25)}㎍/㎥ · 미세먼지 ${Math.round(pm10)}㎍/㎥ (모델 예측값)</p>` : ''}`;
  } catch (e) {
    if ($('#weather-card')) $('#weather-card').innerHTML = `<p class="text-xs text-stone-300">날씨 정보를 불러오지 못했습니다. <button data-action="refresh" class="font-bold underline">다시 시도</button></p>`;
  }
}

async function loadNews(target, { q = '', limit = 20 } = {}) {
  const box = $(target);
  if (!box) return;
  try {
    const { items } = await cached(`news:${q}`, () => api.fetchNews(q), 10 * 60000);
    if (q === '' || q === '안동시') live.news = items;
    if ($(target)) $(target).innerHTML = newsList(items, limit);
  } catch (e) {
    if ($(target)) $(target).innerHTML = errorBlock(e, '뉴스');
  }
}

const PAGE = 12;
const TOUR_META = {
  festival: { bucket: 'events', kind: 'event', what: '행사 정보', empty: '현재 진행 중이거나 예정된 행사 정보가 없습니다.' },
  spot: { bucket: 'spots', kind: 'attraction', what: '관광지 정보', empty: '표시할 관광지가 없습니다.' },
  food: { bucket: 'foods', kind: 'food', what: '음식점 정보', empty: '표시할 음식점이 없습니다.' },
};
const tourUi = { festival: { cat: '', shown: PAGE }, spot: { cat: '', shown: PAGE }, food: { cat: '', shown: PAGE } };
const tourTargets = {}; // type -> { target, limit, chips }

const matchCat = (it, code) => !code || (it.cat2 || '').startsWith(code) || (it.cat1 || '') === code;

function renderTour(type) {
  const t = tourTargets[type];
  const grid = t && $(t.target);
  if (!grid) return;
  const meta = TOUR_META[type];
  const all = live[meta.bucket];
  const ui = tourUi[type];

  const chipsEl = t.chips && $(`${t.target}-chips`);
  if (chipsEl) {
    const defs = CHIPS[type]
      .map((c) => ({ ...c, n: all.filter((i) => matchCat(i, c.code)).length }))
      .filter((c) => c.n > 0);
    const chip = (code, label, n, on) =>
      `<button data-action="tour-cat" data-type="${type}" data-cat="${code}" class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'border-andong-dark bg-andong-dark text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'}">${label} <span class="${on ? 'text-white/70' : 'text-stone-400'}">${n}</span></button>`;
    chipsEl.className = 'no-scrollbar mb-3 flex gap-1.5 overflow-x-auto';
    chipsEl.innerHTML = defs.length > 1 ? chip('', '전체', all.length, !ui.cat) + defs.map((c) => chip(c.code, c.label, c.n, ui.cat === c.code)).join('') : '';
  }

  const cat = t.chips ? ui.cat : ''; // 홈 미리보기는 필터 상태와 무관하게 전체를 보여준다
  const list = all.filter((i) => matchCat(i, cat));
  const limit = t.chips ? ui.shown : t.limit;
  grid.innerHTML = list.length
    ? list.slice(0, limit).map((i) => tourCard(i, meta.kind)).join('')
    : `<p class="col-span-full rounded-2xl bg-white p-4 text-xs text-stone-500">${meta.empty}</p>`;

  const moreEl = t.chips && $(`${t.target}-more`);
  if (moreEl) {
    moreEl.innerHTML = list.length > limit
      ? `<button data-action="tour-more" data-type="${type}" class="mt-4 w-full rounded-xl border border-stone-200 bg-white py-2.5 text-xs font-bold text-andong-navy transition hover:bg-stone-50">더 보기 (${list.length - limit}곳 남음)</button>`
      : '';
  }
  updateDistances();
}

async function loadTour(type, target, { limit = PAGE, chips = false } = {}) {
  if (!$(target)) return;
  const meta = TOUR_META[type];
  tourTargets[type] = { target, limit, chips };
  try {
    const { items } = await cached(`tour:${type}`, () => api.fetchTour(type), 30 * 60000);
    live[meta.bucket] = items;
    renderTour(type);
  } catch (e) {
    if ($(target)) {
      $(target).classList.remove('grid');
      $(target).innerHTML = errorBlock(e, meta.what);
    }
  }
}

// 버스
function arrivalsHtml(stop, items) {
  const head = `<div class="mb-2 flex items-center justify-between"><b class="text-sm text-stone-900">${esc(stop.name)} <span class="text-[11px] font-normal text-stone-400">${esc(stop.no)}</span></b>
    <span class="text-[10px] text-stone-400">${new Date().toTimeString().slice(0, 5)} 갱신</span></div>`;
  if (!items.length) return head + `<p class="text-xs text-stone-500">현재 도착 예정인 버스 정보가 없습니다.</p>`;
  return (
    head +
    `<ul class="divide-y divide-stone-100">${items.slice(0, 6).map((a) => `<li><button data-action="bus-route" data-route-id="${esc(a.routeId)}" data-route="${esc(a.route)}" data-via="${esc(a.via)}" data-stop-id="${esc(stop.nodeId)}" class="flex w-full items-center justify-between gap-2 py-2 text-left transition hover:bg-stone-50">
      <span class="flex min-w-0 items-center gap-2"><span class="shrink-0 rounded-md bg-andong-navy px-2 py-0.5 text-xs font-bold text-white">${esc(a.route)}</span><span class="truncate text-[11px] text-stone-400">${esc(a.via)}</span></span>
      <span class="shrink-0 text-sm font-bold ${a.seconds < 120 ? 'text-andong-vermilion' : 'text-stone-800'}">${a.seconds < 60 ? '곧 도착' : `${Math.round(a.seconds / 60)}분`}
      <span class="ml-1 text-[11px] font-normal text-stone-400">${a.stopsLeft}정거장 전</span><i class="ph ph-map-trifold ml-1.5 text-andong-navy"></i></span></button></li>`).join('')}</ul>
    <p class="mt-2 text-[10px] text-stone-400">노선을 누르면 지도에서 버스 위치를 볼 수 있습니다.</p>`
  );
}

async function loadArrivals() {
  const stop = store.busStop();
  const box = $('#bus-arrivals');
  if (!stop || !box) return;
  try {
    const { items } = await api.fetchArrivals(stop.nodeId);
    if ($('#bus-arrivals')) $('#bus-arrivals').innerHTML = arrivalsHtml(stop, items);
  } catch (e) {
    if ($('#bus-arrivals')) $('#bus-arrivals').innerHTML = errorBlock(e, '버스 도착 정보');
  }
}

function stopListHtml(items) {
  if (!items.length) return `<p class="text-xs text-stone-500">검색 결과가 없습니다.</p>`;
  return `<ul class="max-h-44 overflow-y-auto rounded-lg border border-stone-200">${items.slice(0, 15).map((s) => `<li>
    <button data-action="bus-pick" data-stop="${esc(JSON.stringify(s))}" class="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-stone-50">
    <span class="font-semibold text-stone-800">${esc(s.name)}</span><span class="text-stone-400">${esc(s.no)}</span></button></li>`).join('')}</ul>`;
}

// ───────────────────────── 시트 (길찾기 / 오디오 / 검색) ─────────────────────────
function openSheet(html, wide = false) {
  $('#sheet-body').innerHTML = html;
  $('#sheet-body').classList.toggle('sm:max-w-3xl', wide);
  $('#sheet-body').classList.toggle('sm:max-w-md', !wide);
  const s = $('#sheet');
  s.classList.remove('hidden');
  s.classList.add('flex');
}
function closeSheet() {
  stopRouteMap();
  const s = $('#sheet');
  s.classList.add('hidden');
  s.classList.remove('flex');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function openNav({ name, lat, lng }) {
  const n = encodeURIComponent(name);
  const km = haversine(here.lat, here.lng, lat, lng);
  const link = (href, bg, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between rounded-2xl p-3 text-sm font-bold shadow-sm transition active:scale-[.98] ${bg}"><span>${label}</span><i class="ph ph-arrow-square-out"></i></a>`;
  openSheet(`
    <div class="mb-3 flex items-start justify-between"><div>
      <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-andong-navy">길찾기</span>
      <h3 class="mt-1 text-base font-bold text-stone-900">${esc(name)}</h3>
      <p class="text-xs text-stone-500">${esc(here.gps ? '내 위치' : here.label)}에서 직선 약 ${km.toFixed(1)}km</p></div>
      <button data-action="close" class="p-1 text-stone-400" aria-label="닫기"><i class="ph ph-x text-xl"></i></button></div>
    <div class="space-y-2">
      ${link(`https://map.kakao.com/link/to/${n},${lat},${lng}`, 'bg-[#FEE500] text-[#191919]', '카카오맵으로 길찾기')}
      ${link(`https://map.naver.com/v5/directions/-/${lng},${lat},${n}/-/car`, 'bg-[#03C75A] text-white', '네이버 지도로 길찾기')}
      ${link(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, 'bg-slate-800 text-white', 'Google 지도로 길찾기')}
      ${link(`tmap://route?goalname=${n}&goalx=${lng}&goaly=${lat}`, 'bg-red-500 text-white', 'T map 앱 열기 (모바일)')}
    </div>`);
}

let speaking = null;
function openAudio(id) {
  const p = PLACES.find((x) => x.id === id);
  if (!p) return;
  const supported = 'speechSynthesis' in window;
  openSheet(`
    <div class="mb-3 flex items-center justify-between"><span class="flex items-center gap-2 text-xs font-bold text-andong-navy"><i class="ph ph-headphones text-base"></i> 오디오 해설</span>
      <button data-action="close" class="p-1 text-stone-400" aria-label="닫기"><i class="ph ph-x text-xl"></i></button></div>
    <h3 class="font-serif text-lg font-bold text-stone-900">${esc(p.name)}</h3>
    <p class="mt-2 text-sm leading-relaxed text-stone-600">${esc(p.audio)}</p>
    ${supported
      ? `<button data-action="speak" data-id="${id}" id="speak-btn" class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-andong-navy py-3 text-sm font-bold text-white"><i class="ph-fill ph-play"></i> 재생</button>`
      : `<p class="mt-4 text-xs text-stone-400">이 브라우저는 음성 재생을 지원하지 않습니다.</p>`}`);
}

function toggleSpeak(id) {
  const p = PLACES.find((x) => x.id === id);
  const btn = $('#speak-btn');
  if (!p || !btn) return;
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    btn.innerHTML = '<i class="ph-fill ph-play"></i> 재생';
    return;
  }
  speaking = new SpeechSynthesisUtterance(p.audio);
  speaking.lang = 'ko-KR';
  speaking.rate = 0.95;
  speaking.onend = speaking.onerror = () => {
    if ($('#speak-btn')) $('#speak-btn').innerHTML = '<i class="ph-fill ph-play"></i> 재생';
  };
  speechSynthesis.speak(speaking);
  btn.innerHTML = '<i class="ph-fill ph-stop"></i> 정지';
}

// 검색
function openSearch() {
  openSheet(`
    <div class="flex items-center gap-2"><div class="relative flex-1"><i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i>
      <input id="search-input" autocomplete="off" placeholder="명소, 음식, 행사, 뉴스 검색" class="h-11 w-full rounded-xl border border-stone-200 pl-9 pr-3 text-sm outline-none focus:border-andong-navy" /></div>
      <button data-action="close" class="p-1 text-stone-400" aria-label="닫기"><i class="ph ph-x text-xl"></i></button></div>
    <div id="search-results" class="mt-3 space-y-1 text-sm"><p class="p-2 text-xs text-stone-400">검색어를 입력하세요.</p></div>`);
  setTimeout(() => $('#search-input')?.focus(), 50);
}

function runSearch(q) {
  const box = $('#search-results');
  q = q.trim().toLowerCase();
  if (!q) return (box.innerHTML = `<p class="p-2 text-xs text-stone-400">검색어를 입력하세요.</p>`);
  const has = (...f) => f.some((x) => (x || '').toLowerCase().includes(q));
  const rows = [];
  PLACES.filter((p) => has(p.name, p.sub, p.desc, p.tag, p.addr)).forEach((p) =>
    rows.push({ icon: p.kind === 'food' ? 'ph-fork-knife' : 'ph-mountains', title: p.name, sub: p.sub, go: `#/${p.kind === 'food' ? 'food' : 'places'}`, anchor: `card-${p.id}` })
  );
  HERITAGE.filter((h) => has(h.title, h.body, h.badge)).forEach((h) =>
    rows.push({ icon: 'ph-scroll', title: h.title, sub: h.badge, go: '#/heritage', anchor: `card-${h.id}` })
  );
  [...live.events.map((e) => ['ph-confetti', e, '#/news']), ...live.spots.map((e) => ['ph-mountains', e, '#/places']), ...live.foods.map((e) => ['ph-fork-knife', e, '#/food'])]
    .filter(([, e]) => has(e.title, e.addr))
    .forEach(([icon, e, go]) => rows.push({ icon, title: e.title, sub: e.addr, go, anchor: `card-tour-${e.id}` }));
  live.news.filter((n) => has(n.title)).forEach((n) => rows.push({ icon: 'ph-newspaper', title: n.title, sub: n.source, href: n.link }));

  box.innerHTML = rows.length
    ? rows.slice(0, 30).map((r) => {
        const attrs = r.href ? `href="${esc(safeUrl(r.href))}" target="_blank" rel="noopener noreferrer"` : `href="${r.go}" data-anchor="${esc(r.anchor)}" data-action="search-go"`;
        return `<a ${attrs} class="flex items-center gap-3 rounded-xl p-2.5 hover:bg-stone-50"><i class="ph ${r.icon} text-lg text-andong-navy"></i>
          <span class="min-w-0"><span class="block truncate font-semibold text-stone-900">${esc(r.title)}</span><span class="block truncate text-[11px] text-stone-400">${esc(r.sub || '')}</span></span></a>`;
      }).join('')
    : `<p class="p-2 text-xs text-stone-400">'${esc(q)}'에 대한 결과가 없습니다.</p>`;
}


// ───────────────────────── 버스 노선 지도 ─────────────────────────
let routeMap = null; // { map, L, layers, timer, routeId, stopId, fitted }

function stopRouteMap() {
  if (!routeMap) return;
  clearInterval(routeMap.timer);
  routeMap.ro?.disconnect();
  routeMap.map.remove();
  routeMap = null;
}

async function openRouteMap({ routeId, route, via, stopId }) {
  openSheet(`
    <div class="mb-3 flex items-start justify-between"><div class="min-w-0">
      <span class="rounded-md bg-andong-navy px-2 py-0.5 text-xs font-bold text-white">${esc(route)}</span>
      <p class="mt-1 truncate text-xs text-stone-500">${esc(via)}</p></div>
      <button data-action="close" class="p-1 text-stone-400" aria-label="닫기"><i class="ph ph-x text-xl"></i></button></div>
    <div id="route-map" class="h-[55vh] min-h-[320px] w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"></div>
    <div id="route-info" class="mt-3 text-xs text-stone-500">불러오는 중…</div>`, true);

  const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
  if (!$('#route-map')) return; // 로딩 중 시트가 닫힘
  const map = L.map('route-map', { zoomControl: true, attributionControl: true }).setView([36.5684, 128.7294], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  routeMap = { map, L, layers: L.layerGroup().addTo(map), routeId, stopId, fitted: false, timer: null };
  // 컨테이너 크기가 바뀔 때마다 지도 크기를 갱신하고, 아직이면 노선 전체가 보이게 맞춘다.
  routeMap.ro = new ResizeObserver(() => {
    if (routeMap?.map !== map) return;
    map.invalidateSize({ animate: false });
    fitRoute();
  });
  routeMap.ro.observe($('#route-map'));
  await refreshRouteMap();
  if (routeMap) routeMap.timer = setInterval(refreshRouteMap, 10000);
}

function fitRoute() {
  const rm = routeMap;
  if (!rm || rm.fitted || !rm.pts?.length) return;
  const el = $('#route-map');
  if (!el || el.clientHeight < 100 || el.clientWidth < 100) return; // 아직 크기가 확정되지 않음
  rm.map.invalidateSize({ animate: false });
  rm.map.fitBounds(rm.pts, { padding: [24, 24], maxZoom: 16, animate: false });
  rm.fitted = true;
}

async function refreshRouteMap() {
  const rm = routeMap;
  if (!rm) return;
  const { L, map, layers } = rm;
  try {
    const { stops, vehicles } = await api.fetchRoute(rm.routeId);
    if (routeMap !== rm) return;
    layers.clearLayers();
    const pts = stops.map((s) => [s.lat, s.lng]);
    L.polyline(pts, { color: '#1a446c', weight: 4, opacity: 0.55 }).addTo(layers);
    stops.forEach((s) => {
      const mine = s.id === rm.stopId;
      L.circleMarker([s.lat, s.lng], {
        radius: mine ? 8 : 4, color: mine ? '#d94b38' : '#1a446c', weight: 2, fillColor: mine ? '#d94b38' : '#fff', fillOpacity: 1,
      }).bindTooltip(`${s.ord}. ${s.name}${mine ? ' (내 정류장)' : ''}`).addTo(layers);
    });
    const icon = L.divIcon({
      className: '',
      html: '<div style="background:#d94b38;color:#fff;border:2px solid #fff;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px #0004;font-size:16px">🚌</div>',
      iconSize: [30, 30], iconAnchor: [15, 15],
    });
    vehicles.forEach((v) => {
      const near = stops.find((s) => s.ord === v.ord);
      L.marker([v.lat, v.lng], { icon, zIndexOffset: 1000 })
        .bindTooltip(`${v.plate}${near ? ` · ${near.name} 부근` : ''}${v.speed != null ? ` · ${v.speed}km/h` : ''}`)
        .addTo(layers);
    });
    rm.pts = pts;
    fitRoute();
    const info = $('#route-info');
    if (info) {
      info.innerHTML = vehicles.length
        ? `<div class="mb-1 flex items-center justify-between"><b class="text-stone-800">운행 중 ${vehicles.length}대</b><span class="text-[10px] text-stone-400">${new Date().toTimeString().slice(0, 8)} 갱신 · 10초마다 자동</span></div>
           <ul class="space-y-1">${vehicles.map((v) => { const near = stops.find((s) => s.ord === v.ord); return `<li class="flex justify-between rounded-lg bg-stone-50 px-3 py-1.5"><span>🚌 ${esc(v.plate)}</span><span class="text-stone-600">${near ? esc(near.name) + ' 부근' : ''}${v.speed != null ? ` · ${v.speed}km/h` : ''}</span></li>`; }).join('')}</ul>`
        : '현재 운행 중인 차량이 없습니다. (운행 시간 외이거나 차량 위치 정보가 없습니다.)';
    }
  } catch (e) {
    const info = $('#route-info');
    if (info) info.innerHTML = errorBlock(e, '버스 위치');
  }
}

// ───────────────────────── 스탬프 / 보관 ─────────────────────────
async function stamp(id) {
  const p = PLACES.find((x) => x.id === id);
  if (!p) return;
  if (store.hasStamp(id)) return toast('이미 스탬프를 찍은 곳입니다.');
  toast('현재 위치를 확인하는 중입니다…');
  try {
    const pos = await getPosition();
    const km = haversine(pos.coords.latitude, pos.coords.longitude, p.lat, p.lng);
    const allow = 0.3 + Math.min(pos.coords.accuracy, 200) / 1000; // 300m + GPS 오차(최대 200m)
    if (km <= allow) {
      store.addStamp(id);
      toast(`${p.name} 스탬프를 찍었습니다!`);
      render();
    } else {
      toast(`${p.name}에서 약 ${km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km'} 떨어져 있습니다. 가까이에서 다시 눌러 주세요.`, 'warn');
    }
  } catch (e) {
    toast(e.code === 1 ? '위치 권한이 필요합니다.' : '위치를 확인하지 못했습니다.', 'warn');
  }
}

function updateBadge() {
  const n = store.bookmarks().length;
  const b = $('#saved-badge');
  b.textContent = n;
  b.classList.toggle('hidden', !n);
}

// ───────────────────────── 라우터 / 렌더 ─────────────────────────
function currentRoute() {
  const r = location.hash.replace(/^#\//, '') || 'home';
  return views[r] ? r : 'home';
}

function renderNav() {
  const r = currentRoute();
  $('#top-nav').innerHTML = NAV.map((n) => `<a href="#/${n.id}" class="rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${r === n.id ? 'bg-andong-navy text-white' : 'text-stone-600 hover:bg-stone-200/60'}">${n.label}</a>`).join('');
  $('#bottom-nav').innerHTML = NAV.map((n) => `<a href="#/${n.id}" class="flex flex-1 flex-col items-center py-1 ${r === n.id ? 'text-andong-navy' : 'text-stone-400'}"><i class="ph${r === n.id ? '-fill' : ''} ${n.icon} text-2xl"></i><span class="mt-0.5 text-[10px] font-bold">${n.label}</span></a>`).join('');
}

function render({ keepScroll = false } = {}) {
  const r = currentRoute();
  const y = window.scrollY;
  const app = $('#app');
  app.innerHTML = `<div class="view-enter">${views[r]()}</div>`;
  renderNav();
  updateBadge();
  updateDistances();
  keepScroll ? window.scrollTo(0, y) : window.scrollTo(0, 0);

  if (r === 'home') {
    loadWeather();
    loadNews('#home-news', { limit: 5 });
    loadTour('festival', '#home-events', { limit: 3 });
    loadArrivals();
  } else if (r === 'news') {
    loadTour('festival', '#events-list', { chips: true, limit: 30 });
    loadNews('#news-list', { q: '안동시' });
  } else if (r === 'places') {
    loadTour('spot', '#spots-list', { chips: true });
  } else if (r === 'food') {
    loadTour('food', '#foods-list', { chips: true });
  }
  lastSync = new Date();
}

// ───────────────────────── 이벤트 ─────────────────────────
const actions = {
  gps: () => useGps(),
  preset: (el) => setPreset(el.dataset.key),
  nav: (el) => openNav({ name: el.dataset.name, lat: +el.dataset.lat, lng: +el.dataset.lng }),
  audio: (el) => openAudio(el.dataset.id),
  speak: (el) => toggleSpeak(el.dataset.id),
  stamp: (el) => stamp(el.dataset.id),
  search: () => openSearch(),
  close: () => closeSheet(),
  'clear-stamps': () => {
    if (confirm('스탬프 기록을 모두 지울까요?')) {
      store.clearStamps();
      render({ keepScroll: true });
    }
  },
  bookmark(el) {
    const item = JSON.parse(el.dataset.item);
    const on = store.toggleBookmark(item);
    toast(on ? '보관함에 저장했습니다.' : '보관함에서 삭제했습니다.');
    if (currentRoute() === 'saved') render({ keepScroll: true });
    else {
      el.className = el.className.replace(/text-(andong-vermilion|stone-400)/, on ? 'text-andong-vermilion' : 'text-stone-400');
      el.querySelector('i').className = `ph${on ? '-fill' : ''} ph-bookmark-simple text-lg`;
      updateBadge();
    }
  },
  async refresh() {
    const icon = $('#refresh-icon');
    icon.classList.add('animate-spin');
    cache.clear();
    render({ keepScroll: true });
    setTimeout(() => icon.classList.remove('animate-spin'), 800);
    toast('최신 정보로 새로고침했습니다.');
  },
  'news-topic'(el) {
    document.querySelectorAll('#news-topics button').forEach((b) => {
      const on = b === el;
      b.className = `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'border-andong-dark bg-andong-dark text-white' : 'border-stone-200 bg-white text-stone-600'}`;
    });
    $('#news-list').innerHTML = loadingBlock(5);
    loadNews('#news-list', { q: el.dataset.q });
  },
  'tour-cat'(el) {
    const ui = tourUi[el.dataset.type];
    ui.cat = el.dataset.cat;
    ui.shown = PAGE;
    renderTour(el.dataset.type);
  },
  'tour-more'(el) {
    tourUi[el.dataset.type].shown += PAGE;
    renderTour(el.dataset.type);
  },
  'bus-route': (el) =>
    openRouteMap({ routeId: el.dataset.routeId, route: el.dataset.route, via: el.dataset.via, stopId: el.dataset.stopId }),
  'bus-pick'(el) {
    store.setBusStop(JSON.parse(el.dataset.stop));
    $('#bus-results').innerHTML = '';
    $('#bus-arrivals').innerHTML = loadingBlock(2);
    loadArrivals();
  },
  async 'bus-nearby'() {
    if (!(await useGps())) return;
    $('#bus-results').innerHTML = loadingBlock(1);
    try {
      const { items } = await api.nearbyBusStops(here.lat, here.lng);
      $('#bus-results').innerHTML = stopListHtml(items);
    } catch (e) {
      $('#bus-results').innerHTML = errorBlock(e, '주변 정류장');
    }
  },
  'search-go'(el, ev) {
    const anchor = el.dataset.anchor;
    closeSheet();
    const go = () => {
      const t = document.getElementById(anchor);
      if (t) {
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        t.classList.add('card-highlight');
      }
    };
    if (location.hash === el.getAttribute('href')) go();
    else {
      ev.preventDefault();
      location.hash = el.getAttribute('href');
      setTimeout(go, 400);
    }
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    if (el.tagName !== 'A') ev.preventDefault();
    return actions[el.dataset.action](el, ev);
  }
  if (ev.target.id === 'sheet') closeSheet();
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.dataset.form !== 'bus-search') return;
  ev.preventDefault();
  const q = new FormData(ev.target).get('q').toString().trim();
  if (!q) return;
  const box = $('#bus-results');
  box.innerHTML = loadingBlock(1);
  try {
    const { items } = await api.searchBusStops(q);
    box.innerHTML = stopListHtml(items);
  } catch (e) {
    box.innerHTML = errorBlock(e, '정류장 검색');
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'search-input') runSearch(ev.target.value);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeSheet();
});

window.addEventListener('hashchange', () => render());

// 자동 갱신: 버스 30초, 날씨 10분 (홈 화면에서만, 탭이 보일 때만)
setInterval(() => {
  if (document.hidden || currentRoute() !== 'home') return;
  loadArrivals();
}, 30000);
setInterval(() => {
  if (document.hidden || currentRoute() !== 'home') return;
  cache.delete('weather');
  loadWeather();
}, 10 * 60000);

render();
