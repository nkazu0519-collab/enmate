import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRouteItem, type RouteItem } from '../app/utils/routeResult'
import { simplifyShape } from '../app/utils/shape'

// NAVITIME の実際の応答と同じ項目名で作った、小さな見本（値は架空）
const item: RouteItem = {
  summary: {
    move: {
      from_time: '2026-10-10T09:20:22+09:00',
      to_time: '2026-10-10T12:00:00+09:00',
      time: 159,
      distance: 213570,
      fare: { unit_1024_1: 3970, unit_1024_2: 4920, unit_1025_1: 3970, unit_1025_2: 4900, unit_1025_3: 5870 },
    },
  },
  sections: [
    { type: 'point', name: 'start', coord: { lat: 37.9, lon: 139.0 } },
    { type: 'move', to_time: '2026-10-10T09:50:10+09:00' },
    { type: 'point', name: '黒埼ＰＡ', coord: { lat: 37.8, lon: 138.9 }, sapa_type: 'PA' },
    { type: 'move', to_time: '2026-10-10T10:40:00+09:00' },
    { type: 'point', name: '交差点', coord: { lat: 37.5, lon: 138.7 } },
    { type: 'move', to_time: '2026-10-10T11:05:30+09:00' },
    { type: 'point', name: '米山ＳＡ', coord: { lat: 37.3, lon: 138.5 }, sapa_type: 'SA' },
    { type: 'move', to_time: '2026-10-10T12:00:00+09:00' },
    { type: 'point', name: 'goal', coord: { lat: 36.6, lon: 138.2 } },
  ],
  shapes: {
    features: [
      // GeoJSON なので、経度・緯度の順
      { geometry: { coordinates: [[139.0, 37.9], [138.9, 37.8]] } },
      { geometry: { coordinates: [[138.9, 37.8], [138.5, 37.3], [138.2, 36.6]] } },
    ],
  },
}

describe('ルート検索の応答の読み取り', () => {
  const result = parseRouteItem(item, 'hash-1', '2026-10-01T05:00:00.000Z')

  it('E1・E2: 出発と到着の時刻を、日本時間で取り出す', () => {
    expect(result.departAt).toBe('2026-10-10T09:20:22')
    expect(result.arriveAt).toBe('2026-10-10T12:00:00')
  })

  it('E3: 運転時間・距離・高速料金（ETC・普通車）を取り出す', () => {
    expect(result.driveMinutes).toBe(159)
    expect(result.distanceMeters).toBe(213570)
    expect(result.tollYen).toBe(4900) // unit_1025_2。現金（unit_1024_2）や軽自動車（_1）と取り違えない
  })

  it('E4: 渋滞は考慮していない結果として記録する', () => {
    expect(result.trafficConsidered).toBe(false)
  })

  it('高速道路を使わないルート（料金の項目がない）は 0 円', () => {
    const noToll = { ...item, summary: { move: { ...item.summary.move, fare: undefined } } }
    expect(parseRouteItem(noToll, 'h', 'now').tollYen).toBe(0)
  })

  it('SA/PA だけを、着く時刻つきで取り出す（交差点は含めない）', () => {
    expect(result.restAreas).toEqual([
      { name: '黒埼ＰＡ', kind: 'PA', lat: 37.8, lon: 138.9, passAt: '2026-10-10T09:50:10' },
      { name: '米山ＳＡ', kind: 'SA', lat: 37.3, lon: 138.5, passAt: '2026-10-10T11:05:30' },
    ])
  })

  it('線の形は、緯度・経度の順に直し、つなぎ目の重なりを除く', () => {
    expect(result.shape).toEqual([
      [37.9, 139.0],
      [37.8, 138.9],
      [37.3, 138.5],
      [36.6, 138.2],
    ])
  })

  it('どの条件で計算した結果かを持つ', () => {
    expect(result.inputHash).toBe('hash-1')
    expect(result.calculatedAt).toBe('2026-10-01T05:00:00.000Z')
  })

  it('線の形がない応答でも落ちない', () => {
    expect(parseRouteItem({ ...item, shapes: undefined }, 'h', 'now').shape).toEqual([])
  })
})

