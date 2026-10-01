import { describe, expect, it } from 'vitest'
import type { LegResult, RestArea } from '../app/types/plan'
import { suggestRests } from '../app/utils/rest'

// 番号（E15、F19 など）は、設計書 §10.4 の表の番号

const area = (name: string, passAt: string): RestArea => ({
  name,
  kind: name.endsWith('SA') ? 'SA' : 'PA',
  lat: 0,
  lon: 0,
  passAt: `2026-10-10T${passAt}:00`,
})

function resultOf(departAt: string, arriveAt: string, restAreas: RestArea[], stopVisits?: [string, string][]): LegResult {
  return {
    departAt: `2026-10-10T${departAt}:00`,
    arriveAt: `2026-10-10T${arriveAt}:00`,
    driveMinutes: 0,
    distanceMeters: 0,
    tollYen: 0,
    trafficConsidered: false,
    restAreas,
    stopVisits: stopVisits?.map(([a, d]) => ({ arriveAt: `2026-10-10T${a}:00`, departAt: `2026-10-10T${d}:00` })),
    shape: [],
    calculatedAt: '',
    inputHash: '',
  }
}

const names = (areas: RestArea[]) => areas.map((a) => a.name)

describe('休憩地の提案（休憩間隔 2時間）', () => {
  it('E15: 2時間以内で着くなら、休憩は勧めない', () => {
    const advice = suggestRests(resultOf('09:00', '11:00', [area('米山SA', '10:00')]), 120)
    expect(advice).toEqual({ suggestions: [], longStretches: [] })
  })

  it('E15: 2時間を超えるなら、2時間以内で最後に通る SA/PA を勧める', () => {
    const areas = [area('黒埼PA', '09:40'), area('米山SA', '10:30'), area('大潟PA', '10:55'), area('妙高SA', '11:20')]
    const advice = suggestRests(resultOf('09:00', '12:00', areas), 120)
    expect(names(advice.suggestions)).toEqual(['大潟PA'])
    expect(advice.longStretches).toEqual([])
  })

  it('E15: 長い区間では、休んだ所から数えて、また2時間以内に勧める', () => {
    const areas = [area('A-PA', '10:50'), area('B-SA', '12:40'), area('C-PA', '14:20'), area('D-SA', '15:00')]
    const advice = suggestRests(resultOf('09:00', '16:00', areas), 120)
    expect(names(advice.suggestions)).toEqual(['A-PA', 'B-SA', 'C-PA'])
  })

  it('F19: SA/PA を通らないまま2時間を超えるなら、その区間を伝える', () => {
    const advice = suggestRests(resultOf('09:00', '12:30', []), 120)
    expect(advice.suggestions).toEqual([])
    expect(advice.longStretches).toEqual([{ from: '2026-10-10T09:00:00', to: '2026-10-10T12:30:00', minutes: 210 }])
  })

  it('F20: 2時間以内に SA/PA がなければ、次の SA/PA を勧め、間隔を超えることを伝える', () => {
    const advice = suggestRests(resultOf('09:00', '13:00', [area('遠いSA', '11:40')]), 120)
    expect(names(advice.suggestions)).toEqual(['遠いSA'])
    expect(advice.longStretches).toEqual([{ from: '2026-10-10T09:00:00', to: '2026-10-10T11:40:00', minutes: 160 }])
  })

  it('F21: 出発・到着から15分以内の SA/PA は勧めない', () => {
    const areas = [area('すぐのPA', '09:10'), area('着く直前のSA', '11:50')]
    const advice = suggestRests(resultOf('09:00', '12:00', areas), 120)
    expect(advice.suggestions).toEqual([])
    expect(advice.longStretches).toHaveLength(1)
  })

  it('E16: 立ち寄り先で休んだら、そこから数え直す', () => {
    // 10:30〜11:30 に立ち寄り先。出発から立ち寄り先までも、立ち寄り先から到着までも2時間以内
    const areas = [area('米山SA', '10:00'), area('妙高SA', '12:30')]
    const advice = suggestRests(resultOf('09:00', '13:00', areas, [['10:30', '11:30']]), 120)
    expect(advice).toEqual({ suggestions: [], longStretches: [] })
  })

  it('F22: 立ち寄り先の時刻を持っていない（段階1で保存した）結果でも動く', () => {
    const advice = suggestRests(resultOf('09:00', '12:00', [area('大潟PA', '10:55')]), 120)
    expect(names(advice.suggestions)).toEqual(['大潟PA'])
  })
})
