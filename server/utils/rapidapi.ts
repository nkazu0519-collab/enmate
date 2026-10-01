// RapidAPI 経由で NAVITIME を呼ぶ。API キーはサーバー側だけで使い、ブラウザには渡さない。

const TIMEOUT_MS = 20_000

function headerNumber(res: Response, name: string): number | null {
  const value = res.headers.get(name)
  return value !== null && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : null
}

// 失敗は kind で種類を伝える。reached は、RapidAPI まで届いた（＝回数に数えられたかもしれない）かどうか
function fail(statusCode: number, kind: string, extra: Record<string, unknown> = {}): never {
  throw createError({ statusCode, message: kind, data: { kind, ...extra } })
}

export async function callRapidApi(host: string, path: string, params: Record<string, string>) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) fail(500, 'config')

  let res: Response
  try {
    res = await fetch(`https://${host}${path}?${new URLSearchParams(params)}`, {
      headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    fail(502, 'network')
  }

  const remaining = headerNumber(res, 'x-ratelimit-requests-remaining')
  const limit = headerNumber(res, 'x-ratelimit-requests-limit')
  const usage = { reached: true, remaining, limit }

  if (res.status === 429) fail(429, remaining === 0 ? 'quota' : 'rateLimit', usage)
  if (res.status === 401 || res.status === 403) fail(502, 'notSubscribed', { reached: false })
  // そのほかの 4xx は条件の誤りで、時間をおいても結果は変わらない（失敗も1回に数えられる。設計書 §10.5）
  if (res.status >= 400 && res.status < 500) fail(400, 'badRequest', usage)
  if (!res.ok) fail(502, 'upstream', usage)

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) fail(502, 'upstream', usage)
  return { body, remaining, limit }
}
