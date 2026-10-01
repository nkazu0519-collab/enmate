// 一覧のチケットに出す、プランの要約（出発・帰着の時刻、距離と高速料金の合計）。
import type { Plan } from '../types/plan'

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

// 閲覧ページの「詳しいタイムライン」の1行（仕様書 §5.2）
export type TimelineItem = {
  at: string // 日本時間の YYYY-MM-DDTHH:mm:ss
  type: 'depart' | 'stop' | 'arrive' | 'matchEnd'
  name: string
  until?: string // 立ち寄り先を出る時刻
  spotCode?: string
  legLabel?: string
}

// 区間（行き・帰り）の出来事を時刻の順に並べる。帰りは最初に試合終了を入れる
export function legTimelineItems(plan: Plan, legId: string): TimelineItem[] {
  const leg = plan.legs.find((l) => l.id === legId)
  if (!leg?.result) return []
  const items: TimelineItem[] = []
  if (leg.timeRule === 'departAt') items.push({ at: `${plan.matchDate}T${plan.matchEnd}:00`, type: 'matchEnd', name: plan.venue.name })
  items.push({ at: leg.result.departAt, type: 'depart', name: leg.from.name, legLabel: leg.label })
  leg.stops.forEach((stop, i) => {
    const visit = leg.result!.stopVisits?.[i]
    if (visit) items.push({ at: visit.arriveAt, type: 'stop', name: stop.place.name, until: visit.departAt, spotCode: stop.place.spotCode })
  })
  items.push({ at: leg.result.arriveAt, type: 'arrive', name: leg.to.name })
  return items
}
