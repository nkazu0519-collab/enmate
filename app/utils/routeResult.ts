// NAVITIME のルート検索（車）の応答を、このアプリの計算結果の形にする。
// 応答の形は 2026-10-01 に RapidAPI 版を実際に呼んで確かめた。
import type { LegResult, RestArea, StopVisit } from '../types/plan'
import { stripOffset } from './datetime'
import { simplifyShape } from './shape'

type RouteSection = {
  type: 'point' | 'move'
  name?: string
  coord?: { lat: number; lon: number }
  to_time?: string
  sapa_type?: 'SA' | 'PA'
  with_via?: boolean // 立ち寄り先（経由地）の地点に付く
  from_time?: string
}

export type RouteItem = {
  summary: {
    move: {
      from_time: string
      to_time: string
      time: number // 分
      distance: number // メートル
      // unit_{料金の種類}_{車種}。1025 は ETC、末尾 2 は普通車
      fare?: Record<string, number>
    }
  }
  sections: RouteSection[]
  shapes?: { features: { geometry: { coordinates: [number, number][] } }[] }
}

function restAreasOf(sections: RouteSection[]): RestArea[] {
  const areas: RestArea[] = []
  sections.forEach((section, i) => {
    if (section.type !== 'point' || !section.sapa_type || !section.coord) return
    // SA/PA に着く時刻は、直前の移動区間の終わりの時刻
    const arrivedAt = sections[i - 1]?.to_time
    if (!arrivedAt) return
    areas.push({
      name: section.name ?? '',
      kind: section.sapa_type,
      lat: section.coord.lat,
      lon: section.coord.lon,
      passAt: stripOffset(arrivedAt),
    })
  })
  return areas
}

// 立ち寄り先の地点は name が「経由地」、with_via が true で返る（2026-10-01 に確認）。
// 着く時刻は直前の移動区間の終わり、出る時刻は直後の移動区間の始まり
function stopVisitsOf(sections: RouteSection[]): StopVisit[] {
  const visits: StopVisit[] = []
  sections.forEach((section, i) => {
    if (section.type !== 'point' || !section.with_via) return
    const arrivedAt = sections[i - 1]?.to_time
    const leftAt = sections[i + 1]?.from_time
    if (!arrivedAt || !leftAt) return
    visits.push({ arriveAt: stripOffset(arrivedAt), departAt: stripOffset(leftAt) })
  })
  return visits
}

// 立ち寄り先の地点の座標を、寄る順に取り出す（最適順で並べ替えた結果を読むのに使う）
export function visitedCoordsOf(item: RouteItem): { lat: number; lon: number }[] {
  return item.sections.flatMap((s) => (s.type === 'point' && s.with_via && s.coord ? [s.coord] : []))
}

function shapeOf(item: RouteItem): [number, number][] {
  const points: [number, number][] = []
  for (const feature of item.shapes?.features ?? []) {
    for (const [lon, lat] of feature.geometry.coordinates) {
      const last = points[points.length - 1]
      if (last && last[0] === lat && last[1] === lon) continue // 線のつなぎ目の重なり
      points.push([lat, lon])
    }
  }
  return simplifyShape(points)
}

export function parseRouteItem(item: RouteItem, inputHash: string, calculatedAt: string): LegResult {
  const move = item.summary.move
  return {
    departAt: stripOffset(move.from_time),
    arriveAt: stripOffset(move.to_time),
    driveMinutes: move.time,
    distanceMeters: move.distance,
    tollYen: move.fare?.unit_1025_2 ?? 0,
    trafficConsidered: false, // RapidAPI 版では渋滞情報を使えない（設計書 §7.3）
    restAreas: restAreasOf(item.sections),
    stopVisits: stopVisitsOf(item.sections),
    shape: shapeOf(item),
    calculatedAt,
    inputHash,
  }
}
