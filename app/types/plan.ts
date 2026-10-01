// プランのデータの形（設計書 §8）。

export type Place = {
  name: string
  lat: number
  lon: number
  spotCode?: string // NAVITIME のスポットのコード
  address?: string
  category?: string // 例: 駅、スタジアム。検索結果で同じ名前の場所を見分けるのに使う
  categoryCode?: string // NAVITIME の種類のコード（例: 0302001 = ファミレス）。立ち寄り先の種類を決めるのに使う
}

export type StopKind = 'sightseeing' | 'meal' | 'rest' | 'other'

export type Stop = {
  place: Place
  kind: StopKind
  stayMinutes: number
  // SA/PA のように有料道路（高速道路）の上にある地点。ルート検索で「有料道路上の地点」として渡す。
  // 付けないと近くの一般道に寄せられ、高速を降りて寄ってから乗り直すルートになる（設計書 §7.2）
  tollRoad?: boolean
}

export type Hotel = Place & {
  rakutenHotelNo?: number // 楽天トラベルの施設番号
  reserveUrl?: string
}

export type RestArea = {
  name: string
  kind: 'SA' | 'PA'
  lat: number
  lon: number
  passAt: string // その SA/PA を通る時刻
}

// 立ち寄り先に着く時刻と、そこを出る時刻（区間の stops と同じ順）
export type StopVisit = {
  arriveAt: string
  departAt: string
}

// 時刻はすべて日本時間の YYYY-MM-DDTHH:mm:ss で持つ（calculatedAt・createdAt・updatedAt だけは記録した瞬間の UTC）。
export type LegResult = {
  departAt: string
  arriveAt: string
  driveMinutes: number
  distanceMeters: number
  tollYen: number
  trafficConsidered: boolean // 渋滞予測込みか
  restAreas: RestArea[]
  stopVisits?: StopVisit[] // 段階1で保存したプランには無い
  shape: [number, number][] // 間引いたルートの形（緯度, 経度）。地図用
  calculatedAt: string
  inputHash: string // 計算したときの条件。今の条件と違えば「未計算」
}

export type Leg = {
  id: string
  label: string // 例: 行き、帰り
  from: Place
  to: Place
  timeRule: 'arriveBy' | 'departAt' // 着く時刻から逆算か、出る時刻からか
  time: string
  stops: Stop[]
  result?: LegResult
}

export type Plan = {
  id: string
  name: string
  home: Place
  venue: Place
  matchDate: string // YYYY-MM-DD
  arriveBy: string // HH:mm
  matchEnd: string // HH:mm
  exitMinutes: number
  restIntervalMinutes: number
  hotelsBefore: Hotel[] // 前泊（試合日に近い順）
  hotelsAfter: Hotel[] // 後泊
  legs: Leg[]
  createdAt: string
  updatedAt: string
  schemaVersion: 1 // 書き出したファイルを読み込むときの形の確認用
}

// 作成・編集ページで入力する項目
export type PlanForm = {
  name: string
  home: Place | null
  venue: Place | null
  matchDate: string
  arriveBy: string
  matchEnd: string
  exitMinutes: number
  stops: Record<string, Stop[]> // 区間の ID ごとの立ち寄り先
  restIntervalMinutes: number
}