describe('線の間引き', () => {
  it('まっすぐ並んだ途中の点は除き、始点と終点は残す', () => {
    const line: [number, number][] = [[37.0, 139.0], [37.1, 139.0], [37.2, 139.0], [37.3, 139.0]]
    expect(simplifyShape(line)).toEqual([[37.0, 139.0], [37.3, 139.0]])
  })

  it('曲がり角の点は残す', () => {
    const corner: [number, number][] = [[37.0, 139.0], [37.1, 139.0], [37.1, 139.1]]
    expect(simplifyShape(corner)).toEqual(corner)
  })

  it('点が2つ以下ならそのまま', () => {
    expect(simplifyShape([])).toEqual([])
    expect(simplifyShape([[37.0, 139.0]])).toEqual([[37.0, 139.0]])
  })
})

// 実際の応答での確認。NAVITIME の応答は公開できないのでリポジトリには入れず、
// 手元に保存したファイルを ROUTE_DUMP で指定したときだけ実行する。
describe.skipIf(!process.env.ROUTE_DUMP)('実際の応答（新潟駅 → 長野Uスタジアム、10/10 12:00 着）', () => {
  const real = () => JSON.parse(readFileSync(process.env.ROUTE_DUMP!, 'utf8')).items[0] as RouteItem

  it('時刻・運転時間・距離・料金が読める', () => {
    const result = parseRouteItem(real(), 'h', 'now')
    expect(result.arriveAt).toBe('2026-10-10T12:00:00')
    expect(result.departAt).toBe('2026-10-10T09:20:22')
    expect(result.driveMinutes).toBe(159)
    expect(result.distanceMeters).toBe(213570)
    expect(result.tollYen).toBe(4920)
    expect(result.restAreas).toHaveLength(10)
    expect(result.restAreas[0]).toMatchObject({ name: '黒埼ＰＡ', kind: 'PA' })
  })

  it('線の形は、間引いても始点・終点が変わらず、点の数が大きく減る', () => {
    const result = parseRouteItem(real(), 'h', 'now')
    console.log(`間引いたあとの点の数: ${result.shape.length}`)
    expect(result.shape[0]).toEqual([37.9122, 139.0617])
    expect(result.shape.at(-1)![0]).toBeCloseTo(36.5806, 2)
    expect(result.shape.length).toBeLessThan(1000)
    expect(result.shape.length).toBeGreaterThan(50)
  })
})

describe('立ち寄り先（経由地）のある応答', () => {
  // 2026-10-01 の実際の応答では、経由地は name が「経由地」、with_via が true で返った
  const withVia: RouteItem = {
    ...item,
    sections: [
      { type: 'point', name: 'start', coord: { lat: 37.9, lon: 139.0 } },
      { type: 'move', from_time: '2026-10-10T08:36:35+09:00', to_time: '2026-10-10T10:25:53+09:00' },
      { type: 'point', name: '経由地', coord: { lat: 37.1, lon: 138.2 }, with_via: true },
      { type: 'move', from_time: '2026-10-10T10:55:53+09:00', to_time: '2026-10-10T11:40:00+09:00' },
      { type: 'point', name: '妙高ＳＡ', coord: { lat: 36.9, lon: 138.2 }, sapa_type: 'SA' },
      { type: 'move', from_time: '2026-10-10T11:40:00+09:00', to_time: '2026-10-10T12:00:00+09:00' },
      { type: 'point', name: 'goal', coord: { lat: 36.6, lon: 138.2 } },
    ],
  }

  it('E13: 立ち寄り先に着く時刻と、出る時刻を取り出す', () => {
    const result = parseRouteItem(withVia, 'hash-2', '2026-10-01T05:00:00.000Z')
    expect(result.stopVisits).toEqual([{ arriveAt: '2026-10-10T10:25:53', departAt: '2026-10-10T10:55:53' }])
  })

  it('立ち寄り先は SA/PA の一覧には入れない', () => {
    const result = parseRouteItem(withVia, 'hash-2', '2026-10-01T05:00:00.000Z')
    expect(result.restAreas.map((a) => a.name)).toEqual(['妙高ＳＡ'])
  })

  it('立ち寄り先がなければ、空の一覧', () => {
    expect(parseRouteItem(item, 'hash-1', '2026-10-01T05:00:00.000Z').stopVisits).toEqual([])
  })
})
