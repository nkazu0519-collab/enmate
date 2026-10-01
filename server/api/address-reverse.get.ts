// 座標の住所（都道府県・市区町村）を調べる（NAVITIME 逆ジオコーディング）の中継。
// RapidAPI 版の /address/reverse_geocoding で、details に都道府県（level 1）・市区町村（level 2。政令指定都市は区）が入ることを 2026-10-01 に確かめた

const HOST = 'navitime-geocoding.p.rapidapi.com'

export default defineEventHandler(async (event) => {
  const coord = String(getQuery(event).coord ?? '')
  if (!isCoord(coord)) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/address/reverse_geocoding', { coord })
  return { items: Array.isArray(body.items) ? body.items : [], remaining, limit }
})
