import type { Place } from './plan'

// 地図に描くルートの線
export type MapRoute = {
  id: string
  direction: 'outbound' | 'return'
  shape: [number, number][] // 緯度, 経度
}

// 地図に立てる目印
export type MapPoint = {
  kind: 'home' | 'venue'
  place: Place
}
