// 入力した条件から、区間（行き・帰り）を組み立てる。ここでは API を呼ばない。
import type { Leg, LegResult, Place, PlanForm, Stop, StopKind } from '../types/plan'
import { addDays, addMinutes, datePart, formatMonthDay, timePart, toLocalIso } from './datetime'

const TIME_PATTERN = /^\d{2}:\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const MAX_EXIT_MINUTES = 180
// 立ち寄り先の滞在は 0〜720 分・10分刻み（仕様書 §4.5）。数は NAVITIME が受け付ける50地点まで
export const MAX_STOPS = 50
export const MAX_STAY_MINUTES = 720
export const STAY_STEP_MINUTES = 10
// 休憩間隔の選択肢（仕様書 §4.8）
export const REST_INTERVAL_OPTIONS = [90, 120, 150]
// 前日に宿泊先へ着く時刻・翌日に宿泊先を出る時刻の初期値（仕様書 §4.2）
export const DEFAULT_HOTEL_ARRIVE_BY = '18:00'
export const DEFAULT_HOTEL_DEPART_AT = '10:00'

// 区間の ID（走る順）。before: 前日に宿泊先へ / outbound: 会場に着く区間 / return: 試合後に会場を出る区間 / after: 翌日の帰り
export type LegId = 'before' | 'outbound' | 'return' | 'after'
const LEG_ORDER: LegId[] = ['before', 'outbound', 'return', 'after']

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

// 試合後に泊まる宿泊先。前日と同じ宿泊先に泊まるときは前日の宿泊先
export function hotelAfterOf(form: PlanForm): Place | null {
  if (!form.stayAfter) return null
  return form.stayBefore && form.sameHotel ? form.hotelBefore : form.hotelAfter
}

// 区間の名前（仕様書 §4.3）
export function legLabelOf(form: PlanForm, id: LegId): string {
  if (id === 'before') return '前日に宿泊先へ'
  if (id === 'outbound') return form.stayBefore ? '当日の行き' : '行き'
  if (id === 'return') return form.stayAfter ? '試合後に宿泊先へ' : '帰り'
  return '翌日の帰り'
}

// 今の条件で使う区間の ID（走る順）
export function legIdsOf(form: PlanForm): LegId[] {
  return LEG_ORDER.filter((id) => (id !== 'before' || form.stayBefore) && (id !== 'after' || form.stayAfter))
}

// 行きの区間（会場に着くまで）か、帰りの区間（会場を出てから）か
export function sideOf(id: string): 'outbound' | 'return' {
  return id === 'before' || id === 'outbound' ? 'outbound' : 'return'
}

// 行き・帰りの両方に関わる条件の誤り
function commonErrors(form: PlanForm): string[] {
  const errors: string[] = []
  if (!form.home) errors.push('出発地を検索して選んでください')
  if (!form.venue) errors.push('会場を検索して選んでください')
  if (!DATE_PATTERN.test(form.matchDate)) errors.push('試合日を入れてください')
  if (form.home && form.venue && samePlace(form.home, form.venue)) {
    errors.push('出発地と会場が同じ場所です。どちらかを選び直してください')
  }
  return errors
}

// 行きだけに関わる条件の誤り（仕様書 §4.7。帰りが途中でも、行きだけは計算・確定できる）
function outboundErrors(form: PlanForm): string[] {
  const errors: string[] = []
  if (!TIME_PATTERN.test(form.arriveBy)) errors.push('会場に着きたい時刻を入れてください')
  if (form.stayBefore) {
    if (!form.hotelBefore) errors.push('前日の宿泊先を「宿泊先を選ぶ」から選んでください')
    if (!TIME_PATTERN.test(form.hotelBeforeArriveBy)) errors.push('前日に宿泊先へ着く時刻を入れてください')
  }
  return errors
}

// 帰りだけに関わる条件の誤り
function returnErrors(form: PlanForm): string[] {
  const errors: string[] = []
  if (!TIME_PATTERN.test(form.matchEnd)) errors.push('試合の終了時刻を入れてください')
  if (!Number.isInteger(form.exitMinutes) || form.exitMinutes < 0 || form.exitMinutes > MAX_EXIT_MINUTES) {
    errors.push(`会場を出るまでの時間は、0〜${MAX_EXIT_MINUTES}分で入れてください`)
  }
  if (TIME_PATTERN.test(form.arriveBy) && TIME_PATTERN.test(form.matchEnd) && form.matchEnd <= form.arriveBy) {
    errors.push('試合の終了時刻は、会場に着きたい時刻より後にしてください')
  }
  if (form.stayAfter) {
    if (!hotelAfterOf(form)) {
      errors.push(
        form.stayBefore && form.sameHotel ? '前日の宿泊先を選ぶと、試合後も同じ宿泊先に泊まります' : '試合後の宿泊先を「宿泊先を選ぶ」から選んでください',
      )
    }
    if (!TIME_PATTERN.test(form.hotelAfterDepartAt)) errors.push('翌日に宿泊先を出る時刻を入れてください')
  }
  return errors
}

