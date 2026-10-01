// 場所の周辺を種類で探す（NAVITIME スポットカテゴリ検索）の中継。
// RapidAPI 版でも /spot/category_code が使えることを 2026-10-01 に確かめた。

const HOST = 'navitime-spot.p.rapidapi.com'

// 種類のコード（2026-10-01 に /category_list で確認）。運転するので、グルメからお酒（0308）と宅配（0309）は外す
// 宿泊先は、ホテル（0608）・旅館/民宿（0603）・温泉旅館を含む温泉（0604）・ペンション（0605）・その他の宿泊施設（0607）。
// 日帰りの温泉などは、ブラウザ側で除く（app/services/place.ts）
const CATEGORIES = {
  meal: '0301.0302.0303.0304.0305.0306.0307.0310.0311.0313',
  sightseeing: '0702.0703.0705.0706.0710.0111',
  hotel: '0603.0604.0605.0607.0608',
} as const
// 宿泊先は会場から5km以内（仕様書 §4.4）。除く分があるので多めに受け取る
const RADIUS = { meal: '3000', sightseeing: '10000', hotel: '5000' } as const
const LIMIT = { meal: '20', sightseeing: '20', hotel: '50' } as const
// ルート沿い・市区町村の中は、種類によらず半径10km（仕様書 §4.4・§4.5）。そのときは radius=10000 を渡す
const RADIUS_OVERRIDES = ['10000']

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const kind = String(query.kind ?? '') as keyof typeof CATEGORIES
  const coord = String(query.coord ?? '')
  const radius = query.radius === undefined ? RADIUS[kind] : String(query.radius)
  if (!(kind in CATEGORIES) || !isCoord(coord) || (query.radius !== undefined && !RADIUS_OVERRIDES.includes(radius))) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/spot/category_code', {
    category: CATEGORIES[kind],
    coord,
    radius,
    limit: LIMIT[kind],
  })
  return { items: Array.isArray(body.items) ? body.items : [], remaining, limit }
})
