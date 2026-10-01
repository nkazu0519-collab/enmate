// 場所を名前で探す（NAVITIME スポット検索）の中継。

const HOST = 'navitime-spot.p.rapidapi.com'
const MAX_WORD_LENGTH = 50

export default defineEventHandler(async (event) => {
  const word = String(getQuery(event).word ?? '').trim()
  if (word === '' || word.length > MAX_WORD_LENGTH) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/spot', { word, limit: '10' })
  return { items: Array.isArray(body.items) ? body.items : [], remaining, limit }
})
