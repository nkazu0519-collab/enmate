// ブラウザの保存領域（localStorage）。使えない環境では null を返す
export function browserStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
