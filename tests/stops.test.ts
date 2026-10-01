import { describe, expect, it } from 'vitest'
import type { LegResult, Stop } from '../app/types/plan'
import { buildLegs, legInputHash, legStatus, MAX_STAY_MINUTES, MAX_STOPS, validateForm } from '../app/utils/legs'
import { formOf } from './helpers'

// 番号（E13、F17 など）は、設計書 §10.4 の表の番号

const TAKADA: Stop = { place: { name: '高田城址公園', lat: 37.1003, lon: 138.2489 }, kind: 'sightseeing', stayMinutes: 30 }
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
    const [longer] = buildLegs(formOf({ stops: { outbound: [{ ...TAKADA, stayMinutes: 45 }, LUNCH] } }))
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
  it(`F18: ${MAX_STOPS}か所までなら通し、それを超えたら止める`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...TAKADA, place: { ...TAKADA.place, lat: 37 + i / 100 } }))
    expect(validateForm(formOf({ stops: { outbound: many(MAX_STOPS) } }))).toEqual([])
    expect(validateForm(formOf({ stops: { outbound: many(MAX_STOPS + 1) } }))).toEqual([`行きの立ち寄り先は、${MAX_STOPS}か所までにしてください`])
  })

  it(`F18: いる時間は 0〜${MAX_STAY_MINUTES} 分の整数`, () => {
    const withStay = (stayMinutes: number) => formOf({ stops: { return: [{ ...LUNCH, stayMinutes }] } })
    expect(validateForm(withStay(0))).toEqual([])
    expect(validateForm(withStay(MAX_STAY_MINUTES))).toEqual([])
    const message = `帰りの「そば店」にいる時間は、0〜${MAX_STAY_MINUTES}分で入れてください`
    expect(validateForm(withStay(MAX_STAY_MINUTES + 1))).toEqual([message])
    expect(validateForm(withStay(-5))).toEqual([message])
    expect(validateForm(withStay(Number.NaN))).toEqual([message])
  })
})
