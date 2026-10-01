import { describe, expect, it } from 'vitest'
import type { Plan } from '../app/types/plan'
import { deletePlan, findPlan, loadPlans, savePlan, splitForList } from '../app/utils/planStore'
import { FakeStorage, NAGANO, NIIGATA } from './helpers'

function planOf(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    name: '長野Uスタジアム 遠征 10/10',
    home: NIIGATA,
    venue: NAGANO,
    matchDate: '2026-10-10',
    arriveBy: '12:00',
    matchEnd: '17:00',
    exitMinutes: 45,
    restIntervalMinutes: 120,
    hotelsBefore: [],
    hotelsAfter: [],
    legs: [],
    createdAt: '2026-10-01T05:00:00.000Z',
    updatedAt: '2026-10-01T05:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  }
}

describe('プランの保存と読み込み', () => {
  it('何も保存していなければ、0件（問題なし）', () => {
    expect(loadPlans(new FakeStorage())).toEqual({ plans: [], problem: '' })
  })

  it('E5・E7: 保存したプランを読み込める', () => {
    const store = new FakeStorage()
    expect(savePlan(planOf(), store)).toBe(true)
    expect(loadPlans(store).plans).toEqual([planOf()])
    expect(findPlan('plan-1', store)?.name).toBe('長野Uスタジアム 遠征 10/10')
  })

  it('E9: 同じ ID で保存すると、件数は増えずに中身が置き換わる', () => {
    const store = new FakeStorage()
    savePlan(planOf(), store)
    savePlan(planOf({ name: '直した名前', updatedAt: '2026-10-02T00:00:00.000Z' }), store)
    const { plans } = loadPlans(store)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      name: '直した名前',
      createdAt: '2026-10-01T05:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    })
  })

  it('F12: 存在しない ID は見つからない', () => {
    const store = new FakeStorage()
    savePlan(planOf(), store)
    expect(findPlan('no-such-id', store)).toBeUndefined()
  })

  it('F13: 削除で消えるのは、選んだ1件だけ', () => {
    const store = new FakeStorage()
    savePlan(planOf({ id: 'a' }), store)
    savePlan(planOf({ id: 'b' }), store)
    savePlan(planOf({ id: 'c' }), store)
    expect(deletePlan('b', store)).toBe(true)
    expect(loadPlans(store).plans.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('F13: 存在しない ID を削除しても、ほかのプランは消えない', () => {
    const store = new FakeStorage()
    savePlan(planOf({ id: 'a' }), store)
    deletePlan('zzz', store)
    expect(loadPlans(store).plans).toHaveLength(1)
  })
})

describe('保存領域の不具合', () => {
  it('F14: 保存領域が使えないときは、0件として扱い、そのことが分かる', () => {
    expect(loadPlans(null)).toEqual({ plans: [], problem: 'unavailable' })
    expect(savePlan(planOf(), null)).toBe(false)
  })

  it('F14: 保存に失敗したら false を返す（成功したように見せない）', () => {
    const store = new FakeStorage()
    store.failOnSet = true
    expect(savePlan(planOf(), store)).toBe(false)
  })

  it('F14: 保存データが壊れていても落ちず、壊れていることが分かる', () => {
    const store = new FakeStorage()
    store.setItem('enmate:plans', '{これは JSON ではない')
    expect(loadPlans(store)).toEqual({ plans: [], problem: 'broken' })
  })

  it('F14: 壊れていた元のデータは退避し、新しく保存しても失わない', () => {
    const store = new FakeStorage()
    store.setItem('enmate:plans', '{これは JSON ではない')
    loadPlans(store)
    savePlan(planOf(), store)
    expect(store.getItem('enmate:plans:broken')).toBe('{これは JSON ではない')
    expect(loadPlans(store)).toEqual({ plans: [planOf()], problem: '' })
  })

  it('F14: 形の違うデータが混ざっていたら、読めるプランだけを返す', () => {
    const store = new FakeStorage()
    store.setItem('enmate:plans', JSON.stringify([planOf(), { id: 'x', name: '別のアプリのデータ' }, null]))
    const { plans, problem } = loadPlans(store)
    expect(plans).toEqual([planOf()])
    expect(problem).toBe('broken')
  })

  it('F14: 配列でないデータは、0件として扱う', () => {
    const store = new FakeStorage()
    store.setItem('enmate:plans', '{"id":"plan-1"}')
    expect(loadPlans(store)).toEqual({ plans: [], problem: 'broken' })
  })
})

describe('一覧の分け方', () => {
  const plans = [
    planOf({ id: '先月', matchDate: '2026-09-05' }),
    planOf({ id: '来月', matchDate: '2026-11-07' }),
    planOf({ id: '昨日', matchDate: '2026-09-30' }),
    planOf({ id: '今週', matchDate: '2026-10-03' }),
    planOf({ id: '今日', matchDate: '2026-10-01' }),
  ]

  it('E11: これからの試合は近い順、完了済みは新しい順に分かれる', () => {
    const { upcoming, done } = splitForList(plans, '2026-10-01')
    expect(upcoming.map((p) => p.id)).toEqual(['今日', '今週', '来月'])
    expect(done.map((p) => p.id)).toEqual(['昨日', '先月'])
  })

  it('F15: 試合当日は「これから」に残り、翌日から完了済みに移る', () => {
    expect(splitForList(plans, '2026-10-01').upcoming.map((p) => p.id)).toContain('今日')
    expect(splitForList(plans, '2026-10-02').done.map((p) => p.id)).toContain('今日')
  })
})
