import { describe, expect, it } from 'vitest'
import type { LegResult, Plan, Stop } from '../app/types/plan'
import { buildLegs, legInputHash, legStatus, stopSearchOf, stopsAfterDroppingStay, validateForm } from '../app/utils/legs'
import { formFromPlan, planFromForm } from '../app/utils/planForm'
import { splitForList } from '../app/utils/planStore'
import { stayLabel, timelineItems } from '../app/utils/planSummary'
import { formOf, NAGANO } from './helpers'

// 番号（E22、F29 など）は、設計書 §10.5 の表の番号

const HOTEL_A = { name: '長野駅前ホテル', lat: 36.6431, lon: 138.1886, spotCode: 'hotel-a' }
const HOTEL_B = { name: '上田城下ホテル', lat: 36.4019, lon: 138.2491, spotCode: 'hotel-b' }
const stopAt = (name: string, lat: number): Stop => ({ place: { name, lat, lon: 138 }, kind: 'meal', stayMinutes: 60 })

describe('区間の組み立て（前泊・後泊）', () => {
  it('E22: 前泊すると、自宅 → 前日の宿泊先（前日の着く時刻から逆算）、宿泊先 → 会場、会場 → 自宅 の3区間になる', () => {
    const legs = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A, hotelBeforeArriveBy: '18:00' }))
    expect(legs.map((l) => [l.id, l.label, l.from.name, l.to.name, l.timeRule, l.time])).toEqual([
      ['before', '前日に宿泊先へ', '新潟駅', '長野駅前ホテル', 'arriveBy', '2026-10-09T18:00:00'],
      ['outbound', '当日の行き', '長野駅前ホテル', '長野Uスタジアム', 'arriveBy', '2026-10-10T12:00:00'],
      ['return', '帰り', '長野Uスタジアム', '新潟駅', 'departAt', '2026-10-10T17:45:00'],
    ])
  })

  it('E23: 後泊すると、会場 → 試合後の宿泊先（試合終了＋退場時間に出発）、宿泊先 → 自宅（翌日の出発時刻）になる', () => {
    const legs = buildLegs(formOf({ stayAfter: true, hotelAfter: HOTEL_B, hotelAfterDepartAt: '10:00' }))
    expect(legs.map((l) => [l.id, l.label, l.from.name, l.to.name, l.timeRule, l.time])).toEqual([
      ['outbound', '行き', '新潟駅', '長野Uスタジアム', 'arriveBy', '2026-10-10T12:00:00'],
      ['return', '試合後に宿泊先へ', '長野Uスタジアム', '上田城下ホテル', 'departAt', '2026-10-10T17:45:00'],
      ['after', '翌日の帰り', '上田城下ホテル', '新潟駅', 'departAt', '2026-10-11T10:00:00'],
    ])
  })

  it('E24: 前泊・後泊で「前日と同じ宿泊先に泊まる」なら、試合後も前日の宿泊先に戻る4区間になる', () => {
    const legs = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A, stayAfter: true, sameHotel: true, hotelAfter: HOTEL_B }))
    expect(legs.map((l) => `${l.from.name}→${l.to.name}`)).toEqual([
      '新潟駅→長野駅前ホテル',
      '長野駅前ホテル→長野Uスタジアム',
      '長野Uスタジアム→長野駅前ホテル',
      '長野駅前ホテル→新潟駅',
    ])
  })

  it('E24: 同じ宿泊先にしなければ、試合後は選んだ別の宿泊先に泊まる', () => {
    const legs = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A, stayAfter: true, sameHotel: false, hotelAfter: HOTEL_B }))
    expect(legs.map((l) => l.to.name)).toEqual(['長野駅前ホテル', '長野Uスタジアム', '上田城下ホテル', '新潟駅'])
  })

  it('F34: 年の初めの試合で前泊すると、前日は前の年の12月31日になる', () => {
    const [before] = buildLegs(formOf({ matchDate: '2027-01-01', stayBefore: true, hotelBefore: HOTEL_A }))
    expect(before?.time).toBe('2026-12-31T18:00:00')
  })

  it('立ち寄り先は区間ごとに持つ', () => {
    const stops = { before: [stopAt('前日の昼', 37)], outbound: [stopAt('当日の昼', 36.6)] }
    const legs = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A, stops }))
    expect(legs.map((l) => l.stops.map((s) => s.place.name))).toEqual([['前日の昼'], ['当日の昼'], []])
  })
})

