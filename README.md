# 안동 On (安東 On)

안동 여행 정보 반응형 웹앱. Vite + 바닐라 JS + Tailwind, 외부 API는 Vercel 서버리스 함수(`/api`)가 프록시합니다.

## 실제로 연결된 기능

| 기능 | 출처 | API 키 |
|---|---|---|
| 날씨·일몰·미세먼지 | Open-Meteo (브라우저에서 직접 호출) | 불필요 |
| 안동 최신 뉴스 | Google News RSS (`/api/news`) | 불필요 |
| 행사·축제, 관광지, 음식점 (신분류체계 기반 카테고리 필터·배지, `src/categories.js`) | 한국관광공사 TourAPI KorService2 (`/api/tour`) | `TOUR_API_KEY` |
| 버스 정류장 검색·주변 정류장·도착 예정 | 안동시 버스정보시스템 bus.andong.go.kr (`/api/bus`) | 불필요 |
| 노선 지도(정류장 + 운행 중 버스 실시간 위치, 10초 갱신) | 안동시 버스정보시스템 + OpenStreetMap/Leaflet | 불필요 |
| 검색, 보관함, 스탬프 투어 | 브라우저 localStorage | - |
| 스탬프 | GPS로 명소 300m 이내인지 확인 | - |
| 오디오 해설 | 브라우저 음성합성(Web Speech API) | - |

키가 없는 항목은 가짜 값을 보여주지 않고 "API 키 설정 필요" 안내가 표시됩니다.

## 로컬 실행

```bash
npm install
cp .env.example .env   # 키 입력 (선택)
npm run dev
```

사내 프록시 환경을 위해 `dev` 스크립트가 `NODE_USE_ENV_PROXY`/`--use-system-ca`를 켭니다.

## API 키 발급 (공공데이터포털 data.go.kr, 무료)

1. **한국관광공사_국문 관광정보 서비스** 활용신청 → `TOUR_API_KEY`

버스 정보는 안동시 공개 API를 쓰므로 키가 필요 없습니다.

## 배포 (다른 사람에게 URL 공유)

GitHub Pages는 정적 호스팅이라 `/api`가 동작하지 않습니다. **Vercel**에 배포하세요.

1. 이 폴더를 GitHub 저장소로 푸시
2. [vercel.com](https://vercel.com) → Add New Project → 저장소 선택 (Framework: Vite, 설정 변경 불필요)
3. Settings → Environment Variables 에 `TOUR_API_KEY` 추가 후 재배포

`design/` 폴더에는 Stitch 원본 시안(`stitch-original.html`)과 디자인 시스템 문서가 보관되어 있습니다.
