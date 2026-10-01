// 場所を名前で探す（NAVITIME スポット検索）の中継。
// 件数はふだん10件。都道府県全体の人気の場所を探すときは100件受け取り、ブラウザ側で住所と種類で絞る（仕様書 §4.4・§4.5）

const HOST = 'navitime-spot.p.rapidapi.com'
const MAX_WORD_LENGTH = 50
const LIMITS = ['10', '100']

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const word = String(query.word ?? '').trim()
  const limit = String(query.limit ?? '10')
  if (word === '' || word.length > MAX_WORD_LENGTH || !LIMITS.includes(limit)) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const res = await callRapidApi(HOST, '/spot', { word, limit })
  return { items: Array.isArray(res.body.items) ? res.body.items : [], remaining: res.remaining, limit: res.limit }
})
