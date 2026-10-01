import { describe, expect, it } from 'vitest'
import type { LegResult } from '../app/types/plan'
import { shapeBetween, stayRouteLeg } from '../app/utils/legs'
import {
  distanceToRoute,
  prefecturesAlong,
  REGIONS,
  sampleRoute,
  searchCenters,
  type AreaSample,
} from '../app/utils/routeArea'
import { formOf, NAGANO, NIIGATA } from './helpers'

// 番号（E30、F38 など）は、設計書 §10.5 の表の番号

// 経度135度の線を、北緯34度から36度まで北へまっすぐ進むルート（約222km）
const LINE: [number, number][] = Array.from({ length: 21 }, (_, i) => [34 + i * 0.1, 135])

function samplesWith(prefs: string[]): AreaSample[] {
  return sampleRoute(LINE).map((s, i) => ({ ...s, prefCode: prefs[i]!, prefName: `県${prefs[i]}`, cityCode: `${prefs[i]}00${i}`, cityName: `市${i}` }))
}

describe('住所を調べる地点', () => {
  it('F38: 長いルートでも最大8地点。始点から終点まで同じ間隔で選ぶ', () => {
    const samples = sampleRoute(LINE)
    expect(samples).toHaveLength(8)
    expect(samples[0]).toMatchObject({ lat: 34, lon: 135, along: 0 })
    expect(samples[7]).toMatchObject({ lat: 36, lon: 135 })
    const gaps = samples.slice(1).map((s, i) => s.along - samples[i]!.along)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
  })

  it('F38: 15km未満の短いルートは、中間の1地点だけ調べる', () => {
    const samples = sampleRoute([
      [34, 135],
      [34.1, 135],
    ])
    expect(samples).toHaveLength(1)
    expect(samples[0]).toMatchObject({ lat: 34.05, lon: 135 })
  })

  it('F38: 地点どうしは15km以上あける（約56kmなら4地点、約45kmなら3地点）', () => {
    expect(sampleRoute(LINE.slice(0, 6))).toHaveLength(4)
    expect(sampleRoute(LINE.slice(0, 5))).toHaveLength(3)
  })
})

describe('通る都道府県', () => {
  it('E30: 通る順に並べ、同じ都道府県は最初に通ったところで1回だけ出す', () => {
    const prefs = prefecturesAlong(samplesWith(['15', '15', '20', '21', '20', '23', '23', '33']))
    expect(prefs.map((p) => p.code)).toEqual(['15', '20', '21', '23', '33'])
  })

  it('E33: 「そのほかの都道府県」の地方は7つで、47都道府県が JIS のコード順に入る', () => {
    expect(REGIONS.map((r) => r.name)).toEqual(['北海道・東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄'])
    const all = REGIONS.flatMap((r) => r.prefectures)
    expect(all).toHaveLength(47)
    expect(all.find((p) => p.name === '新潟県')?.code).toBe('15')
    expect(all.find((p) => p.name === '岡山県')?.code).toBe('33')
    expect(all.find((p) => p.name === '香川県')?.code).toBe('37')
    expect(all[46]).toEqual({ code: '47', name: '沖縄県' })
  })
})

describe('ルート沿いを探す中心', () => {
  it('E31: その都道府県だった地点の前後（となりの地点との中間まで）に、最大3か所置く', () => {
    const samples = samplesWith(['A', 'A', 'B', 'B', 'B', 'C', 'C', 'C'])
    const centers = searchCenters(LINE, samples, 'B')
    // B の範囲は、2つ目と3つ目の中間から、5つ目と6つ目の中間まで（約95km）
    expect(centers).toHaveLength(3)
    const from = (samples[1]!.lat + samples[2]!.lat) / 2
    const to = (samples[4]!.lat + samples[5]!.lat) / 2
    for (const c of centers) {
      expect(c.lat).toBeGreaterThan(from)
      expect(c.lat).toBeLessThan(to)
      expect(c.lon).toBeCloseTo(135)
    }
  })

  it('E31: 始点の都道府県は始点から、終点の都道府県は終点まで。短い範囲なら1か所', () => {
    const samples = samplesWith(['A', 'B', 'B', 'B', 'B', 'B', 'B', 'C'])
    const first = searchCenters(LINE, samples, 'A')
    expect(first).toHaveLength(1)
    expect(first[0]!.lat).toBeLessThan(samples[1]!.lat)
    expect(searchCenters(LINE, samples, 'C')[0]!.lat).toBeGreaterThan(samples[6]!.lat)
  })

  it('通らない都道府県には中心を置かない', () => {
    expect(searchCenters(LINE, samplesWith(['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A']), 'Z')).toEqual([])
  })
})

describe('ルートからの距離', () => {
  it('E31: ルートの線からいちばん近い距離（メートル）', () => {
    // 北緯35度で経度0.05度東 = 約4.6km
    expect(distanceToRoute({ lat: 35, lon: 135.05 }, LINE)).toBeGreaterThan(4500)
    expect(distanceToRoute({ lat: 35, lon: 135.05 }, LINE)).toBeLessThan(4600)
    expect(distanceToRoute({ lat: 35.03, lon: 135 }, LINE)).toBe(0)
  })
})

describe('宿泊先を選ぶ画面のルート', () => {
  it('E30: 前泊は自宅→会場（到着予定時刻）、後泊は会場→自宅（試合終了＋退場時間）。立ち寄り先は入れない', () => {
    const form = formOf({ stops: { outbound: [{ place: NIIGATA, kind: 'meal', stayMinutes: 60 }] } })
    expect(stayRouteLeg(form, 'before')).toMatchObject({ from: NIIGATA, to: NAGANO, timeRule: 'arriveBy', time: '2026-10-10T12:00:00', stops: [] })
    expect(stayRouteLeg(form, 'after')).toMatchObject({ from: NAGANO, to: NIIGATA, timeRule: 'departAt', time: '2026-10-10T17:45:00', stops: [] })
  })

  it('後泊で宿泊先がまだなくても、会場→自宅のルートは作れる。出発地がなければ作れない', () => {
    expect(stayRouteLeg(formOf({ stayAfter: true, hotelAfter: null }), 'after')).not.toBeNull()
    expect(stayRouteLeg(formOf({ home: null }), 'before')).toBeNull()
  })

  it('F40: 同じ出発地・到着地の計算結果があれば、そのルートの形を使う（時刻が違っても使う）', () => {
    const result = (hash: string, shape: [number, number][]) => ({ inputHash: hash, shape }) as LegResult
    const results = [
      result(`${NAGANO.lat},${NAGANO.lon}|${NIIGATA.lat},${NIIGATA.lon}|departAt|2026-10-10T18:00:00|`, [[1, 1]]),
      result(`${NIIGATA.lat},${NIIGATA.lon}|${NAGANO.lat},${NAGANO.lon}|arriveBy|2026-10-10T11:00:00|`, [[2, 2]]),
    ]
    expect(shapeBetween(results, NIIGATA, NAGANO)).toEqual([[2, 2]])
    expect(shapeBetween(results, NIIGATA, { ...NAGANO, lat: 36 })).toBeNull()
  })
})
