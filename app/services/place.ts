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
}

export async function searchPlaces(word: string): Promise<Place[]> {
  const key = `spot:${word.trim()}`
  const cached = readCache<Place[]>(key, CACHE_MS)
  if (cached) return cached

  const { items } = await callApi<{ items: SpotItem[] }>('spot', '/api/spot', { word: word.trim() })
  const places = items
    .filter((item) => item.name && item.coord)
    .map((item) => ({
      name: item.name!,
      lat: item.coord!.lat,
      lon: item.coord!.lon,
      spotCode: item.code,
      address: item.address_name,
      category: item.categories?.[0]?.name,
    }))
  writeCache(key, places)
  return places
}
