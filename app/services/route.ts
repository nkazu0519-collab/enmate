// ルート検索。今の中身は NAVITIME ルート検索（車）。
import type { Leg, LegResult, Stop } from '~/types/plan'
import { readCache, writeCache } from '~/utils/apiCache'
import { legInputHash, reorderStops } from '~/utils/legs'
import { parseRouteItem, visitedCoordsOf, type RouteItem } from '~/utils/routeResult'
import { callApi } from './api'

const CACHE_MS = 24 * 60 * 60 * 1000 // 1日

// 同じ条件の検索が進んでいる間にもう一度呼ばれたら、同じ検索の結果を待つ（二重に呼ばない）
const running = new Map<string, Promise<LegResult>>()

function routeQuery(leg: Leg): Record<string, string> {
  return {
    start: `${leg.from.lat},${leg.from.lon}`,
    goal: `${leg.to.lat},${leg.to.lon}`,
    ...(leg.timeRule === 'arriveBy' ? { goal_time: leg.time } : { start_time: leg.time }),
    // 立ち寄り先は、入れた順に経由地として渡す。滞在時間も時刻に含めて計算される
    ...(leg.stops.length > 0
      ? {
          via: JSON.stringify(
            leg.stops.map((s) => ({
              lat: s.place.lat,
              lon: s.place.lon,
              'stay-time': s.stayMinutes,
              // SA/PA は有料道路上の地点として渡す（付けないと高速を降りて寄るルートになる）
              ...(s.tollRoad ? { 'road-type': 'toll' } : {}),
            })),
          ),
        }
      : {}),
  }
}

async function fetchRoute(leg: Leg, hash: string): Promise<LegResult> {
  const { item } = await callApi<{ item: RouteItem }>('route', '/api/route', routeQuery(leg))
  const result = parseRouteItem(item, hash, new Date().toISOString())
  writeCache(`route:${hash}`, result)
  return result
}

export function searchRoute(leg: Leg): Promise<LegResult> {
  const hash = legInputHash(leg)
  const cached = readCache<LegResult>(`route:${hash}`, CACHE_MS)
  if (cached) return Promise.resolve(cached)

  let promise = running.get(hash)
  if (!promise) {
    promise = fetchRoute(leg, hash).finally(() => running.delete(hash))
    running.set(hash, promise)
  }
  return promise
}

// 寄る順番を最適にした検索（仕様書にない追加）。1回だけ呼び、並べ替えた立ち寄り先と、その順番での計算結果を返す。
// 結果は並べ替えた順番の条件として保存するので、そのあとの計算し直しでは呼ばない
export async function searchOptimalOrder(leg: Leg): Promise<{ stops: Stop[]; result: LegResult }> {
  const { item } = await callApi<{ item: RouteItem }>('route', '/api/route', { ...routeQuery(leg), via_type: 'optimal' })
  const stops = reorderStops(leg.stops, visitedCoordsOf(item))
  if (!stops) throw new Error('並べ替えた結果を読み取れませんでした。今の順番のままお使いください。')
  const hash = legInputHash({ ...leg, stops })
  const result = parseRouteItem(item, hash, new Date().toISOString())
  writeCache(`route:${hash}`, result)
  return { stops, result }
}
