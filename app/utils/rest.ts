// 休憩地（SA/PA）の提案（設計書 §7.2）。ルート検索の結果だけで決め、API は呼ばない。
import type { LegResult, RestArea } from '../types/plan'
import { minutesBetween } from './datetime'

// 出発・立ち寄り先・到着のすぐ近く（この分数以内）の SA/PA は、休んでもすぐ止まるので勧めない
export const NEAR_MINUTES = 15

export type LongStretch = { from: string; to: string; minutes: number }

export type RestAdvice = {
  suggestions: RestArea[] // 休憩を勧める SA/PA（通る順）
  longStretches: LongStretch[] // 休憩間隔を超えて運転が続いてしまうところ
}

export function suggestRests(result: LegResult, intervalMinutes: number): RestAdvice {
  const advice: RestAdvice = { suggestions: [], longStretches: [] }

  // 続けて運転する区切り: 出発 → 立ち寄り先に着く / 立ち寄り先を出る → 次の立ち寄り先 … → 到着
  const stretches: [string, string][] = []
  let start = result.departAt
  for (const visit of result.stopVisits ?? []) {
    stretches.push([start, visit.arriveAt])
    start = visit.departAt
  }
  stretches.push([start, result.arriveAt])

  for (const [from, to] of stretches) {
    let t = from
    while (minutesBetween(t, to) > intervalMinutes) {
      const candidates = result.restAreas.filter(
        (area) => minutesBetween(t, area.passAt) > NEAR_MINUTES && minutesBetween(area.passAt, to) > NEAR_MINUTES,
      )
      const inTime = candidates.filter((area) => minutesBetween(t, area.passAt) <= intervalMinutes)
      const pick = inTime[inTime.length - 1] ?? candidates[0]
      if (!pick) {
        advice.longStretches.push({ from: t, to, minutes: minutesBetween(t, to) })
        break
      }
      if (inTime.length === 0) advice.longStretches.push({ from: t, to: pick.passAt, minutes: minutesBetween(t, pick.passAt) })
      advice.suggestions.push(pick)
      t = pick.passAt
    }
  }
  return advice
}
