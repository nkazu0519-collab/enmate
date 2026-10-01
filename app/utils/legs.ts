// 入力した条件から、区間（行き・帰り）を組み立てる。ここでは API を呼ばない。
import type { Leg, LegResult, Place, PlanForm, Stop, StopKind } from '../types/plan'
import { addMinutes, formatMonthDay, toLocalIso } from './datetime'

const TIME_PATTERN = /^\d{2}:\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const MAX_EXIT_MINUTES = 180
// 立ち寄り先の滞在は 0〜720 分・10分刻み（仕様書 §4.5）。数は NAVITIME が受け付ける50地点まで
export const MAX_STOPS = 50
export const MAX_STAY_MINUTES = 720
export const STAY_STEP_MINUTES = 10
// 休憩間隔の選択肢（仕様書 §4.8）
export const REST_INTERVAL_OPTIONS = [90, 120, 150]

export const STOP_KIND_LABELS: Record<StopKind, string> = { sightseeing: '観光', meal: '食事', rest: '休憩', other: 'その他' }
export const STOP_KIND_ICONS: Record<StopKind, string> = { sightseeing: '📷', meal: '🍴', rest: '☕', other: '📍' }
export const DEFAULT_STAY_MINUTES: Record<StopKind, number> = { sightseeing: 90, meal: 60, rest: 30, other: 30 }

// SA/PA の種類のコード（0803005: 高速道路の SA/PA、0804001: サービスエリアの SA/PA）
const SAPA_CODES = ['0803005', '0804001']

export function isSaPaCode(code: string | undefined): boolean {
  return !!code && SAPA_CODES.some((c) => code.startsWith(c))
}

// 場所の種類のコードから、立ち寄り先の種類を決める（仕様書 §4.5: SA/PA は休憩、グルメは食事、観光・文化施設は観光、それ以外はその他）
export function kindFromCategory(code: string | undefined): StopKind {
  if (!code) return 'other'
  if (isSaPaCode(code)) return 'rest'
  if (code.startsWith('03')) return 'meal'
  if (code.startsWith('07') || code.startsWith('0111')) return 'sightseeing'
  return 'other'
}

// 場所から立ち寄り先を作る。SA/PA なら有料道路上の地点にする
export function stopFromPlace(place: Place, kind: StopKind = kindFromCategory(place.categoryCode)): Stop {
  return { place, kind, stayMinutes: DEFAULT_STAY_MINUTES[kind], ...(isSaPaCode(place.categoryCode) ? { tollRoad: true } : {}) }
}

// 試合の終了時刻の初期値。到着予定時刻以前なら、到着の4時間後に仮置きする（日付をまたぐなら 23:30）（仕様書 §4.2）
export function defaultMatchEnd(arriveBy: string, matchEnd: string): string {
  if (!TIME_PATTERN.test(arriveBy) || matchEnd > arriveBy) return matchEnd
  const [h = 0, m = 0] = arriveBy.split(':').map(Number)
  if (h + 4 >= 24) return '23:30'
  return `${String(h + 4).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

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
  for (const [legId, stops] of Object.entries(form.stops)) {
    const label = legId === 'return' ? '帰り' : '行き'
    if (stops.length > MAX_STOPS) errors.push(`${label}の立ち寄り先は、${MAX_STOPS}か所までにしてください`)
    for (const stop of stops) {
      if (!Number.isInteger(stop.stayMinutes) || stop.stayMinutes < 0 || stop.stayMinutes > MAX_STAY_MINUTES) {
        errors.push(`${label}の「${stop.place.name}」の滞在時間は、0〜${MAX_STAY_MINUTES}分で入れてください`)
      }
    }
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
      stops: form.stops.outbound ?? [],
    },
    {
      id: 'return',
      label: '帰り',
      from: form.venue,
      to: form.home,
      timeRule: 'departAt',
      time: addMinutes(toLocalIso(form.matchDate, form.matchEnd), form.exitMinutes),
      stops: form.stops.return ?? [],
    },
  ]
}

// 区間の計算に使う条件を1つの文字列にする。計算結果がどの条件のものかを見分けるのに使う
export function legInputHash(leg: Leg): string {
  const stops = leg.stops.map((s) => `${s.place.lat},${s.place.lon},${s.stayMinutes}${s.tollRoad ? ',toll' : ''}`).join(';')
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
