import type { Place } from './plan'

// 地図に描くルートの線
export type MapRoute = {
  id: string
  direction: 'outbound' | 'return'
  shape: [number, number][] // 緯度, 経度
}

// 地図に立てる目印。hotel は宿泊先、stop は立ち寄り先、rest は休憩を勧める SA/PA
export type MapPoint = {
  kind: 'home' | 'venue' | 'hotel' | 'stop' | 'rest'
  place: Place
  icon?: string // 決まった絵の代わりに使う絵文字
  label?: string // 立ち寄り先の番号、休憩候補の「休1」など
  id?: string // 休憩候補を押したときに、どの候補かを返すのに使う
  note?: string // 休憩候補の吹き出しに出す「休憩候補（SA）・12:30頃」
}
