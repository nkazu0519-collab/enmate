// 場所の周辺を種類で探す（NAVITIME スポットカテゴリ検索）の中継。
// RapidAPI 版でも /spot/category_code が使えることを 2026-10-01 に確かめた。

const HOST = 'navitime-spot.p.rapidapi.com'
const COORD = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/

// 種類のコード（2026-10-01 に /category_list で確認）。運転するので、グルメからお酒（0308）と宅配（0309）は外す
const CATEGORIES = {
  meal: '0301.0302.0303.0304.0305.0306.0307.0310.0311.0313',
  sightseeing: '0702.0703.0705.0706.0710.0111',
} as const
const RADIUS = { meal: '3000', sightseeing: '10000' } as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const kind = String(query.kind ?? '') as keyof typeof CATEGORIES
  const coord = String(query.coord ?? '')
  if (!(kind in CATEGORIES) || !COORD.test(coord)) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/spot/category_code', {
    category: CATEGORIES[kind],
    coord,
    radius: RADIUS[kind],
    limit: '20',
  })
  return { items: Array.isArray(body.items) ? body.items : [], remaining, limit }
})
