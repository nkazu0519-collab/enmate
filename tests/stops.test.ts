import { describe, expect, it } from 'vitest'
import type { LegResult, Stop } from '../app/types/plan'
import {
  buildLegs,
  defaultMatchEnd,
  kindFromCategory,
  legInputHash,
  legStatus,
  MAX_OPTIMAL_STAY_MINUTES,
  MAX_OPTIMAL_STOPS,
  MAX_STAY_MINUTES,
  MAX_STOPS,
  optimizeBlocker,
  reorderStops,
  stopFromPlace,
  validateForm,
} from '../app/utils/legs'
import { formOf } from './helpers'

// 番号（E13、F17 など）は、設計書 §10.4 の表の番号。決まりは仕様書 §4.2・§4.5・§4.8

const TAKADA: Stop = { place: { name: '高田城址公園', lat: 37.1003, lon: 138.2489 }, kind: 'sightseeing', stayMinutes: 90 }
const LUNCH: Stop = { place: { name: 'そば店', lat: 36.65, lon: 138.19 }, kind: 'meal', stayMinutes: 60 }
const resultFor = (hash: string) => ({ inputHash: hash }) as LegResult

describe('立ち寄り先のある区間', () => {
  it('E13: 立ち寄り先は、入れた区間にだけ、入れた順で入る', () => {
    const [outbound, back] = buildLegs(formOf({ stops: { outbound: [TAKADA, LUNCH] } }))
    expect(outbound!.stops.map((s) => s.place.name)).toEqual(['高田城址公園', 'そば店'])
    expect(back!.stops).toEqual([])
  })

  it('F17: 立ち寄り先を足すと、その区間だけが計算し直しになる', () => {
    const [beforeOut, beforeBack] = buildLegs(formOf())
    const [afterOut, afterBack] = buildLegs(formOf({ stops: { outbound: [TAKADA] } }))
    expect(legStatus(afterOut!, resultFor(legInputHash(beforeOut!)))).toBe('stale')
    expect(legStatus(afterBack!, resultFor(legInputHash(beforeBack!)))).toBe('calculated')
  })

  it('F17: 滞在時間を変えても、順番を入れ替えても、計算し直しになる', () => {
    const [base] = buildLegs(formOf({ stops: { outbound: [TAKADA, LUNCH] } }))
    const [longer] = buildLegs(formOf({ stops: { outbound: [{ ...TAKADA, stayMinutes: 100 }, LUNCH] } }))
    const [swapped] = buildLegs(formOf({ stops: { outbound: [LUNCH, TAKADA] } }))
    expect(legStatus(longer!, resultFor(legInputHash(base!)))).toBe('stale')
    expect(legStatus(swapped!, resultFor(legInputHash(base!)))).toBe('stale')
  })

  it('F17: 立ち寄り先を消して元に戻せば、前の結果がまた使える', () => {
    const [before] = buildLegs(formOf())
    const [after] = buildLegs(formOf({ stops: { outbound: [] } }))
    expect(legStatus(after!, resultFor(legInputHash(before!)))).toBe('calculated')
  })
})

describe('立ち寄り先の入力チェック', () => {
  it(`F18: 滞在時間は 0〜${MAX_STAY_MINUTES} 分の整数`, () => {
    const withStay = (stayMinutes: number) => formOf({ stops: { return: [{ ...LUNCH, stayMinutes }] } })
    expect(validateForm(withStay(0))).toEqual([])
    expect(validateForm(withStay(MAX_STAY_MINUTES))).toEqual([])
    const message = `帰りの「そば店」の滞在時間は、0〜${MAX_STAY_MINUTES}分で入れてください`
    expect(validateForm(withStay(MAX_STAY_MINUTES + 1))).toEqual([message])
    expect(validateForm(withStay(-10))).toEqual([message])
    expect(validateForm(withStay(Number.NaN))).toEqual([message])
  })

  it(`F18: 立ち寄り先は NAVITIME が受け付ける${MAX_STOPS}か所まで`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...TAKADA, place: { ...TAKADA.place, lat: 37 + i / 1000 } }))
    expect(validateForm(formOf({ stops: { outbound: many(MAX_STOPS) } }))).toEqual([])
    expect(validateForm(formOf({ stops: { outbound: many(MAX_STOPS + 1) } }))).toHaveLength(1)
  })
})

