// ルート検索（車）の中継。このアプリで使う項目だけを通す（設計書 §9.2）。

const HOST = 'navitime-route-car.p.rapidapi.com'
const COORD = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const MAX_VIA = 5
const MAX_STAY = 300

// 経由地（立ち寄り先）を確かめて、決まった形に組み直す。正しくなければ null
function parseVia(raw: string): string | null {
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_VIA) return null
  const via = []
  for (const v of list as Record<string, unknown>[]) {
    const { lat, lon } = v ?? {}
    const stay = v?.['stay-time']
    if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    if (!Number.isInteger(stay) || (stay as number) < 0 || (stay as number) > MAX_STAY) return null
    via.push({ lat, lon, 'stay-time': stay })
  }
  return JSON.stringify(via)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const start = String(query.start ?? '')
  const goal = String(query.goal ?? '')
  const goalTime = String(query.goal_time ?? '')
  const startTime = String(query.start_time ?? '')
  const viaRaw = String(query.via ?? '')
  const via = viaRaw === '' ? '' : parseVia(viaRaw)

  // 到着時刻と出発時刻は、どちらか片方だけを指定する（NAVITIME の仕様）
  const timeOk = TIME.test(goalTime) !== TIME.test(startTime) && (goalTime === '' || startTime === '')
  if (!COORD.test(start) || !COORD.test(goal) || !timeOk || via === null) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/route_car', {
    start,
    goal,
    ...(goalTime ? { goal_time: goalTime } : { start_time: startTime }),
    ...(via ? { via } : {}),
    shape: 'true', // ルートの線の形も一緒に受け取る
    options: 'turn_by_turn',
    divide_with: 'sa.pa', // SA/PA を通る時刻を受け取る
  })

  const item = (body.items as Record<string, any>[] | undefined)?.[0]
  if (!item?.summary?.move) {
    throw createError({ statusCode: 404, message: 'noRoute', data: { kind: 'noRoute', reached: true, remaining, limit } })
  }

  return {
    item: {
      summary: item.summary,
      sections: item.sections ?? [],
      // 線の色や太さの情報は使わないので、形だけを返す
      shapes: { features: (item.shapes?.features ?? []).map((f: any) => ({ geometry: f.geometry })) },
    },
    remaining,
    limit,
  }
})
