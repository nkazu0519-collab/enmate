// 通る都道府県から探す（仕様書 §4.4・§4.5）。住所は NAVITIME Geocoding、場所は NAVITIME スポット検索で探す。
import type { Place } from '~/types/plan'
import { readCache, writeCache } from '~/utils/apiCache'
import { kindFromCategory } from '~/utils/legs'
import { distanceToRoute, inArea, ROUTE_SIDE_METERS, sampleRoute, searchCenters, type AreaSample, type Prefecture } from '~/utils/routeArea'
import { callApi } from './api'
import { isLodgingCode, searchNearby, searchPlaces, type NearbyKind, type NearbyPlace } from './place'

const CACHE_MS = 90 * 24 * 60 * 60 * 1000 // 住所はめったに変わらないので90日

type Point = [number, number]

// NAVITIME Geocoding の応答の住所（2026-10-01 に確認した項目だけ）
type AddressItem = {
  code?: string
  name?: string // 例: 岡山県岡山市北区
  coord?: { lat: number; lon: number }
  details?: { code?: string; name?: string; level?: string }[] // level 1: 都道府県、2: 市区町村（政令指定都市は区）
}

type Area = Pick<AreaSample, 'prefCode' | 'prefName' | 'cityCode' | 'cityName'>

function areaOf(item: AddressItem | undefined): Area | null {
  const pref = item?.details?.find((d) => d.level === '1')
  const city = item?.details?.find((d) => d.level === '2')
  if (!pref?.code || !pref.name) return null
  return { prefCode: pref.code, prefName: pref.name, cityCode: city?.code ?? pref.code, cityName: city?.name ?? '' }
}

async function reverseGeocode(lat: number, lon: number): Promise<Area | null> {
  const coord = `${lat.toFixed(4)},${lon.toFixed(4)}`
  const key = `reverse:${coord}`
  const cached = readCache<{ area: Area | null }>(key, CACHE_MS)
  if (cached) return cached.area

  const { items } = await callApi<{ items: AddressItem[] }>('geocoding', '/api/address-reverse', { coord })
  const area = areaOf(items[0])
  writeCache(key, { area })
  return area
}

// ルート上の地点（最大8地点）の住所。住所が分からない地点は除く。
// 短い時間に続けて呼びすぎないよう、1地点ずつ順に調べる
export async function routeAreaSamples(shape: Point[]): Promise<AreaSample[]> {
  const result: AreaSample[] = []
  for (const sample of sampleRoute(shape)) {
    const area = await reverseGeocode(sample.lat, sample.lon)
    if (area) result.push({ ...sample, ...area })
  }
  return result
}

export type City = {
  code: string
  name: string // 例: 岡山市北区、和気郡和気町
  fullName: string // 例: 岡山県岡山市北区。住所がこの市区町村のものかを見分けるのに使う
  lat: number // 市区町村の中心
  lon: number
}

// 都道府県の中の市区町村（政令指定都市は区ごと）。100件ずつ受け取る（北海道は2回）
export async function citiesOf(pref: Prefecture): Promise<City[]> {
  const key = `cities:${pref.code}`
  const cached = readCache<City[]>(key, CACHE_MS)
  if (cached) return cached

  const cities: City[] = []
  for (let offset = 0; ; offset += 100) {
    const { items, total } = await callApi<{ items: AddressItem[]; total: number }>('geocoding', '/api/address-children', {
      code: pref.code,
      offset: String(offset),
    })
    for (const item of items) {
      if (!item.code || !item.name || !item.coord) continue
      const name = item.name.startsWith(pref.name) ? item.name.slice(pref.name.length) : item.name
      cities.push({ code: item.code, name, fullName: item.name, lat: item.coord.lat, lon: item.coord.lon })
    }
    if (items.length === 0 || offset + 100 >= total) break
  }
  writeCache(key, cities)
  return cities
}

// その都道府県の中のルート沿い（ルートから10km以内）の場所。ルートから近い順で、distanceMeters はルートからの距離
export async function searchAlongRoute(kind: NearbyKind, shape: Point[], samples: AreaSample[], pref: Prefecture): Promise<NearbyPlace[]> {
  const found: NearbyPlace[] = []
  for (const center of searchCenters(shape, samples, pref.code)) found.push(...(await searchNearby(kind, center, 10000)))

  const seen = new Set<string>()
  const result: NearbyPlace[] = []
  for (const place of found) {
    const id = place.spotCode ?? `${place.lat},${place.lon}`
    if (seen.has(id) || !inArea(place.address, pref.name)) continue
    seen.add(id)
    const distanceMeters = distanceToRoute(place, shape)
    if (distanceMeters <= ROUTE_SIDE_METERS) result.push({ ...place, distanceMeters })
  }
  return result.sort((a, b) => a.distanceMeters! - b.distanceMeters!)
}

// 市区町村の中（中心から10km以内で、住所がその市区町村のもの）の場所。中心から近い順
export async function searchInCity(kind: NearbyKind, city: City): Promise<NearbyPlace[]> {
  return (await searchNearby(kind, city, 10000)).filter((place) => inArea(place.address, city.fullName))
}

// 都道府県全体の人気の場所（仕様書 §4.4・§4.5）。スポット検索の100件から、住所がその都道府県で種類が合うものだけを、人気の順のまま残す
const POPULAR_WORDS: Record<NearbyKind, (prefName: string) => string> = {
  hotel: (name) => `${name} ホテル`,
  sightseeing: (name) => name,
  meal: (name) => `${name} グルメ`,
}

function matchesKind(kind: NearbyKind, place: Place, prefName: string): boolean {
  if (kind === 'hotel') return isLodgingCode(place.categoryCode)
  if (kind === 'sightseeing') return kindFromCategory(place.categoryCode) === 'sightseeing'
  // 名前に都道府県名が入っているだけで出てくるもの（「○○店(京都府)」や組合など）は除く
  return kindFromCategory(place.categoryCode) === 'meal' && !place.name.includes(prefName)
}

export async function searchPopular(kind: NearbyKind, pref: Prefecture): Promise<Place[]> {
  const places = await searchPlaces(POPULAR_WORDS[kind](pref.name), 100)
  return places.filter((place) => inArea(place.address, pref.name) && matchesKind(kind, place, pref.name))
}

// 言葉で探す。都道府県を選んでいれば、言葉の頭に都道府県名を付けて探し、住所がその都道府県のものだけを残す
export async function searchWordIn(word: string, pref: Prefecture | null): Promise<Place[]> {
  if (!pref) return searchPlaces(word)
  return (await searchPlaces(`${pref.name} ${word.trim()}`, 100)).filter((place) => inArea(place.address, pref.name))
}
