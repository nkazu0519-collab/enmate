// 中継（/api/...）を呼ぶには合言葉が要る（設計書 §9.2）。公開 URL を知った他人に、NAVITIME の無料枠を使われないようにする。
// 合言葉は環境変数 ENMATE_PASSPHRASE に入れる。
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  const problem = passphraseProblem(process.env.ENMATE_PASSPHRASE, getHeader(event, PASSPHRASE_HEADER), import.meta.dev)
  if (problem === 'config') throw createError({ statusCode: 500, message: 'config', data: { kind: 'config' } })
  // 合言葉が違うときは NAVITIME を呼ばないので、使用回数は減らない
  if (problem === 'passphrase') throw createError({ statusCode: 401, message: 'passphrase', data: { kind: 'passphrase' } })
})
