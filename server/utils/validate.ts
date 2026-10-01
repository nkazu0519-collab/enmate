// 中継に渡された値の確認。書式だけでなく、範囲と実在する日時かも確かめる（誤った値で NAVITIME を呼ぶと、失敗でも1回に数えられる）

const COORD = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

// "緯度,経度"。緯度は -90〜90、経度は -180〜180
export function isCoord(value: string): boolean {
  const m = COORD.exec(value)
  return !!m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180
}

// "YYYY-MM-DDTHH:mm:ss" で、実在する日時（2月30日や 25時は不可）
export function isLocalTime(value: string): boolean {
  const m = LOCAL_TIME.exec(value)
  if (!m) return false
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number]
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  )
}
