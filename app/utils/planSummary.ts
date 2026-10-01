// 一覧のチケットに出す、プランの要約（出発・帰着の時刻、距離と高速料金の合計）。
import type { Plan } from '../types/plan'
import { daysBetween } from './datetime'
import { sideOf } from './legs'

// チケットの半券に出すもの。試合日の前は「あと○日」、当日は「今日」、試合日を過ぎて帰り着くまで（後泊の翌日、
// 夜中に帰り着いた日）は「遠征中」（2026-10-01 本人が決定）
export type Countdown = { kind: 'days'; days: number } | { kind: 'today' } | { kind: 'during' }

export function countdownOf(today: string, matchDate: string): Countdown {
  const days = daysBetween(today, matchDate)
  if (days > 0) return { kind: 'days', days }
  return days === 0 ? { kind: 'today' } : { kind: 'during' }
}

// 家を出る時刻（最初の区間の出発）と、家に帰り着く時刻（最後の区間の到着）。計算していなければ undefined
export function homeTimes(plan: Plan): { departAt?: string; homeAt?: string } {
  return {
    departAt: plan.legs[0]?.result?.departAt,
    homeAt: plan.legs[plan.legs.length - 1]?.result?.arriveAt,
  }
}

// プランの全区間の距離と高速料金を足す。計算していない区間は数えない
export function planTotals(plan: Plan): { distanceMeters: number; tollYen: number } {
  let distanceMeters = 0
  let tollYen = 0
  for (const leg of plan.legs) {
    distanceMeters += leg.result?.distanceMeters ?? 0
    tollYen += leg.result?.tollYen ?? 0
  }
  return { distanceMeters, tollYen }
}

// 完了済みの遠征の合計
export function collectionTotals(plans: Plan[]): { count: number; distanceMeters: number; tollYen: number } {
  const totals = { count: plans.length, distanceMeters: 0, tollYen: 0 }
  for (const plan of plans) {
    const t = planTotals(plan)
    totals.distanceMeters += t.distanceMeters
    totals.tollYen += t.tollYen
  }
  return totals
}

// 試合日の年ごとに分ける。並び順はそのまま保つ
export function groupByYear(plans: Plan[]): { year: string; plans: Plan[] }[] {
  const groups: { year: string; plans: Plan[] }[] = []
  for (const plan of plans) {
    const year = plan.matchDate.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last?.year === year) last.plans.push(plan)
    else groups.push({ year, plans: [plan] })
  }
  return groups
}

// 宿泊の表記（仕様書 §4.4）: 日帰り／前泊／後泊／前泊・後泊
export function stayLabel(plan: Pick<Plan, 'hotelsBefore' | 'hotelsAfter'>): string {
  const before = plan.hotelsBefore.length > 0
  const after = plan.hotelsAfter.length > 0
  if (before && after) return '前泊・後泊'
  if (before) return '前泊'
  if (after) return '後泊'
  return '日帰り'
}

// 閲覧ページの「詳しいタイムライン」の1行（仕様書 §5.2）
export type TimelineItem = {
  at: string // 日本時間の YYYY-MM-DDTHH:mm:ss
  type: 'depart' | 'stop' | 'arrive' | 'matchEnd'
  name: string
  until?: string // 立ち寄り先を出る時刻
  spotCode?: string
  legLabel?: string
  hotel?: boolean // 宿泊先に着くところ
}

// 行き（会場に着くまで）か帰り（会場を出てから）の区間の出来事を、走る順に並べる。帰りは最初に試合終了を入れる
export function timelineItems(plan: Plan, side: 'outbound' | 'return'): TimelineItem[] {
  const legs = plan.legs.filter((leg) => sideOf(leg.id) === side && leg.result)
  if (legs.length === 0) return []
  const items: TimelineItem[] = []
  if (side === 'return') items.push({ at: `${plan.matchDate}T${plan.matchEnd}:00`, type: 'matchEnd', name: plan.venue.name })
  for (const leg of legs) {
    const result = leg.result!
    items.push({ at: result.departAt, type: 'depart', name: leg.from.name, legLabel: leg.label })
    leg.stops.forEach((stop, i) => {
      const visit = result.stopVisits?.[i]
      if (visit) items.push({ at: visit.arriveAt, type: 'stop', name: stop.place.name, until: visit.departAt, spotCode: stop.place.spotCode })
    })
    // 自宅にも会場にも着かない区間は、宿泊先に着く区間
    const toHotel = leg.id === 'before' || (leg.id === 'return' && plan.hotelsAfter.length > 0)
    items.push({ at: result.arriveAt, type: 'arrive', name: leg.to.name, ...(toHotel ? { hotel: true, spotCode: leg.to.spotCode } : {}) })
  }
  return items
}