// 条件の誤り（立ち寄り先を除く）。side を渡すと、その側に関わるものだけ
export function conditionErrors(form: PlanForm, side?: 'outbound' | 'return'): string[] {
  return [
    ...commonErrors(form),
    ...(side !== 'return' ? outboundErrors(form) : []),
    ...(side !== 'outbound' ? returnErrors(form) : []),
  ]
}

// 区間の立ち寄り先の誤り
export function stopErrors(form: PlanForm, legId: LegId): string[] {
  const stops = form.stops[legId] ?? []
  const label = legLabelOf(form, legId)
  const errors: string[] = []
  if (stops.length > MAX_STOPS) errors.push(`${label}の立ち寄り先は、${MAX_STOPS}か所までにしてください`)
  for (const stop of stops) {
    if (!Number.isInteger(stop.stayMinutes) || stop.stayMinutes < 0 || stop.stayMinutes > MAX_STAY_MINUTES) {
      errors.push(`${label}の「${stop.place.name}」の滞在時間は、0〜${MAX_STAY_MINUTES}分で入れてください`)
    }
  }
  return errors
}

// 計算の前の入力チェック。問題がなければ空の配列を返す
export function validateForm(form: PlanForm): string[] {
  return [...conditionErrors(form), ...legIdsOf(form).flatMap((id) => stopErrors(form, id))]
}

// 区間を組み立てる（仕様書 §4.3）。行きと帰りは別々に確かめ、条件がそろっている側の区間だけを返す。
// 立ち寄り先の誤りは区間ごとに確かめるので、ここでは見ない
export function buildLegs(form: PlanForm): Leg[] {
  const { home, venue } = form
  if (!home || !venue || commonErrors(form).length > 0) return []
  const hotelBefore = form.stayBefore ? form.hotelBefore : null
  const hotelAfter = hotelAfterOf(form)
  const leg = (id: LegId, from: Place, to: Place, timeRule: Leg['timeRule'], time: string): Leg => ({
    id,
    label: legLabelOf(form, id),
    from,
    to,
    timeRule,
    time,
    stops: form.stops[id] ?? [],
  })

  const legs: Leg[] = []
  if (outboundErrors(form).length === 0) {
    if (hotelBefore) {
      legs.push(leg('before', home, hotelBefore, 'arriveBy', toLocalIso(addDays(form.matchDate, -1), form.hotelBeforeArriveBy)))
    }
    legs.push(leg('outbound', hotelBefore ?? home, venue, 'arriveBy', toLocalIso(form.matchDate, form.arriveBy)))
  }
  if (returnErrors(form).length === 0) {
    legs.push(leg('return', venue, hotelAfter ?? home, 'departAt', addMinutes(toLocalIso(form.matchDate, form.matchEnd), form.exitMinutes)))
    if (hotelAfter) {
      legs.push(leg('after', hotelAfter, home, 'departAt', toLocalIso(addDays(form.matchDate, 1), form.hotelAfterDepartAt)))
    }
  }
  return legs
}

// 宿泊をやめるとき、なくなる区間の立ち寄り先を、残る区間へ走る順につなげて移す（仕様書 §4.4）
export function stopsAfterDroppingStay(stops: Record<string, Stop[]>, side: 'before' | 'after'): Record<string, Stop[]> {
  if (side === 'before') return { ...stops, outbound: [...(stops.before ?? []), ...(stops.outbound ?? [])], before: [] }
  return { ...stops, return: [...(stops.return ?? []), ...(stops.after ?? [])], after: [] }
}

// 立ち寄り先のおすすめを探す場所と、入れる位置の初期値（仕様書 §4.5 の表）。宿泊先が決まっていなければ center は null
export function stopSearchOf(form: PlanForm, legId: LegId): { center: Place | null; position: 'first' | 'last' } {
  if (legId === 'before') return { center: form.hotelBefore, position: 'last' }
  if (legId === 'outbound') return { center: form.venue, position: 'last' }
  if (legId === 'return') return { center: form.venue, position: 'first' }
  return { center: hotelAfterOf(form), position: 'first' }
}

