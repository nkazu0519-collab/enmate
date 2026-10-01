// プランの保存と読み込み（localStorage）。
import type { Plan } from '../types/plan'
import { clearCache } from './apiCache'
import { addDays, datePart } from './datetime'
import { browserStore } from './storage'

const KEY = 'enmate:plans'
const BROKEN_KEY = 'enmate:plans:broken'

// unavailable: 保存領域が使えない / broken: 保存データを読めなかった（読めなかった元のデータは別の場所に退避する）
export type StoreProblem = '' | 'unavailable' | 'broken'

function isPlace(v: unknown): boolean {
  const p = v as Record<string, unknown> | null
  return !!p && typeof p.name === 'string' && typeof p.lat === 'number' && typeof p.lon === 'number'
}

// 区間の、画面で使う項目。計算結果は無くてもよいが、あるなら時刻と線の形がそろっていること
function isLeg(v: unknown): boolean {
  const l = v as Record<string, unknown> | null
  if (!l || typeof l.id !== 'string' || typeof l.label !== 'string' || !isPlace(l.from) || !isPlace(l.to) || !Array.isArray(l.stops)) return false
  if (!l.stops.every((s) => isPlace((s as Record<string, unknown> | null)?.place))) return false
  const r = l.result as Record<string, unknown> | undefined
  return r === undefined || (typeof r.departAt === 'string' && typeof r.arriveAt === 'string' && Array.isArray(r.shape) && Array.isArray(r.restAreas))
}

export function isPlan(v: unknown): v is Plan {
  const p = v as Record<string, unknown> | null
  return (
    !!p &&
    p.schemaVersion === 1 &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.matchDate === 'string' &&
    isPlace(p.home) &&
    isPlace(p.venue) &&
    Array.isArray(p.hotelsBefore) &&
    p.hotelsBefore.every(isPlace) &&
    Array.isArray(p.hotelsAfter) &&
    p.hotelsAfter.every(isPlace) &&
    Array.isArray(p.legs) &&
    p.legs.every(isLeg)
  )
}

export function loadPlans(store: Storage | null = browserStore()): { plans: Plan[]; problem: StoreProblem } {
  if (!store) return { plans: [], problem: 'unavailable' }
  let raw: string | null
  try {
    raw = store.getItem(KEY)
  } catch {
    return { plans: [], problem: 'unavailable' }
  }
  if (raw === null) return { plans: [], problem: '' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const entries = Array.isArray(parsed) ? parsed : []
  const plans = entries.filter(isPlan)
  if (!Array.isArray(parsed) || plans.length !== entries.length) {
    // このあとの保存で上書きされても元のデータを失わないよう、退避しておく
    try {
      store.setItem(BROKEN_KEY, raw)
    } catch {
      // 退避できなくても、読めた分の表示は続ける
    }
    return { plans, problem: 'broken' }
  }
  return { plans, problem: '' }
}

function writePlans(plans: Plan[], store: Storage | null): boolean {
  if (!store) return false
  const raw = JSON.stringify(plans)
  try {
    store.setItem(KEY, raw)
    return true
  } catch {
    // 保存領域がいっぱいなら、API の結果の使い回し用のデータ（消しても検索し直せる）を消して、もう一度だけ試す
    try {
      clearCache(store)
      store.setItem(KEY, raw)
      return true
    } catch {
      return false
    }
  }
}

// 同じ ID があれば置き換え、なければ追加する。保存できなかったら false
export function savePlan(plan: Plan, store: Storage | null = browserStore()): boolean {
  const { plans } = loadPlans(store)
  const index = plans.findIndex((p) => p.id === plan.id)
  if (index === -1) plans.push(plan)
  else plans[index] = plan
  return writePlans(plans, store)
}

export function deletePlan(id: string, store: Storage | null = browserStore()): boolean {
  const { plans } = loadPlans(store)
  return writePlans(plans.filter((p) => p.id !== id), store)
}

export function findPlan(id: string, store: Storage | null = browserStore()): Plan | undefined {
  return loadPlans(store).plans.find((p) => p.id === id)
}

// 遠征が終わる日。最後の区間の到着日（夜中に家へ着けば、その日）。計算していなければ、試合日に後泊の泊数を足した日
export function tripEndDate(plan: Plan): string {
  const arriveAt = plan.legs[plan.legs.length - 1]?.result?.arriveAt
  return arriveAt ? datePart(arriveAt) : addDays(plan.matchDate, plan.hotelsAfter.length)
}

// 一覧の分け方。すべての区間が終わる日が今日以降なら「これから」（試合日の近い順）、昨日までなら「完了済み」（試合日の新しい順）
export function splitForList(plans: Plan[], today: string): { upcoming: Plan[]; done: Plan[] } {
  const upcoming = plans.filter((p) => tripEndDate(p) >= today).sort((a, b) => a.matchDate.localeCompare(b.matchDate))
  const done = plans.filter((p) => tripEndDate(p) < today).sort((a, b) => b.matchDate.localeCompare(a.matchDate))
  return { upcoming, done }
}
