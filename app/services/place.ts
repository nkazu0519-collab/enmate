// 場所を名前で探す。今の中身は NAVITIME スポット検索。
import type { Place } from '~/types/plan'
import { readCache, writeCache } from '~/utils/apiCache'
import { callApi } from './api'

const CACHE_MS = 30 * 24 * 60 * 60 * 1000 // 30日

type SpotItem = {
  code?: string
  name?: string
  address_name?: string
  coord?: { lat: number; lon: number }
  categories?: { code?: string; name?: string }[]
  distance?: number // 周辺検索のときだけ返る、中心からの距離（メートル）
}

type SpotItemWithCoord = SpotItem & { name: string; coord: { lat: number; lon: number } }

function hasCoord(item: SpotItem): item is SpotItemWithCoord {
  return !!item.name && !!item.coord
}

function toPlace(item: SpotItemWithCoord): Place {
  return {
    name: item.name,
    lat: item.coord.lat,
    lon: item.coord.lon,
    spotCode: item.code,
    address: item.address_name,
    category: item.categories?.[0]?.name,
    categoryCode: item.categories?.[0]?.code,
  }
}

// limit は、都道府県全体の人気の場所を探すときだけ100件（受け取ってから住所と種類で絞る）
export async function searchPlaces(word: string, limit: 10 | 100 = 10): Promise<Place[]> {
  const key = `spot:${limit === 10 ? '' : `${limit}:`}${word.trim()}`
  const cached = readCache<Place[]>(key, CACHE_MS)
  if (cached) return cached

  const query = { word: word.trim(), ...(limit === 10 ? {} : { limit: String(limit) }) }
  const { items } = await callApi<{ items: SpotItem[] }>('spot', '/api/spot', query)
  const places = items.filter(hasCoord).map(toPlace)
  writeCache(key, places)
  return places
}

export type NearbyKind = 'meal' | 'sightseeing' | 'hotel'

// 宿泊先として出す種類（2026-10-01 に /category_list で確認）。旅館・民宿、温泉旅館、ペンション、その他の宿泊施設、ホテル。
// 宿泊/温泉の大分類で探すので、日帰りの温泉（0604001）とファッションホテル（0608002002）はここで除く
const LODGING_CODES = ['0603', '0604002', '0605', '0607', '0608']
const NOT_LODGING_CODES = ['0608002002']

export function isLodgingCode(code: string | undefined): boolean {
  return !!code && LODGING_CODES.some((c) => code.startsWith(c)) && !NOT_LODGING_CODES.some((c) => code.startsWith(c))
}

// center の周辺の、食事（約3km以内）・観光（約10km以内）・宿泊先（約5km以内）の場所。近い順。
// ルート沿い・市区町村の中を探すときは、種類によらず約10km以内（radius: 10000）
export type NearbyPlace = Place & { distanceMeters?: number }

export async function searchNearby(kind: NearbyKind, center: { lat: number; lon: number }, radius?: 10000): Promise<NearbyPlace[]> {
  const coord = `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`
  const key = `nearby:${kind}:${coord}${radius ? `:${radius}` : ''}`
  const cached = readCache<NearbyPlace[]>(key, CACHE_MS)
  if (cached) return cached

  const query = { kind, coord, ...(radius ? { radius: String(radius) } : {}) }
  const { items } = await callApi<{ items: SpotItem[] }>('spot', '/api/spot-nearby', query)
  const places = items
    .filter(hasCoord)
    .map((item) => ({ ...toPlace(item), distanceMeters: item.distance }))
    .filter((place) => kind !== 'hotel' || isLodgingCode(place.categoryCode))
  writeCache(key, places)
  return places
}
