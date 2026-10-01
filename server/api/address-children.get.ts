// 都道府県の中の市区町村の一覧と、その中心の座標（NAVITIME 住所検索）の中継。
// code だけを渡すと、その下の住所が返る（政令指定都市は区ごと）。level_from・level_to は code と一緒に使えない（2026-10-01 確認）

const HOST = 'navitime-geocoding.p.rapidapi.com'
const PREFECTURE_CODE = /^\d{2}$/
const PAGE = 100

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code ?? '')
  const offset = Number(query.offset ?? 0)
  if (!PREFECTURE_CODE.test(code) || !Number.isInteger(offset) || offset < 0 || offset > 500) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/address', { code, limit: String(PAGE), offset: String(offset) })
  const total = Number((body.count as { total?: number } | undefined)?.total ?? 0)
  return { items: Array.isArray(body.items) ? body.items : [], total, remaining, limit }
})
