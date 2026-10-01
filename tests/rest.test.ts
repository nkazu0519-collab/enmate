import { describe, expect, it } from 'vitest'
import type { LegResult, RestArea } from '../app/types/plan'
import { suggestRests } from '../app/utils/rest'

// 番号（E15、F19 など）は、設計書 §10.4 の表の番号。決まりは仕様書 §4.8

const area = (name: string, passAt: string): RestArea => ({
  name,
  kind: name.endsWith('SA') ? 'SA' : 'PA',
  lat: 0,
  lon: 0,
  passAt: `2026-10-10T${passAt}:00`,
})

function resultOf(departAt: string, arriveAt: string, restAreas: RestArea[], stopVisits: [string, string][] = []): Pick<LegResult, 'departAt' | 'arriveAt' | 'restAreas' | 'stopVisits'> {
  return {
    departAt: `2026-10-10T${departAt}:00`,
    arriveAt: `2026-10-10T${arriveAt}:00`,
    restAreas,
    stopVisits: stopVisits.map(([a, d]) => ({ arriveAt: `2026-10-10T${a}:00`, departAt: `2026-10-10T${d}:00` })),
  }
}

const names = (advice: ReturnType<typeof suggestRests>) => advice.suggestions.map((a) => a.name)

describe('休憩地の提案（休憩間隔 2時間）', () => {
  it('E15: 休憩間隔以内で着くなら、休憩は勧めない', () => {
    expect(suggestRests(resultOf('09:00', '11:00', [area('米山SA', '10:00')]), 120)).toEqual({ suggestions: [], longStretches: [] })
  })

  it('E15: 休憩間隔ぎりぎり（残り40分以内）まで走れる SA を、より遠い PA より優先する', () => {
    const areas = [area('黒埼PA', '09:40'), area('米山SA', '10:30'), area('大潟PA', '10:55'), area('妙高SA', '11:20')]
    const advice = suggestRests(resultOf('09:00', '12:00', areas), 120)
    expect(names(advice)).toEqual(['米山SA'])
    expect(advice.suggestions[0]!.drivenMinutes).toBe(90)
  })

  it('E15: ぎりぎりまで走れる SA がなければ、範囲内でいちばん遠い SA/PA', () => {
    const areas = [area('A-PA', '10:00'), area('B-PA', '10:50')]
    expect(names(suggestRests(resultOf('09:00', '12:00', areas), 120))).toEqual(['B-PA'])
  })

  it('E15: 長い区間では、休んだ所から数えて、また選ぶ', () => {
    const areas = [area('A-SA', '10:50'), area('B-SA', '12:40'), area('C-SA', '14:20'), area('D-PA', '15:00')]
    expect(names(suggestRests(resultOf('09:00', '16:00', areas), 120))).toEqual(['A-SA', 'B-SA', 'C-SA'])
  })

  it('E15: 休憩間隔を変えると、選ぶ SA/PA も変わる（1時間30分）', () => {
    const areas = [area('米山SA', '10:20'), area('妙高SA', '11:20')]
    expect(names(suggestRests(resultOf('09:00', '11:40', areas), 90))).toEqual(['米山SA'])
  })

  it('F21: 前の休憩（出発）から30分未満の SA/PA は選ばない', () => {
    const advice = suggestRests(resultOf('09:00', '11:30', [area('すぐのSA', '09:20')]), 120)
    expect(advice.suggestions).toEqual([])
  })

  it('F19: SA/PA を通らないまま休憩間隔を超えるなら、その区間を伝える', () => {
    const advice = suggestRests(resultOf('09:00', '12:30', []), 120)
    expect(advice.longStretches).toEqual([{ from: '2026-10-10T09:00:00', to: '2026-10-10T12:30:00', minutes: 210 }])
  })

  it('F20: 範囲内に SA/PA がなければ、範囲を超えた直後の SA/PA で妥協し、間隔を超えることを伝える', () => {
    const advice = suggestRests(resultOf('09:00', '13:00', [area('遠いSA', '11:40')]), 120)
    expect(names(advice)).toEqual(['遠いSA'])
    expect(advice.longStretches).toEqual([{ from: '2026-10-10T09:00:00', to: '2026-10-10T11:40:00', minutes: 160 }])
  })

  it('E16: 15分以上いる立ち寄り先は休憩とみなし、そこから数え直す', () => {
    const areas = [area('米山SA', '10:50')]
    // 10:20〜10:40 の20分の立ち寄り。出発から80分、立ち寄り先から110分で、どちらも2時間以内
    expect(suggestRests(resultOf('09:00', '12:30', areas, [['10:20', '10:40']]), 120)).toEqual({ suggestions: [], longStretches: [] })
  })

  it('E16: 15分未満の立ち寄り先は休憩とみなさない', () => {
    const areas = [area('米山SA', '10:50')]
    expect(names(suggestRests(resultOf('09:00', '12:30', areas, [['10:20', '10:30']]), 120))).toEqual(['米山SA'])
  })

  it('F25: 立ち寄り先の時刻を持っていない（段階1で保存した）結果でも動く', () => {
    const result = { ...resultOf('09:00', '12:00', [area('米山SA', '10:30')]), stopVisits: undefined }
    expect(names(suggestRests(result, 120))).toEqual(['米山SA'])
  })
})