// 宿泊先を選ぶ画面で、通る都道府県を調べるルート（仕様書 §4.4）。前泊は自宅→会場、後泊は会場→自宅。
// 立ち寄り先は入れない。宿泊する前のおおまかなプランと同じ条件になるので、そのときの検索結果を使い回せる
export function stayRouteLeg(form: PlanForm, side: 'before' | 'after'): Leg | null {
  const { home, venue } = form
  if (!home || !venue) return null
  if (side === 'before') {
    if (!DATE_PATTERN.test(form.matchDate) || !TIME_PATTERN.test(form.arriveBy)) return null
    return { id: 'stayRoute', label: '', from: home, to: venue, timeRule: 'arriveBy', time: toLocalIso(form.matchDate, form.arriveBy), stops: [] }
  }
  if (returnErrors({ ...form, stayAfter: false }).length > 0 || !DATE_PATTERN.test(form.matchDate)) return null
  const time = addMinutes(toLocalIso(form.matchDate, form.matchEnd), form.exitMinutes)
  return { id: 'stayRoute', label: '', from: venue, to: home, timeRule: 'departAt', time, stops: [] }
}

// 同じ出発地・到着地の計算結果があれば、そのルートの形を使う（時刻や立ち寄り先が違っても、通る都道府県を調べるには足りる）
export function shapeBetween(results: LegResult[], from: Place, to: Place): [number, number][] | null {
  const prefix = `${from.lat},${from.lon}|${to.lat},${to.lon}|`
  return results.find((r) => r.inputHash.startsWith(prefix))?.shape ?? null
}

// 寄る順番の最適化（仕様書にない追加）。NAVITIME の最適順は、経由地10か所・滞在の合計300分まで
export const MAX_OPTIMAL_STOPS = 10
export const MAX_OPTIMAL_STAY_MINUTES = 300

// 「寄る順番を最適にする」を押せない理由。押せるときは空
export function optimizeBlocker(stops: Stop[]): string {
  if (stops.length < 2) return '立ち寄り先が2か所以上あると使えます'
  if (stops.length > MAX_OPTIMAL_STOPS) return `立ち寄り先が${MAX_OPTIMAL_STOPS}か所までのときに使えます`
  const stay = stops.reduce((sum, s) => sum + s.stayMinutes, 0)
  if (stay > MAX_OPTIMAL_STAY_MINUTES) return `滞在時間の合計が${MAX_OPTIMAL_STAY_MINUTES}分までのときに使えます（今は${stay}分）`
  return ''
}

// 最適順の応答に入っていた経由地の座標（寄る順）を、元の立ち寄り先に対応づけて並べ替える。
// 応答には渡した座標がそのまま入る（2026-10-01 確認）。対応づけられなければ null
export function reorderStops(stops: Stop[], visited: { lat: number; lon: number }[]): Stop[] | null {
  if (visited.length !== stops.length) return null
  const rest = [...stops]
  const ordered: Stop[] = []
  for (const point of visited) {
    const index = rest.findIndex((s) => Math.abs(s.place.lat - point.lat) < 1e-5 && Math.abs(s.place.lon - point.lon) < 1e-5)
    if (index < 0) return null
    ordered.push(rest.splice(index, 1)[0]!)
  }
  return ordered
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

// 続けて走る区間の時刻の前後。前の区間で着く時刻が、次の区間で出る時刻より後なら誤り
// （例: 試合後に宿へ着くのが翌 00:45 なのに、翌日に宿を出る時刻が 00:00）。計算し終わった区間どうしだけを比べる
export function orderErrors(legs: Leg[], results: Record<string, LegResult | undefined>): string[] {
  const errors: string[] = []
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1]!
    const next = legs[i]!
    const arrive = results[prev.id]
    const depart = results[next.id]
    if (!arrive || !depart || legStatus(prev, arrive) !== 'calculated' || legStatus(next, depart) !== 'calculated') continue
    if (arrive.arriveAt > depart.departAt) {
      const at = (iso: string) => `${formatMonthDay(datePart(iso))} ${timePart(iso)}`
      errors.push(
        `「${prev.label}」で${prev.to.name}に着くのが ${at(arrive.arriveAt)} で、「${next.label}」で出る ${at(depart.departAt)} より後です。時刻を見直してください`,
      )
    }
  }
  return errors
}

// プラン名を空のまま保存したときの名前
export function defaultPlanName(venueName: string, matchDate: string): string {
  return `${venueName} 遠征 ${formatMonthDay(matchDate)}`
}
