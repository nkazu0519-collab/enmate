import { describe, expect, it } from 'vitest'
import type { LegResult, Plan } from '../app/types/plan'
import { buildLegs } from '../app/utils/legs'
import { collectionTotals, groupByYear, homeTimes, planTotals } from '../app/utils/planSummary'
import { formOf, NAGANO, NIIGATA } from './helpers'

function resultOf(overrides: Partial<LegResult>): LegResult {
  return {
    departAt: '2026-10-10T09:00:00',
    arriveAt: '2026-10-10T12:00:00',
    driveMinutes: 180,
    distanceMeters: 200_000,
    tollYen: 5000,
    trafficConsidered: false,
    restAreas: [],
    shape: [],
    calculatedAt: '2026-10-01T05:00:00.000Z',
    inputHash: '',
    ...overrides,
  }
}

function planOf(id: string, matchDate: string, results: (Partial<LegResult> | undefined)[]): Plan {
  const legs = buildLegs(formOf({ matchDate })).map((leg, i) => {
    const r = results[i]
    return r ? { ...leg, result: resultOf(r) } : leg
  })
  return {
    id,
    name: id,
    home: NIIGATA,
    venue: NAGANO,
    matchDate,
    arriveBy: '12:00',
    matchEnd: '17:00',
    exitMinutes: 45,
    restIntervalMinutes: 120,
    hotelsBefore: [],
    hotelsAfter: [],
    legs,
    createdAt: '2026-10-01T05:00:00.000Z',
    updatedAt: '2026-10-01T05:00:00.000Z',
    schemaVersion: 1,
  }
}

describe('チケットに出す時刻', () => {
  it('E11: 家を出る時刻は行きの出発、帰り着く時刻は帰りの到着', () => {
    const plan = planOf('a', '2026-10-10', [
      { departAt: '2026-10-10T08:40:00' },
      { arriveAt: '2026-10-11T00:30:00' },
    ])
    expect(homeTimes(plan)).toEqual({ departAt: '2026-10-10T08:40:00', homeAt: '2026-10-11T00:30:00' })
  })

  it('計算していない区間の時刻は出さない', () => {
    expect(homeTimes(planOf('a', '2026-10-10', [undefined, undefined]))).toEqual({})
  })
})

describe('完了済みの合計', () => {
  it('E12: 行きと帰りの距離と高速料金を、全プランぶん足す', () => {
    const plans = [
      planOf('a', '2026-09-05', [{ distanceMeters: 210_000, tollYen: 4500 }, { distanceMeters: 214_000, tollYen: 4500 }]),
      planOf('b', '2026-08-01', [{ distanceMeters: 100_000, tollYen: 0 }, { distanceMeters: 100_500, tollYen: 0 }]),
    ]
    expect(planTotals(plans[0]!)).toEqual({ distanceMeters: 424_000, tollYen: 9000 })
    expect(collectionTotals(plans)).toEqual({ count: 2, distanceMeters: 624_500, tollYen: 9000 })
  })

  it('計算していない区間は0として数え、合計が NaN にならない', () => {
    const plan = planOf('a', '2026-09-05', [{ distanceMeters: 210_000, tollYen: 4500 }, undefined])
    expect(collectionTotals([plan])).toEqual({ count: 1, distanceMeters: 210_000, tollYen: 4500 })
  })

  it('0件なら、すべて0', () => {
    expect(collectionTotals([])).toEqual({ count: 0, distanceMeters: 0, tollYen: 0 })
  })
})

describe('年ごとのまとめ', () => {
  it('E12: 新しい順に並んだプランを、年ごとに分ける', () => {
    const plans = [
      planOf('2026秋', '2026-09-05', []),
      planOf('2026春', '2026-03-10', []),
      planOf('2025冬', '2025-12-09', []),
    ]
    expect(groupByYear(plans).map((g) => [g.year, g.plans.map((p) => p.id)])).toEqual([
      ['2026', ['2026秋', '2026春']],
      ['2025', ['2025冬']],
    ])
  })
})
