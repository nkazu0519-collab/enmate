// プランの保存と読み込み（localStorage）。
import type { Plan } from '../types/plan'
import { browserStore } from './storage'

const KEY = 'enmate:plans'
const BROKEN_KEY = 'enmate:plans:broken'

// unavailable: 保存領域が使えない / broken: 保存データを読めなかった（読めなかった元のデータは別の場所に退避する）
export type StoreProblem = '' | 'unavailable' | 'broken'

function isPlace(v: unknown): boolean {
  const p = v as Record<string, unknown> | null
  return !!p && typeof p.name === 'string' && typeof p.lat === 'number' && typeof p.lon === 'number'
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
    Array.isArray(p.legs)
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
  try {
    store.setItem(KEY, JSON.stringify(plans))
    return true
  } catch {
    return false
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

// 一覧の分け方。試合日が今日以降なら「これから」（近い順）、昨日までなら「完了済み」（新しい順）
export function splitForList(plans: Plan[], today: string): { upcoming: Plan[]; done: Plan[] } {
  const upcoming = plans.filter((p) => p.matchDate >= today).sort((a, b) => a.matchDate.localeCompare(b.matchDate))
  const done = plans.filter((p) => p.matchDate < today).sort((a, b) => b.matchDate.localeCompare(a.matchDate))
  return { upcoming, done }
}
