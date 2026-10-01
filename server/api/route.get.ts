// ルート検索（車）の中継。このアプリで使う項目だけを通す（設計書 §9.2）。

const HOST = 'navitime-route-car.p.rapidapi.com'
const MAX_VIA = 50
const MAX_STAY = 720
// 寄る順番を最適にするとき（via_type=optimal）は、経由地10か所・滞在の合計300分まで（NAVITIME の仕様）
const MAX_OPTIMAL_VIA = 10
const MAX_OPTIMAL_STAY = 300

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
    const roadType = v?.['road-type']
    if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    if (!Number.isInteger(stay) || (stay as number) < 0 || (stay as number) > MAX_STAY) return null
    if (roadType !== undefined && roadType !== 'toll') return null
    via.push({ lat, lon, 'stay-time': stay, ...(roadType ? { 'road-type': roadType } : {}) })
  }
  return JSON.stringify(via)
}

// 最適順は、経由地があり、上限の中のときだけ通す
function optimalOk(viaType: string, via: string): boolean {
  if (viaType === '') return true
  if (viaType !== 'optimal' || via === '') return false
  const list = JSON.parse(via) as { 'stay-time': number }[]
  return list.length <= MAX_OPTIMAL_VIA && list.reduce((sum, v) => sum + v['stay-time'], 0) <= MAX_OPTIMAL_STAY
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const start = String(query.start ?? '')
  const goal = String(query.goal ?? '')
  const goalTime = String(query.goal_time ?? '')
  const startTime = String(query.start_time ?? '')
  const viaRaw = String(query.via ?? '')
  const via = viaRaw === '' ? '' : parseVia(viaRaw)
  const viaType = String(query.via_type ?? '')

  // 到着時刻と出発時刻は、どちらか片方だけを指定する（NAVITIME の仕様）
  const timeOk = isLocalTime(goalTime) !== isLocalTime(startTime) && (goalTime === '' || startTime === '')
  if (!isCoord(start) || !isCoord(goal) || !timeOk || via === null || !optimalOk(viaType, via)) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/route_car', {
    start,
    goal,
    ...(goalTime ? { goal_time: goalTime } : { start_time: startTime }),
    ...(via ? { via } : {}),
    ...(viaType ? { via_type: viaType } : {}),
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
