// NAVITIME の今月の使用回数の目安（設計書 §6.3）。
// RapidAPI が応答ヘッダーで返す残り回数を優先し、なければこのブラウザで数えた回数を使う。
import { browserStore } from './storage'

export type ApiName = 'route' | 'spot' | 'geocoding'

type UsageRecord = { month: string; counted: number; remaining: number | null; limit: number | null }

export type Usage = { used: number; limit: number | null; nearLimit: boolean }

const KEY = 'enmate:usage'
// 応答ヘッダーをまだ受け取っていないときの上限。ルート検索は 500 と確認済み（2026-10-01）
const KNOWN_LIMITS: Record<ApiName, number | null> = { route: 500, spot: null, geocoding: null }
const WARN_RATIO = 0.8

function monthOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function readAll(store: Storage | null): Partial<Record<ApiName, UsageRecord>> {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(KEY) ?? '{}')
    // 壊れていて（文字列・数・配列など）書き足せない形なら、なかったものとして数え直す
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function recordCall(
  api: ApiName,
  header: { remaining: number | null; limit: number | null },
  now = new Date(),
  store: Storage | null = browserStore(),
): void {
  const all = readAll(store)
  const month = monthOf(now)
  const previous = all[api]
  all[api] = {
    month,
    counted: (previous?.month === month ? previous.counted : 0) + 1,
    remaining: header.remaining,
    limit: header.limit ?? previous?.limit ?? null,
  }
  try {
    store?.setItem(KEY, JSON.stringify(all))
  } catch {
    // 数えられなくても、検索そのものは続ける
  }
}

export function readUsage(api: ApiName, now = new Date(), store: Storage | null = browserStore()): Usage {
  const record = readAll(store)[api]
  const limit = record?.limit ?? KNOWN_LIMITS[api]
  let used = 0
  if (record?.month === monthOf(now)) {
    used = record.remaining !== null && limit !== null ? limit - record.remaining : record.counted
  }
  return { used, limit, nearLimit: limit !== null && used >= limit * WARN_RATIO }
}
