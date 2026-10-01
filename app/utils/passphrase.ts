// 中継を呼ぶときの合言葉（設計書 §9.2）。一度合った合言葉はブラウザに保存し、次からは聞かない
import { browserStore } from './storage'

const KEY = 'enmate:passphrase'
// サーバー側（server/utils/passphrase.ts）と同じ名前
export const PASSPHRASE_HEADER = 'x-enmate-passphrase'

export function readPassphrase(store: Storage | null = browserStore()): string {
  try {
    return store?.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function savePassphrase(passphrase: string, store: Storage | null = browserStore()): void {
  try {
    store?.setItem(KEY, passphrase)
  } catch {
    // 保存できなければ、次に検索するときにもう一度聞くだけ
  }
}
