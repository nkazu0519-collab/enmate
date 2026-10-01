// 入力した条件から、区間（行き・帰り）を組み立てる。ここでは API を呼ばない。
import type { Leg, LegResult, Place, PlanForm } from '../types/plan'
import { addMinutes, formatMonthDay, toLocalIso } from './datetime'

const TIME_PATTERN = /^\d{2}:\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const MAX_EXIT_MINUTES = 180

function samePlace(a: Place, b: Place): boolean {
  if (a.spotCode && b.spotCode) return a.spotCode === b.spotCode
  return a.lat.toFixed(5) === b.lat.toFixed(5) && a.lon.toFixed(5) === b.lon.toFixed(5)
}

// 計算の前の入力チェック。問題がなければ空の配列を返す
export function validateForm(form: PlanForm): string[] {
  const errors: string[] = []
  if (!form.home) errors.push('出発地を検索して選んでください')
  if (!form.venue) errors.push('会場を検索して選んでください')
  if (!DATE_PATTERN.test(form.matchDate)) errors.push('試合日を入れてください')
  if (!TIME_PATTERN.test(form.arriveBy)) errors.push('会場に着きたい時刻を入れてください')
  if (!TIME_PATTERN.test(form.matchEnd)) errors.push('試合の終了時刻を入れてください')
  if (!Number.isInteger(form.exitMinutes) || form.exitMinutes < 0 || form.exitMinutes > MAX_EXIT_MINUTES) {
    errors.push(`会場を出るまでの時間は、0〜${MAX_EXIT_MINUTES}分で入れてください`)
  }
  if (form.home && form.venue && samePlace(form.home, form.venue)) {
    errors.push('出発地と会場が同じ場所です。どちらかを選び直してください')
  }
  if (TIME_PATTERN.test(form.arriveBy) && TIME_PATTERN.test(form.matchEnd) && form.matchEnd <= form.arriveBy) {
    errors.push('試合の終了時刻は、会場に着きたい時刻より後にしてください')
  }
  return errors
}

// 日帰りの2区間。入力チェックを通った条件で呼ぶ
export function buildLegs(form: PlanForm): Leg[] {
  if (!form.home || !form.venue) return []
  return [
    {
      id: 'outbound',
      label: '行き',
      from: form.home,
      to: form.venue,
      timeRule: 'arriveBy',
      time: toLocalIso(form.matchDate, form.arriveBy),
      stops: [],
    },
    {
      id: 'return',
      label: '帰り',
      from: form.venue,
      to: form.home,
      timeRule: 'departAt',
      time: addMinutes(toLocalIso(form.matchDate, form.matchEnd), form.exitMinutes),
      stops: [],
    },
  ]
}

// 区間の計算に使う条件を1つの文字列にする。計算結果がどの条件のものかを見分けるのに使う
export function legInputHash(leg: Leg): string {
  const stops = leg.stops.map((s) => `${s.place.lat},${s.place.lon},${s.stayMinutes}`).join(';')
  return [`${leg.from.lat},${leg.from.lon}`, `${leg.to.lat},${leg.to.lon}`, leg.timeRule, leg.time, stops].join('|')
}

// calculated: 今の条件で計算済み / stale: 前の条件での結果しかない / none: まだ計算していない
export type LegStatus = 'calculated' | 'stale' | 'none'

export function legStatus(leg: Leg, result: LegResult | undefined): LegStatus {
  if (!result) return 'none'
  return result.inputHash === legInputHash(leg) ? 'calculated' : 'stale'
}

// プラン名を空のまま保存したときの名前
export function defaultPlanName(venueName: string, matchDate: string): string {
  return `${venueName} 遠征 ${formatMonthDay(matchDate)}`
}
