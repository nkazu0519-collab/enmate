// 休憩地（SA/PA）の提案（仕様書 §4.8、設計書 §7.2）。ルート検索の結果だけで決め、API は呼ばない。
import type { LegResult, RestArea } from '../types/plan'
import { minutesBetween } from './datetime'

// 前の休憩からこれだけ走るまでは勧めない
export const MIN_DRIVE_MINUTES = 30
// 休憩間隔の残りがこの分数以内まで走れる SA を優先する
export const LAST_STRETCH_MINUTES = 40
// この分数以上いる立ち寄り先は休憩とみなし、そこから運転時間を数え直す
export const REST_STAY_MINUTES = 15

export type RestSuggestion = RestArea & {
  drivenMinutes: number // 前の休憩（出発）からの運転時間
}

export type LongStretch = { from: string; to: string; minutes: number }

export type RestAdvice = {
  suggestions: RestSuggestion[] // 休憩を勧める SA/PA（通る順）
  longStretches: LongStretch[] // 休憩間隔を超えて運転が続いてしまうところ
}

export function suggestRests(result: Pick<LegResult, 'departAt' | 'arriveAt' | 'restAreas' | 'stopVisits'>, intervalMinutes: number): RestAdvice {
  const advice: RestAdvice = { suggestions: [], longStretches: [] }

  // 続けて運転する区切り: 出発 → 15分以上いる立ち寄り先 → … → 到着
  const stretches: [string, string][] = []
  let start = result.departAt
  for (const visit of result.stopVisits ?? []) {
    if (minutesBetween(visit.arriveAt, visit.departAt) < REST_STAY_MINUTES) continue
    stretches.push([start, visit.arriveAt])
    start = visit.departAt
  }
  stretches.push([start, result.arriveAt])

  for (const [from, to] of stretches) {
    let t = from
    while (minutesBetween(t, to) > intervalMinutes) {
      const ahead = result.restAreas.filter((area) => area.passAt > t && area.passAt < to)
      const inRange = ahead.filter((area) => {
        const driven = minutesBetween(t, area.passAt)
        return driven >= MIN_DRIVE_MINUTES && driven <= intervalMinutes
      })
      // 休憩間隔ぎりぎり（残り40分以内）まで走れる SA を優先し、なければ範囲内でいちばん遠い SA/PA
      const nearLimitSa = inRange.filter((area) => area.kind === 'SA' && minutesBetween(t, area.passAt) >= intervalMinutes - LAST_STRETCH_MINUTES)
      let pick = nearLimitSa[nearLimitSa.length - 1] ?? inRange[inRange.length - 1]
      if (!pick) {
        // 範囲内になければ、範囲を超えた直後の SA/PA で妥協する
        pick = ahead.find((area) => minutesBetween(t, area.passAt) > intervalMinutes)
        if (!pick) {
          advice.longStretches.push({ from: t, to, minutes: minutesBetween(t, to) })
          break
        }
        advice.longStretches.push({ from: t, to: pick.passAt, minutes: minutesBetween(t, pick.passAt) })
      }
      advice.suggestions.push({ ...pick, drivenMinutes: minutesBetween(t, pick.passAt) })
      t = pick.passAt
    }
  }
  return advice
}
