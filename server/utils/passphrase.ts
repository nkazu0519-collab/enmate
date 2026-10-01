// 合言葉の確認（設計書 §9.2）。ブラウザは合言葉を URL エンコードしてヘッダーで送る（ヘッダーには日本語をそのまま入れられないため）
import { createHash, timingSafeEqual } from 'node:crypto'

export const PASSPHRASE_HEADER = 'x-enmate-passphrase'

// 長さの違いで一致するかが分からないよう、ハッシュにしてから比べる
function same(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(hash(a), hash(b))
}

// expected: 環境変数の合言葉 / given: ヘッダーの値（URL エンコード済み）/ dev: 開発サーバーか
// 合言葉を設定していなければ、開発サーバーでは確かめず、公開したサーバーでは中継を止める（誰でも呼べる状態にしない）
export function passphraseProblem(expected: string | undefined, given: string | undefined, dev: boolean): '' | 'config' | 'passphrase' {
  if (!expected) return dev ? '' : 'config'
  return given !== undefined && same(given, encodeURIComponent(expected)) ? '' : 'passphrase'
}
