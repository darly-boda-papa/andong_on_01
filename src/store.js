// localStorage 기반 보관함 / 스탬프 / 설정
const KEY = 'andongon:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const state = { bookmarks: {}, stamps: {}, busStop: null, ...read() };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 세션 내 동작만 유지 */
  }
}

export const store = {
  isBookmarked: (id) => id in state.bookmarks,
  // item: { id, title, addr, lat, lng, kind } 스냅샷을 함께 저장해 오프라인/외부 데이터도 보관함에 표시한다.
  toggleBookmark(item) {
    const had = item.id in state.bookmarks;
    if (had) delete state.bookmarks[item.id];
    else state.bookmarks[item.id] = { ...item, savedAt: Date.now() };
    save();
    return !had;
  },
  bookmarks: () => Object.values(state.bookmarks).sort((a, b) => b.savedAt - a.savedAt),
  hasStamp: (id) => id in state.stamps,
  stampCount: () => Object.keys(state.stamps).length,
  addStamp(id) {
    state.stamps[id] = new Date().toISOString();
    save();
  },
  clearStamps() {
    state.stamps = {};
    save();
  },
  busStop: () => state.busStop,
  setBusStop(s) {
    state.busStop = s;
    save();
  },
};
