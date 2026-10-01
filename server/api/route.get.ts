// ルート検索（車）の中継。このアプリで使う項目だけを通す（設計書 §9.2）。

const HOST = 'navitime-route-car.p.rapidapi.com'
const COORD = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const start = String(query.start ?? '')
  const goal = String(query.goal ?? '')
  const goalTime = String(query.goal_time ?? '')
  const startTime = String(query.start_time ?? '')

  // 到着時刻と出発時刻は、どちらか片方だけを指定する（NAVITIME の仕様）
  const timeOk = TIME.test(goalTime) !== TIME.test(startTime) && (goalTime === '' || startTime === '')
  if (!COORD.test(start) || !COORD.test(goal) || !timeOk) {
    throw createError({ statusCode: 400, message: 'badRequest', data: { kind: 'badRequest' } })
  }

  const { body, remaining, limit } = await callRapidApi(HOST, '/route_car', {
    start,
    goal,
    ...(goalTime ? { goal_time: goalTime } : { start_time: startTime }),
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
