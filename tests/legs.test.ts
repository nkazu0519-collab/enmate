import { describe, expect, it } from 'vitest'
import type { LegResult } from '../app/types/plan'
import { buildLegs, defaultPlanName, legInputHash, legStatus, validateForm } from '../app/utils/legs'
import { formOf, NAGANO, NIIGATA } from './helpers'

// 番号（E1、F2 など）は、設計書 §10.3 の表の番号

describe('入力チェック', () => {
  it('すべて入っていれば、問題なし', () => {
    expect(validateForm(formOf())).toEqual([])
  })

  it('F1: 出発地・会場・試合日・時刻のどれかが空なら、足りない項目を伝える', () => {
    expect(validateForm(formOf({ home: null }))).toContain('出発地を検索して選んでください')
    expect(validateForm(formOf({ venue: null }))).toContain('会場を検索して選んでください')
    expect(validateForm(formOf({ matchDate: '' }))).toContain('試合日を入れてください')
    expect(validateForm(formOf({ arriveBy: '' }))).toContain('会場に着きたい時刻を入れてください')
    expect(validateForm(formOf({ matchEnd: '' }))).toContain('試合の終了時刻を入れてください')
  })

  it('F1: 全部が空なら、足りない項目をすべて伝える', () => {
    const errors = validateForm(formOf({ home: null, venue: null, matchDate: '', arriveBy: '', matchEnd: '' }))
    expect(errors).toHaveLength(5)
  })

  it('F2: 試合の終了時刻が、会場に着く時刻より前なら止める', () => {
    expect(validateForm(formOf({ arriveBy: '12:00', matchEnd: '11:59' }))).toContain(
      '試合の終了時刻は、会場に着きたい時刻より後にしてください',
    )
  })

  it('F2: 試合の終了時刻が、会場に着く時刻と同じでも止める', () => {
    expect(validateForm(formOf({ arriveBy: '12:00', matchEnd: '12:00' }))).toHaveLength(1)
  })

  it('F2: 1分でも後なら通す', () => {
    expect(validateForm(formOf({ arriveBy: '12:00', matchEnd: '12:01' }))).toEqual([])
  })

  it('F10: 出発地と会場が同じ場所なら止める', () => {
    expect(validateForm(formOf({ venue: { ...NIIGATA, name: '別の名前' } }))).toContain(
      '出発地と会場が同じ場所です。どちらかを選び直してください',
    )
  })

  it('F10: スポットのコードが同じなら、同じ場所とみなす', () => {
    const home = { ...NIIGATA, spotCode: '00001-001' }
    const venue = { ...NAGANO, spotCode: '00001-001' }
    expect(validateForm(formOf({ home, venue }))).toHaveLength(1)
  })

  it('会場を出るまでの時間は 0〜180 分の整数', () => {
    expect(validateForm(formOf({ exitMinutes: 0 }))).toEqual([])
    expect(validateForm(formOf({ exitMinutes: 180 }))).toEqual([])
    expect(validateForm(formOf({ exitMinutes: -1 }))).toHaveLength(1)
    expect(validateForm(formOf({ exitMinutes: 181 }))).toHaveLength(1)
    expect(validateForm(formOf({ exitMinutes: Number.NaN }))).toHaveLength(1)
  })
})

describe('区間の組み立て（日帰り）', () => {
  it('E1: 行きは、入れた到着時刻に会場へ着く条件になる', () => {
    const [outbound] = buildLegs(formOf())
    expect(outbound).toMatchObject({
      label: '行き',
      from: NIIGATA,
      to: NAGANO,
      timeRule: 'arriveBy',
      time: '2026-10-10T12:00:00',
    })
  })

  it('E2: 帰りは「試合の終了時刻＋会場を出るまでの時間」に会場を出る条件になる', () => {
    const [, back] = buildLegs(formOf({ matchEnd: '17:00', exitMinutes: 45 }))
    expect(back).toMatchObject({
      label: '帰り',
      from: NAGANO,
      to: NIIGATA,
      timeRule: 'departAt',
      time: '2026-10-10T17:45:00',
    })
  })

  it('F8: 試合が夜遅くに終わり、会場を出るのが翌日になるときは、翌日の日付になる', () => {
    const [, back] = buildLegs(formOf({ matchEnd: '23:30', exitMinutes: 45 }))
    expect(back?.time).toBe('2026-10-11T00:15:00')
  })

  it('F8: 月末・年末をまたいでも日付がずれない', () => {
    const [, back] = buildLegs(formOf({ matchDate: '2026-12-31', matchEnd: '23:50', exitMinutes: 30 }))
    expect(back?.time).toBe('2027-01-01T00:20:00')
  })
})

describe('計算結果が今の条件のものか', () => {
  const resultFor = (hash: string) => ({ inputHash: hash }) as LegResult

  it('まだ計算していなければ「未計算」', () => {
    const [outbound] = buildLegs(formOf())
    expect(legStatus(outbound!, undefined)).toBe('none')
  })

  it('同じ条件で計算した結果なら「計算済み」', () => {
    const [outbound] = buildLegs(formOf())
    expect(legStatus(outbound!, resultFor(legInputHash(outbound!)))).toBe('calculated')
  })

  it('F3: 計算したあとで到着時刻を変えたら、行きは「前の条件の結果」になる', () => {
    const [before] = buildLegs(formOf({ arriveBy: '12:00' }))
    const [after] = buildLegs(formOf({ arriveBy: '13:00' }))
    expect(legStatus(after!, resultFor(legInputHash(before!)))).toBe('stale')
  })

  it('F3: 到着時刻だけを変えたときは、帰りは計算済みのまま（呼び直さない）', () => {
    const [, before] = buildLegs(formOf({ arriveBy: '12:00' }))
    const [, after] = buildLegs(formOf({ arriveBy: '13:00' }))
    expect(legStatus(after!, resultFor(legInputHash(before!)))).toBe('calculated')
  })

  it('F3: 出発地を変えたら、行きも帰りも計算し直しになる', () => {
    const other = { name: '長岡駅', lat: 37.4478, lon: 138.8531 }
    const before = buildLegs(formOf())
    const after = buildLegs(formOf({ home: other }))
    expect(legStatus(after[0]!, resultFor(legInputHash(before[0]!)))).toBe('stale')
    expect(legStatus(after[1]!, resultFor(legInputHash(before[1]!)))).toBe('stale')
  })

  it('F5: 条件を元に戻したら、前の結果がまた使える', () => {
    const [first] = buildLegs(formOf({ arriveBy: '12:00' }))
    const [back] = buildLegs(formOf({ arriveBy: '12:00' }))
    expect(legStatus(back!, resultFor(legInputHash(first!)))).toBe('calculated')
  })
})

describe('プラン名', () => {
  it('E6: 空のまま保存したときは、会場名と試合日から名前を付ける', () => {
    expect(defaultPlanName('長野Uスタジアム', '2026-10-10')).toBe('長野Uスタジアム 遠征 10/10')
    expect(defaultPlanName('岡山', '2026-03-07')).toBe('岡山 遠征 3/7')
  })
})