describe('宿泊の入力チェック（行きと帰りは分けて確かめる）', () => {
  it('F29: 前泊で宿泊先が未設定なら、理由を出し、行きの区間は作らない。帰りは計算できる', () => {
    const form = formOf({ stayBefore: true, hotelBefore: null })
    expect(validateForm(form)).toContain('前日の宿泊先を「宿泊先を選ぶ」から選んでください')
    expect(buildLegs(form).map((l) => l.id)).toEqual(['return'])
  })

  it('F30: 後泊で宿泊先が未設定なら、理由を出し、帰りの区間は作らない。行きは計算・確定できる', () => {
    const form = formOf({ stayAfter: true, hotelAfter: null })
    expect(validateForm(form)).toContain('試合後の宿泊先を「宿泊先を選ぶ」から選んでください')
    expect(buildLegs(form).map((l) => l.id)).toEqual(['outbound'])
  })

  it('F30: 前日と同じ宿泊先に泊まる設定で、前日の宿泊先がまだないときは、そのことを伝える', () => {
    const form = formOf({ stayBefore: true, hotelBefore: null, stayAfter: true, sameHotel: true })
    expect(validateForm(form)).toContain('前日の宿泊先を選ぶと、試合後も同じ宿泊先に泊まります')
    expect(buildLegs(form)).toEqual([])
  })

  it('F31: 前日に着く時刻・翌日に出る時刻が空なら止める', () => {
    expect(validateForm(formOf({ stayBefore: true, hotelBefore: HOTEL_A, hotelBeforeArriveBy: '' }))).toEqual([
      '前日に宿泊先へ着く時刻を入れてください',
    ])
    expect(validateForm(formOf({ stayAfter: true, hotelAfter: HOTEL_B, hotelAfterDepartAt: '' }))).toEqual([
      '翌日に宿泊先を出る時刻を入れてください',
    ])
  })

  it('泊まらないときは、宿泊先の欄を確かめない', () => {
    expect(validateForm(formOf({ hotelBefore: null, hotelBeforeArriveBy: '', hotelAfter: null, hotelAfterDepartAt: '' }))).toEqual([])
  })

  it('立ち寄り先の誤りは、区間名を付けて伝える', () => {
    const stops = { before: [{ ...stopAt('前日の昼', 37), stayMinutes: 721 }] }
    expect(validateForm(formOf({ stayBefore: true, hotelBefore: HOTEL_A, stops }))).toEqual([
      '前日に宿泊先への「前日の昼」の滞在時間は、0〜720分で入れてください',
    ])
  })
})

describe('宿泊を変えたときの計算し直し', () => {
  const resultFor = (hash: string) => ({ inputHash: hash }) as LegResult
  const hashes = (legs: ReturnType<typeof buildLegs>) => Object.fromEntries(legs.map((l) => [l.id, legInputHash(l)]))

  it('F33: 前日の宿泊先を変えると、その宿泊先に着く区間と出る区間だけが計算し直しになる', () => {
    const before = hashes(buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A })))
    const after = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_B }))
    expect(after.map((l) => [l.id, legStatus(l, resultFor(before[l.id]!))])).toEqual([
      ['before', 'stale'],
      ['outbound', 'stale'],
      ['return', 'calculated'],
    ])
  })

  it('F33: 前泊をやめてまた泊まると、前の結果がまた使える（呼ばない）', () => {
    const first = hashes(buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A })))
    const again = buildLegs(formOf({ stayBefore: true, hotelBefore: HOTEL_A }))
    expect(again.every((l) => legStatus(l, resultFor(first[l.id]!)) === 'calculated')).toBe(true)
  })
})