describe('立ち寄り先の種類と滞在時間の初期値', () => {
  it('E14: 種類は場所の種類のコードから決める（SA/PA は休憩、グルメは食事、観光・文化施設は観光、それ以外はその他）', () => {
    expect(kindFromCategory('0803005001')).toBe('rest')
    expect(kindFromCategory('0804001')).toBe('rest')
    expect(kindFromCategory('0302001002')).toBe('meal')
    expect(kindFromCategory('0705006001')).toBe('sightseeing')
    expect(kindFromCategory('0111004')).toBe('sightseeing')
    expect(kindFromCategory('0201001')).toBe('other')
    expect(kindFromCategory(undefined)).toBe('other')
  })

  it('E14: 滞在時間の初期値は 観光90分・食事60分・休憩30分・その他30分', () => {
    const place = { name: 'x', lat: 36, lon: 138 }
    expect(stopFromPlace({ ...place, categoryCode: '0705006' }).stayMinutes).toBe(90)
    expect(stopFromPlace({ ...place, categoryCode: '0302001' }).stayMinutes).toBe(60)
    expect(stopFromPlace({ ...place, categoryCode: '0803005' }).stayMinutes).toBe(30)
    expect(stopFromPlace(place).stayMinutes).toBe(30)
  })

  it('F24: 名前で探した SA/PA も、有料道路上の地点（休憩）として入れる', () => {
    const stop = stopFromPlace({ name: '妙高SA', lat: 36.93, lon: 138.21, categoryCode: '0803005001' })
    expect(stop).toMatchObject({ kind: 'rest', tollRoad: true })
  })

  it('F24: SA/PA でない場所は、有料道路上の地点にしない', () => {
    expect(stopFromPlace({ name: '道の駅', lat: 36.9, lon: 138.2, categoryCode: '0804005' }).tollRoad).toBeUndefined()
  })

  it('F17: 有料道路上の地点かどうかが変わったら、計算し直しになる', () => {
    const [plain] = buildLegs(formOf({ stops: { outbound: [{ ...LUNCH }] } }))
    const [toll] = buildLegs(formOf({ stops: { outbound: [{ ...LUNCH, tollRoad: true }] } }))
    expect(legStatus(toll!, resultFor(legInputHash(plain!)))).toBe('stale')
  })
})

describe('試合の終了時刻の初期値（仕様書 §4.2）', () => {
  it('到着予定時刻より後なら、そのまま', () => {
    expect(defaultMatchEnd('12:00', '17:00')).toBe('17:00')
  })

  it('到着予定時刻以前なら、到着の4時間後に仮置きする', () => {
    expect(defaultMatchEnd('18:30', '17:00')).toBe('22:30')
    expect(defaultMatchEnd('17:00', '17:00')).toBe('21:00')
  })

  it('4時間後が日付をまたぐなら 23:30', () => {
    expect(defaultMatchEnd('20:00', '17:00')).toBe('23:30')
  })
})

describe('寄る順番の最適化（仕様書にない追加。設計書 §5.3）', () => {
  const NAGAOKA: Stop = { place: { name: '長岡', lat: 37.4467, lon: 138.8513 }, kind: 'other', stayMinutes: 30 }
  const at = (stop: Stop) => ({ lat: stop.place.lat, lon: stop.place.lon })

  it('E21: 立ち寄り先が2か所以上で、上限の中なら押せる', () => {
    expect(optimizeBlocker([TAKADA])).not.toBe('')
    expect(optimizeBlocker([TAKADA, LUNCH])).toBe('')
  })

  it(`F27: 立ち寄り先が${MAX_OPTIMAL_STOPS}か所を超えると押せず、理由を出す`, () => {
    const many = Array.from({ length: MAX_OPTIMAL_STOPS + 1 }, (_, i) => ({ ...NAGAOKA, stayMinutes: 0, place: { ...NAGAOKA.place, lat: 37 + i / 100 } }))
    expect(optimizeBlocker(many.slice(0, MAX_OPTIMAL_STOPS))).toBe('')
    expect(optimizeBlocker(many)).toContain(`${MAX_OPTIMAL_STOPS}か所まで`)
  })

  it(`F27: 滞在時間の合計が${MAX_OPTIMAL_STAY_MINUTES}分を超えると押せず、今の合計を出す`, () => {
    const stay = (m: number) => ({ ...TAKADA, stayMinutes: m })
    expect(optimizeBlocker([stay(150), stay(150)])).toBe('')
    expect(optimizeBlocker([stay(150), stay(160)])).toContain('今は310分')
  })

  it('E21: 応答の寄る順の座標に合わせて、元の立ち寄り先（種類・滞在時間つき）を並べ替える', () => {
    expect(reorderStops([LUNCH, NAGAOKA, TAKADA], [at(NAGAOKA), at(TAKADA), at(LUNCH)])).toEqual([NAGAOKA, TAKADA, LUNCH])
  })

  it('F28: 同じ場所を2回入れていても、取りこぼさない', () => {
    expect(reorderStops([TAKADA, LUNCH, TAKADA], [at(TAKADA), at(TAKADA), at(LUNCH)])).toEqual([TAKADA, TAKADA, LUNCH])
  })

  it('F28: 応答の地点の数や座標が合わなければ、並べ替えない（null）', () => {
    expect(reorderStops([TAKADA, LUNCH], [at(TAKADA)])).toBeNull()
    expect(reorderStops([TAKADA, LUNCH], [at(TAKADA), at(NAGAOKA)])).toBeNull()
  })
})
