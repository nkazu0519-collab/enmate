// API の結果の使い回し（設計書 §6.2）。同じ条件でもう一度呼ぶ代わりに、保存した結果を返す。
import { browserStore } from './storage'

const PREFIX = 'enmate:cache:'

type Entry<T> = { savedAt: number; value: T }

export function readCache<T>(key: string, maxAgeMs: number, now = Date.now(), store: Storage | null = browserStore()): T | null {
  try {
    const raw = store?.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry<T>
    return now - entry.savedAt <= maxAgeMs ? entry.value : null
  } catch {
    return null
  }
}

// 使い回し用のデータをすべて消す（プランは消さない）
export function clearCache(store: Storage): void {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key?.startsWith(PREFIX)) keys.push(key)
  }
  keys.forEach((key) => store.removeItem(key))
}

export function writeCache<T>(key: string, value: T, now = Date.now(), store: Storage | null = browserStore()): void {
  if (!store) return
  const raw = JSON.stringify({ savedAt: now, value } satisfies Entry<T>)
  try {
    store.setItem(PREFIX + key, raw)
  } catch {
    // 保存領域がいっぱいのときは、使い回し用のデータを消してからもう一度だけ試す（プランは消さない）
    try {
      clearCache(store)
      store.setItem(PREFIX + key, raw)
    } catch {
      // 使い回せないだけで、検索の結果はそのまま使える
    }
  }
}