describe('宿泊をやめたときの立ち寄り先', () => {
  it('F32: 前泊をやめると、前日の区間の立ち寄り先は、当日の行きの先頭に走る順でつなげる', () => {
    const stops = stopsAfterDroppingStay({ before: [stopAt('A', 1), stopAt('B', 2)], outbound: [stopAt('C', 3)] }, 'before')
    expect(stops.outbound!.map((s) => s.place.name)).toEqual(['A', 'B', 'C'])
    expect(stops.before).toEqual([])
  })

  it('F32: 後泊をやめると、翌日の帰りの立ち寄り先は、帰りの最後につなげる', () => {
    const stops = stopsAfterDroppingStay({ return: [stopAt('A', 1)], after: [stopAt('B', 2)] }, 'after')
    expect(stops.return!.map((s) => s.place.name)).toEqual(['A', 'B'])
    expect(stops.after).toEqual([])
  })
})

describe('立ち寄り先のおすすめを探す場所（仕様書 §4.5）', () => {
  const form = formOf({ stayBefore: true, hotelBefore: HOTEL_A, stayAfter: true, sameHotel: false, hotelAfter: HOTEL_B })

  it('E25: 区間ごとに「その日に向かう場所」の周辺で探し、入れる位置の初期値も変わる', () => {
    expect(stopSearchOf(form, 'before')).toEqual({ center: HOTEL_A, position: 'last' })
    expect(stopSearchOf(form, 'outbound')).toEqual({ center: NAGANO, position: 'last' })
    expect(stopSearchOf(form, 'return')).toEqual({ center: NAGANO, position: 'first' })
    expect(stopSearchOf(form, 'after')).toEqual({ center: HOTEL_B, position: 'first' })
  })

  it('E25: 前日と同じ宿泊先に泊まるときは、翌日の帰りは前日の宿泊先の周辺で探す', () => {
    expect(stopSearchOf({ ...form, sameHotel: true }, 'after').center).toEqual(HOTEL_A)
  })
})

describe('プランの保存と編集', () => {
  const now = '2026-10-01T05:00:00.000Z'

  it('E26: 宿泊先と時刻を保存し、編集で開くと同じ入力に戻る', () => {
    const form = formOf({ stayBefore: true, hotelBefore: HOTEL_A, hotelBeforeArriveBy: '19:00', stayAfter: true, sameHotel: true, hotelAfterDepartAt: '09:30' })
    const plan = planFromForm(form, buildLegs(form), { id: 'p1', now })
    expect(plan.hotelsBefore).toEqual([HOTEL_A])
    expect(plan.hotelsAfter).toEqual([HOTEL_A])
    expect(plan).toMatchObject({ hotelBeforeArriveBy: '19:00', hotelAfterDepartAt: '09:30' })
    const back = formFromPlan(plan)
    expect(back).toMatchObject({ stayBefore: true, hotelBefore: HOTEL_A, hotelBeforeArriveBy: '19:00', stayAfter: true, sameHotel: true, hotelAfterDepartAt: '09:30' })
    expect(buildLegs(back).map(legInputHash)).toEqual(plan.legs.map(legInputHash))
  })

  it('E26: 別の宿泊先に後泊したプランは、同じ宿泊先の設定をオフにして開く', () => {
    const form = formOf({ stayBefore: true, hotelBefore: HOTEL_A, stayAfter: true, sameHotel: false, hotelAfter: HOTEL_B })
    const back = formFromPlan(planFromForm(form, buildLegs(form), { id: 'p1', now }))
    expect(back).toMatchObject({ sameHotel: false, hotelAfter: HOTEL_B })
  })

  it('F35: 段階2までに保存した日帰りのプランは、泊まらない設定と時刻の初期値で開く', () => {
    const old = planFromForm(formOf(), buildLegs(formOf()), { id: 'old', now }) as Partial<Plan>
    delete old.hotelBeforeArriveBy
    delete old.hotelAfterDepartAt
    expect(formFromPlan(old as Plan)).toMatchObject({
      stayBefore: false,
      hotelBefore: null,
      hotelBeforeArriveBy: '18:00',
      stayAfter: false,
      hotelAfterDepartAt: '10:00',
    })
  })
})

