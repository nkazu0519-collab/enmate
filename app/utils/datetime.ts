// 日時の計算と表示。
// プランの時刻は日本時間の「YYYY-MM-DDTHH:mm:ss」の文字列で持つ。端末のタイムゾーンで
// 結果が変わらないよう、Date は UTC とみなして足し引きにだけ使う。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toUtcMs(iso: string): number {
  const [date = '', time = ''] = iso.split('T')
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number)
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, mi, s)
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

// "2026-10-10" と "12:00" → "2026-10-10T12:00:00"
export function toLocalIso(date: string, time: string): string {
  return `${date}T${time}:00`
}

// NAVITIME が返す "2026-10-10T09:20:22+09:00" から、日本時間の部分だけを取り出す
export function stripOffset(iso: string): string {
  return iso.slice(0, 19)
}

export function addMinutes(iso: string, minutes: number): string {
  return fromUtcMs(toUtcMs(iso) + minutes * 60_000)
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(`${date}T00:00:00`) + days * 86_400_000).slice(0, 10)
}

export function datePart(iso: string): string {
  return iso.slice(0, 10)
}

// "HH:mm"（秒は切り捨て）
export function timePart(iso: string): string {
  return iso.slice(11, 16)
}

// "2026-10-10" → "10/10（土）"
export function formatDateJa(date: string): string {
  const d = new Date(toUtcMs(`${date}T00:00:00`))
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`
}

// "2026-10-10" → "10/10"
export function formatMonthDay(date: string): string {
  const [, mo = '', d = ''] = date.split('-')
  return `${Number(mo)}/${Number(d)}`
}

// 159 → "2時間39分"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

// 213570 → "214km"、850 → "850m"
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${Math.round(meters / 1000).toLocaleString('ja-JP')}km` : `${meters}m`
}

export function formatYen(yen: number): string {
  return `¥${yen.toLocaleString('ja-JP')}`
}

// from から to まで何分あるか（秒は切り捨て）
export function minutesBetween(from: string, to: string): number {
  return Math.floor((toUtcMs(to) - toUtcMs(from)) / 60_000)
}

// from から to まで何日あるか（to が過去なら負の数）
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(`${to}T00:00:00`) - toUtcMs(`${from}T00:00:00`)) / 86_400_000)
}

// base の日付から見た時刻。"04:50"、日付が違えば "前日 23:40"、"翌 02:10"、それより離れていれば "10/14 02:10"
export function timeFromDate(iso: string, base: string): string {
  const days = daysBetween(base, datePart(iso))
  const time = timePart(iso)
  if (days === 0) return time
  if (days === -1) return `前日 ${time}`
  if (days === 1) return `翌 ${time}`
  return `${formatMonthDay(datePart(iso))} ${time}`
}

// today の次の土曜日（today が土曜なら1週間後）
export function nextSaturday(today: string): string {
  const day = new Date(toUtcMs(`${today}T00:00:00`)).getUTCDay()
  return addDays(today, ((6 - day + 7) % 7) || 7)
}

// 端末の今日の日付（YYYY-MM-DD）
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// 記録した瞬間（UTC の ISO 文字列）を、端末の時刻で "10/1 14:05" のように表示する
export function formatTimestamp(utcIso: string): string {
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
