// サーバー側の中継（/api/...）を呼ぶ共通の処理。使用回数の記録と、失敗の種類ごとの文言をまとめる。
import { notifyUsageChanged } from '~/composables/useUsage'
import { PASSPHRASE_HEADER, readPassphrase, savePassphrase } from '~/utils/passphrase'
import { recordCall, type ApiName } from '~/utils/usage'

export type ApiErrorKind = 'quota' | 'rateLimit' | 'notSubscribed' | 'config' | 'network' | 'upstream' | 'noRoute' | 'badRequest' | 'passphrase'

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
  ) {
    super(message)
  }
}

const API_LABELS: Record<ApiName, string> = {
  route: 'ルート検索（NAVITIME Route(car)）',
  spot: '場所検索（NAVITIME Spot）',
  geocoding: '住所の検索（NAVITIME Geocoding）',
}

function messageFor(api: ApiName, kind: ApiErrorKind): string {
  switch (kind) {
    case 'quota':
      return 'NAVITIME の今月の無料枠を使い切りました。来月になると、また使えます。保存したプランは、今までどおり見られます。'
    case 'rateLimit':
      return '短い時間に続けて呼びすぎました。少し待ってから、もう一度押してください。'
    case 'notSubscribed':
      return `${API_LABELS[api]}が、今の API キーでは使えません。RapidAPI でこの API を購読しているか、キーが正しいかを確かめてください。`
    case 'config':
      return 'サーバーの設定が足りません。開発サーバーなら .env に RAPIDAPI_KEY を、公開したサーバーなら環境変数に RAPIDAPI_KEY と ENMATE_PASSPHRASE を入れてください。'
    case 'passphrase':
      return '合言葉が違うため、検索できませんでした。合言葉はサークルのメンバーに確かめてください。保存したプランは、合言葉がなくても見られます。'
    case 'noRoute':
      return 'ルートが見つかりませんでした。出発地か会場を選び直してください。'
    case 'badRequest':
      return '検索の条件が正しくありません。入力を確かめてください。'
    case 'network':
      return '通信に失敗しました。ネットワークを確かめて、もう一度押してください。'
    default:
      return 'NAVITIME がエラーを返しました。時間をおいて、もう一度押してください。'
  }
}

type UsageHeader = { remaining: number | null; limit: number | null }

// 使用回数を記録する。記録できなくても（保存データが壊れているなど）、検索の結果はそのまま使う
function record(api: ApiName, header: UsageHeader) {
  try {
    recordCall(api, header)
  } catch {
    // 数えられないだけ
  }
  notifyUsageChanged()
}

type FailData = Partial<UsageHeader> & { kind?: ApiErrorKind; reached?: boolean }

async function fetchOnce<T>(path: string, query: Record<string, string>, passphrase: string): Promise<{ res: T & UsageHeader } | { fail: FailData }> {
  try {
    // 失敗しても自動ではもう一度呼ばない（$fetch は 429・502 などで1回呼び直し、無料枠を2回使ってしまう）
    const res = (await $fetch<unknown>(path, {
      query,
      retry: 0,
      // ヘッダーには日本語をそのまま入れられないので、URL エンコードして送る
      headers: passphrase ? { [PASSPHRASE_HEADER]: encodeURIComponent(passphrase) } : {},
    })) as T & UsageHeader
    return { res }
  } catch (e) {
    // サーバー側の中継が返した失敗の種類。応答そのものがなければ通信の失敗
    return { fail: (e as { data?: { data?: FailData } }).data?.data ?? {} }
  }
}

export async function callApi<T>(api: ApiName, path: string, query: Record<string, string>): Promise<T> {
  let result = await fetchOnce<T>(path, query, readPassphrase())
  // 合言葉が無いか違えば、1回だけ入れてもらう（合言葉の確認は NAVITIME を呼ぶ前なので、呼び直しても回数は減らない）
  if ('fail' in result && result.fail.kind === 'passphrase') {
    const entered = window.prompt('NAVITIME で検索するには合言葉が必要です。サークルで共有している合言葉を入れてください。')?.trim()
    if (entered) {
      result = await fetchOnce<T>(path, query, entered)
      if ('res' in result) savePassphrase(entered)
    }
  }
  if ('fail' in result) {
    const data = result.fail
    if (data.reached) record(api, { remaining: data.remaining ?? null, limit: data.limit ?? null })
    const kind = data.kind ?? 'network'
    throw new ApiError(kind, messageFor(api, kind))
  }
  record(api, result.res)
  return result.res
}