describe('一覧・閲覧での宿泊の表記', () => {
  const planWith = (before: number, after: number) => ({ hotelsBefore: Array(before).fill(HOTEL_A), hotelsAfter: Array(after).fill(HOTEL_B) })

  it('E27: 日帰り／前泊／後泊／前泊・後泊', () => {
    expect(stayLabel(planWith(0, 0))).toBe('日帰り')
    expect(stayLabel(planWith(1, 0))).toBe('前泊')
    expect(stayLabel(planWith(0, 1))).toBe('後泊')
    expect(stayLabel(planWith(1, 1))).toBe('前泊・後泊')
  })
})

describe('遠征の完了（すべての区間が終わった日の翌日に完了済みへ）', () => {
  const plan = (id: string, after: boolean, lastArriveAt?: string) =>
    ({
      id,
      matchDate: '2026-10-01',
      hotelsBefore: [],
      hotelsAfter: after ? [HOTEL_B] : [],
      legs: lastArriveAt ? [{ id: 'return', result: { arriveAt: lastArriveAt } }] : [],
    }) as unknown as Plan

  it('F36: 後泊する遠征は、翌日の帰りの当日までは「これから」に残り、その翌日に完了済みへ移る', () => {
    const plans = [plan('後泊', true, '2026-10-02T13:00:00'), plan('日帰り', false, '2026-10-01T21:00:00')]
    expect(splitForList(plans, '2026-10-02').upcoming.map((p) => p.id)).toEqual(['後泊'])
    expect(splitForList(plans, '2026-10-03').done.map((p) => p.id)).toEqual(['後泊', '日帰り'])
  })

  it('F36: 夜中に家へ着く遠征は、着いた日のうちは「これから」に残る', () => {
    const plans = [plan('夜中に帰着', false, '2026-10-02T02:30:00')]
    expect(splitForList(plans, '2026-10-02').upcoming.map((p) => p.id)).toEqual(['夜中に帰着'])
    expect(splitForList(plans, '2026-10-03').done.map((p) => p.id)).toEqual(['夜中に帰着'])
  })

  it('F36: まだ計算していない遠征は、試合日に後泊の泊数を足した日で決める', () => {
    expect(splitForList([plan('後泊', true)], '2026-10-02').upcoming).toHaveLength(1)
    expect(splitForList([plan('後泊', true)], '2026-10-03').done).toHaveLength(1)
  })
})

describe('閲覧ページのタイムライン（前泊・後泊）', () => {
  it('E28: 行きは前日の区間と当日の行きをつなげ、宿泊先に着くところを「宿泊」と分かるようにする', () => {
    const form = formOf({ stayBefore: true, hotelBefore: HOTEL_A, stayAfter: true, sameHotel: true })
    const legs = buildLegs(form)
    const times: Record<string, [string, string]> = {
      before: ['2026-10-09T15:00:00', '2026-10-09T18:00:00'],
      outbound: ['2026-10-10T11:40:00', '2026-10-10T12:00:00'],
      return: ['2026-10-10T17:45:00', '2026-10-10T18:05:00'],
      after: ['2026-10-11T10:00:00', '2026-10-11T13:00:00'],
    }
    const plan = planFromForm(
      form,
      legs.map((l) => ({ ...l, result: { departAt: times[l.id]![0], arriveAt: times[l.id]![1], stopVisits: [] } as unknown as LegResult })),
      { id: 'p', now: '2026-10-01T05:00:00.000Z' },
    )
    expect(timelineItems(plan, 'outbound').map((i) => [i.type, i.name, i.hotel ?? false])).toEqual([
      ['depart', '新潟駅', false],
      ['arrive', '長野駅前ホテル', true],
      ['depart', '長野駅前ホテル', false],
      ['arrive', '長野Uスタジアム', false],
    ])
    expect(timelineItems(plan, 'return').map((i) => [i.type, i.name, i.hotel ?? false])).toEqual([
      ['matchEnd', '長野Uスタジアム', false],
      ['depart', '長野Uスタジアム', false],
      ['arrive', '長野駅前ホテル', true],
      ['depart', '長野駅前ホテル', false],
      ['arrive', '新潟駅', false],
    ])
  })
})
