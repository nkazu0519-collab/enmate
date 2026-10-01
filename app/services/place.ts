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
  categories?: { name?: string }[]
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
  }
}

export async function searchPlaces(word: string): Promise<Place[]> {
  const key = `spot:${word.trim()}`
  const cached = readCache<Place[]>(key, CACHE_MS)
  if (cached) return cached

  const { items } = await callApi<{ items: SpotItem[] }>('spot', '/api/spot', { word: word.trim() })
  const places = items.filter(hasCoord).map(toPlace)
  writeCache(key, places)
  return places
}

export type NearbyKind = 'meal' | 'sightseeing'

// center の周辺の、食事（約3km以内）か観光（約10km以内）の場所。近い順
export type NearbyPlace = Place & { distanceMeters?: number }

export async function searchNearby(kind: NearbyKind, center: Place): Promise<NearbyPlace[]> {
  const coord = `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`
  const key = `nearby:${kind}:${coord}`
  const cached = readCache<NearbyPlace[]>(key, CACHE_MS)
  if (cached) return cached

  const { items } = await callApi<{ items: SpotItem[] }>('spot', '/api/spot-nearby', { kind, coord })
  const places = items.filter(hasCoord).map((item) => ({ ...toPlace(item), distanceMeters: item.distance }))
  writeCache(key, places)
  return places
}
