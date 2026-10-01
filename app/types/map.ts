import type { Place } from './plan'

// 地図に描くルートの線
export type MapRoute = {
  id: string
  direction: 'outbound' | 'return'
  shape: [number, number][] // 緯度, 経度
}

// 地図に立てる目印。stop は立ち寄り先、rest は休憩を勧める SA/PA
export type MapPoint = {
  kind: 'home' | 'venue' | 'stop' | 'rest'
  place: Place
  icon?: string // 決まった絵の代わりに使う絵文字
}
