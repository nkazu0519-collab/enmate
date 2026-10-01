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
