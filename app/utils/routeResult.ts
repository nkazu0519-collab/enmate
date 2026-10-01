// NAVITIME のルート検索（車）の応答を、このアプリの計算結果の形にする。
// 応答の形は 2026-10-01 に RapidAPI 版を実際に呼んで確かめた。
import type { LegResult, RestArea } from '../types/plan'
import { stripOffset } from './datetime'
import { simplifyShape } from './shape'

type RouteSection = {
  type: 'point' | 'move'
  name?: string
  coord?: { lat: number; lon: number }
  to_time?: string
  sapa_type?: 'SA' | 'PA'
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
    shape: shapeOf(item),
    calculatedAt,
    inputHash,
  }
}
