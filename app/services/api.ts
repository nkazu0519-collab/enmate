// サーバー側の中継（/api/...）を呼ぶ共通の処理。使用回数の記録と、失敗の種類ごとの文言をまとめる。
import { notifyUsageChanged } from '~/composables/useUsage'
import { recordCall, type ApiName } from '~/utils/usage'

export type ApiErrorKind = 'quota' | 'rateLimit' | 'notSubscribed' | 'config' | 'network' | 'upstream' | 'noRoute' | 'badRequest'

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
  ) {
    super(message)
  }
}

const API_LABELS: Record<ApiName, string> = { route: 'ルート検索（NAVITIME Route(car)）', spot: '場所検索（NAVITIME Spot）' }

function messageFor(api: ApiName, kind: ApiErrorKind): string {
  switch (kind) {
    case 'quota':
      return 'NAVITIME の今月の無料枠を使い切りました。来月になると、また使えます。保存したプランは、今までどおり見られます。'
    case 'rateLimit':
      return '短い時間に続けて呼びすぎました。少し待ってから、もう一度押してください。'
    case 'notSubscribed':
      return `${API_LABELS[api]}が、今の API キーでは使えません。RapidAPI でこの API を購読しているか、キーが正しいかを確かめてください。`
    case 'config':
      return 'API キーが設定されていません。.env に RAPIDAPI_KEY を入れて、開発サーバーを起動し直してください。'
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

export async function callApi<T>(api: ApiName, path: string, query: Record<string, string>): Promise<T> {
  try {
    const res = (await $fetch<unknown>(path, { query })) as T & UsageHeader
    recordCall(api, res)
    notifyUsageChanged()
    return res
  } catch (e) {
    // サーバー側の中継が返した失敗の種類。応答そのものがなければ通信の失敗
    const data = (e as { data?: { data?: Partial<UsageHeader> & { kind?: ApiErrorKind; reached?: boolean } } }).data?.data
    if (data?.reached) {
      recordCall(api, { remaining: data.remaining ?? null, limit: data.limit ?? null })
      notifyUsageChanged()
    }
    const kind = data?.kind ?? 'network'
    throw new ApiError(kind, messageFor(api, kind))
  }
}
