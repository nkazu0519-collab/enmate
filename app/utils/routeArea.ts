// 通る都道府県（仕様書 §4.4・§4.5）の計算。ここでは API を呼ばない。
// ルートの形から住所を調べる地点を選び、調べた住所から都道府県を通る順に並べ、ルート沿いを探す中心を決める
import { distanceToSegment } from './shape'

type Point = [number, number] // 緯度, 経度
type LatLon = { lat: number; lon: number }

// 住所を調べる地点の数と間隔（設計書 §3.2: インターン版の最大40地点を、無料枠に収めるため最大8地点にした）
export const MAX_ROUTE_SAMPLES = 8
const MIN_SAMPLE_SPACING_METERS = 15_000
// ルート沿い = ルート上の地点から半径10km以内（仕様書 §4.5）。探す中心は約20kmごと、1つの都道府県で3か所まで
export const ROUTE_SIDE_METERS = 10_000
const CENTER_SPACING_METERS = 20_000
const MAX_CENTERS = 3

const METERS_PER_DEGREE = 111_320

function distanceBetween(a: Point, b: Point): number {
  const scaleX = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180) * METERS_PER_DEGREE
  return Math.hypot((b[1] - a[1]) * scaleX, (b[0] - a[0]) * METERS_PER_DEGREE)
}

// 始点から各点までの道のりの距離（メートル）
function cumulativeDistances(shape: Point[]): number[] {
  const result = [0]
  for (let i = 1; i < shape.length; i++) result.push(result[i - 1]! + distanceBetween(shape[i - 1]!, shape[i]!))
  return result
}

// 始点から along メートル進んだ地点
function pointAt(shape: Point[], cumulative: number[], along: number): LatLon {
  const i = cumulative.findIndex((d) => d >= along)
  if (i <= 0) {
    const p = shape[i === 0 ? 0 : shape.length - 1]!
    return { lat: p[0], lon: p[1] }
  }
  const a = shape[i - 1]!
  const b = shape[i]!
  const span = cumulative[i]! - cumulative[i - 1]!
  const t = span === 0 ? 0 : (along - cumulative[i - 1]!) / span
  return { lat: round(a[0] + (b[0] - a[0]) * t), lon: round(a[1] + (b[1] - a[1]) * t) }
}

function round(value: number): number {
  return Math.round(value * 1e5) / 1e5
}

export type RouteSample = LatLon & { along: number } // along: 始点からの道のりの距離（メートル）

// 住所を調べる地点。始点から終点まで同じ間隔で、15km以上あけて最大8地点（短いルートは中間の1地点）
export function sampleRoute(shape: Point[], maxPoints = MAX_ROUTE_SAMPLES): RouteSample[] {
  if (shape.length === 0) return []
  const cumulative = cumulativeDistances(shape)
  const total = cumulative[cumulative.length - 1]!
  const count = Math.min(maxPoints, Math.floor(total / MIN_SAMPLE_SPACING_METERS) + 1)
  if (count <= 1) return [{ ...pointAt(shape, cumulative, total / 2), along: Math.round(total / 2) }]
  return Array.from({ length: count }, (_, k) => {
    const along = (total * k) / (count - 1)
    return { ...pointAt(shape, cumulative, along), along: Math.round(along) }
  })
}

// 住所を調べた地点
export type AreaSample = RouteSample & { prefCode: string; prefName: string; cityCode: string; cityName: string }

export type Prefecture = { code: string; name: string }

// ルートが通る都道府県を、通る順に（同じ都道府県は最初に通ったところで1回だけ）
export function prefecturesAlong(samples: AreaSample[]): Prefecture[] {
  const result: Prefecture[] = []
  for (const s of samples) {
    if (!result.some((p) => p.code === s.prefCode)) result.push({ code: s.prefCode, name: s.prefName })
  }
  return result
}

// ルートが通る市区町村のコード
export function citiesAlong(samples: AreaSample[]): Set<string> {
  return new Set(samples.map((s) => s.cityCode))
}

// その都道府県の中のルート沿いを探す中心。都道府県の中だった地点の前後（となりの地点との中間まで）を、
// その都道府県を走る範囲とみなし、約20kmごとに最大3か所置く
export function searchCenters(shape: Point[], samples: AreaSample[], prefCode: string): LatLon[] {
  if (shape.length === 0) return []
  const cumulative = cumulativeDistances(shape)
  const total = cumulative[cumulative.length - 1]!
  let from = Infinity
  let to = -Infinity
  samples.forEach((s, i) => {
    if (s.prefCode !== prefCode) return
    const prev = samples[i - 1]
    const next = samples[i + 1]
    from = Math.min(from, prev ? (prev.along + s.along) / 2 : 0)
    to = Math.max(to, next ? (s.along + next.along) / 2 : total)
  })
  if (from > to) return []
  const length = to - from
  const count = Math.max(1, Math.min(MAX_CENTERS, Math.ceil(length / CENTER_SPACING_METERS)))
  return Array.from({ length: count }, (_, k) => pointAt(shape, cumulative, from + ((k + 0.5) * length) / count))
}

// 場所からルートまでのいちばん近い距離（メートル）
export function distanceToRoute(place: LatLon, shape: Point[]): number {
  const p: Point = [place.lat, place.lon]
  if (shape.length === 1) return Math.round(distanceBetween(p, shape[0]!))
  let min = Infinity
  for (let i = 1; i < shape.length; i++) min = Math.min(min, distanceToSegment(p, shape[i - 1]!, shape[i]!))
  return Math.round(min)
}

// 住所がその地域（都道府県・市区町村）のものか。areaName は「岡山県」「岡山県岡山市北区」のように都道府県名から書いたもの
export function inArea(address: string | undefined, areaName: string): boolean {
  return !!address && address.startsWith(areaName)
}

// 都道府県（JIS のコード順）と、「そのほかの都道府県」で分ける地方（仕様書 §4.4）
export const REGIONS: { name: string; prefectures: Prefecture[] }[] = (
  [
    ['北海道・東北', ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']],
    ['関東', ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県']],
    ['中部', ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県']],
    ['近畿', ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県']],
    ['中国', ['鳥取県', '島根県', '岡山県', '広島県', '山口県']],
    ['四国', ['徳島県', '香川県', '愛媛県', '高知県']],
    ['九州・沖縄', ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']],
  ] as const
).reduce<{ name: string; prefectures: Prefecture[] }[]>((regions, [name, names]) => {
  const start = regions.reduce((n, r) => n + r.prefectures.length, 0)
  regions.push({ name, prefectures: names.map((p, i) => ({ code: String(start + i + 1).padStart(2, '0'), name: p })) })
  return regions
}, [])
