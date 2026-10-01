import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegResult, Plan } from '../app/types/plan'
import { readCache, writeCache } from '../app/utils/apiCache'
import { buildLegs, legInputHash, orderErrors } from '../app/utils/legs'
import { isPlan, loadPlans, savePlan } from '../app/utils/planStore'
import { readUsage, recordCall } from '../app/utils/usage'
import { isCoord, isLocalTime } from '../server/utils/validate'
import { FakeStorage, formOf } from './helpers'

// 番号（F43 など）は、設計書 §10.6 の表の番号（2026-10-01 のレビューで見つかった点）

const notifyUsageChanged = vi.hoisted(() => vi.fn())
vi.mock('~/composables/useUsage', () => ({ notifyUsageChanged }))

const HOTEL = { name: '上田城下ホテル', lat: 36.4019, lon: 138.2491 }

function resultFor(form: Parameters<typeof buildLegs>[0], id: string, departAt: string, arriveAt: string): LegResult {
  const leg = buildLegs(form).find((l) => l.id === id)!
  return {
    departAt,
    arriveAt,
    driveMinutes: 60,
    distanceMeters: 50_000,
    tollYen: 0,
    trafficConsidered: false,
    restAreas: [],
    shape: [],
    calculatedAt: '2026-10-01T05:00:00.000Z',
    inputHash: legInputHash(leg),
  }
}

describe('続けて走る区間の時刻の前後', () => {
  it('F43: 試合後に宿へ着くのが翌 00:45 なのに、翌日に宿を出るのが 00:00 なら、誤りを出す', () => {
    const form = formOf({ arriveBy: '18:00', matchEnd: '23:30', exitMinutes: 45, stayAfter: true, hotelAfter: HOTEL, hotelAfterDepartAt: '00:00' })
    const legs = buildLegs(form)
    const results = {
      outbound: resultFor(form, 'outbound', '2026-10-10T15:00:00', '2026-10-10T18:00:00'),
      return: resultFor(form, 'return', '2026-10-11T00:15:00', '2026-10-11T00:45:00'),
      after: resultFor(form, 'after', '2026-10-11T00:00:00', '2026-10-11T03:00:00'),
    }
    expect(orderErrors(legs, results)).toEqual([
      '「試合後に宿泊先へ」で上田城下ホテルに着くのが 10/11 00:45 で、「翌日の帰り」で出る 10/11 00:00 より後です。時刻を見直してください',
    ])
  })

  it('F43: 翌日 10:00 に宿を出るふつうの後泊は、誤りにしない', () => {
    const form = formOf({ stayAfter: true, hotelAfter: HOTEL })
    const legs = buildLegs(form)
    const results = {
      outbound: resultFor(form, 'outbound', '2026-10-10T09:00:00', '2026-10-10T12:00:00'),
      return: resultFor(form, 'return', '2026-10-10T17:45:00', '2026-10-10T18:30:00'),
      after: resultFor(form, 'after', '2026-10-11T10:00:00', '2026-10-11T13:00:00'),
    }
    expect(orderErrors(legs, results)).toEqual([])
  })

  it('F43: 前日に宿へ着く前に、当日の行きで宿を出ることになるなら、誤りを出す', () => {
    const form = formOf({ stayBefore: true, hotelBefore: HOTEL, hotelBeforeArriveBy: '18:00', arriveBy: '08:00' })
    const legs = buildLegs(form)
    const results = {
      before: resultFor(form, 'before', '2026-10-09T15:00:00', '2026-10-09T18:00:00'),
      outbound: resultFor(form, 'outbound', '2026-10-09T17:00:00', '2026-10-10T08:00:00'),
    }
    expect(orderErrors(legs, results)).toHaveLength(1)
  })

  it('F43: 前の条件で計算した結果しかない区間は比べない（計算し直すまで待つ）', () => {
    const form = formOf({ stayAfter: true, hotelAfter: HOTEL, hotelAfterDepartAt: '00:00' })
    const legs = buildLegs(form)
    const stale = { ...resultFor(form, 'after', '2026-10-11T00:00:00', '2026-10-11T03:00:00'), inputHash: 'old' }
    const results = { return: resultFor(form, 'return', '2026-10-10T17:45:00', '2026-10-11T01:00:00'), after: stale }
    expect(orderErrors(legs, results)).toEqual([])
  })
})

describe('中継を呼ぶ共通の処理', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new FakeStorage())
  })

  it('F45: 失敗しても自動では呼び直さない（retry: 0 を渡す）', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [], remaining: 400, limit: 500 })
    vi.stubGlobal('$fetch', fetch)
    const { callApi } = await import('../app/services/api')
    await callApi('spot', '/api/spot', { word: '新潟' })
    expect(fetch).toHaveBeenCalledWith('/api/spot', { query: { word: '新潟' }, retry: 0 })
  })

  it('F47: 使用回数の保存データが壊れていても、成功した検索は成功として返す', async () => {
    localStorage.setItem('enmate:usage', '"broken"')
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ items: ['a'], remaining: 400, limit: 500 }))
    const { callApi } = await import('../app/services/api')
    await expect(callApi('spot', '/api/spot', { word: '新潟' })).resolves.toMatchObject({ items: ['a'] })
  })
})

describe('壊れた保存データ', () => {
  const plan = {
    id: 'p',
    name: 'p',
    home: HOTEL,
    venue: HOTEL,
    matchDate: '2026-10-10',
    arriveBy: '12:00',
    matchEnd: '17:00',
    exitMinutes: 45,
    restIntervalMinutes: 120,
    hotelsBefore: [],
    hotelsAfter: [],
    legs: [],
    createdAt: '',
    updatedAt: '',
    schemaVersion: 1,
  }

  it('F46: 宿泊先の一覧が無いプランは読めないものとして扱い、トップ画面を止めない', () => {
    const { hotelsBefore: _, ...noHotels } = plan
    expect(isPlan(plan)).toBe(true)
    expect(isPlan(noHotels)).toBe(false)
    const store = new FakeStorage()
    store.setItem('enmate:plans', JSON.stringify([plan, noHotels]))
    expect(loadPlans(store)).toMatchObject({ plans: [plan], problem: 'broken' })
  })

  it('F46: 区間の形が崩れている（出発地が無い、計算結果の時刻が無い）プランも読めないものとして扱う', () => {
    const leg = { id: 'outbound', label: '行き', from: HOTEL, to: HOTEL, timeRule: 'arriveBy', time: '', stops: [] }
    expect(isPlan({ ...plan, legs: [leg] })).toBe(true)
    expect(isPlan({ ...plan, legs: [{ ...leg, from: undefined }] })).toBe(false)
    expect(isPlan({ ...plan, legs: [{ ...leg, result: { shape: [], restAreas: [] } }] })).toBe(false)
  })

  it('F47: 使用回数の保存データが文字列になっていても、数え直して記録できる', () => {
    const store = new FakeStorage()
    store.setItem('enmate:usage', '"broken"')
    const now = new Date(2026, 9, 1)
    expect(() => recordCall('route', { remaining: 495, limit: 500 }, now, store)).not.toThrow()
    expect(readUsage('route', now, store).used).toBe(5)
  })
})

describe('保存領域がいっぱいのとき', () => {
  it('F48: 使い回し用のデータを消してからもう一度保存し、プランは保存できる', () => {
    const store = new FakeStorage()
    writeCache('route:x', { big: true }, Date.now(), store)
    const setItem = store.setItem.bind(store)
    let first = true
    // 1回目だけ容量不足で失敗させる
    store.setItem = (key: string, value: string) => {
      if (key === 'enmate:plans' && first) {
        first = false
        throw new Error('QuotaExceededError')
      }
      setItem(key, value)
    }
    const plan = { id: 'p', name: 'p', home: HOTEL, venue: HOTEL, matchDate: '2026-10-10', hotelsBefore: [], hotelsAfter: [], legs: [], schemaVersion: 1 } as unknown as Plan
    expect(savePlan(plan, store)).toBe(true)
    expect(readCache('route:x', 1e9, Date.now(), store)).toBeNull()
    expect(loadPlans(store).plans).toHaveLength(1)
  })
})

describe('中継に渡された値の確認', () => {
  it('F54: 座標は緯度 -90〜90、経度 -180〜180 だけを通す', () => {
    expect(isCoord('37.9122,139.0617')).toBe(true)
    expect(isCoord('-90,180')).toBe(true)
    expect(isCoord('999,139')).toBe(false)
    expect(isCoord('37,181')).toBe(false)
  })

  it('F54: 日時は実在するものだけを通す', () => {
    expect(isLocalTime('2026-10-10T12:00:00')).toBe(true)
    expect(isLocalTime('2028-02-29T00:00:00')).toBe(true)
    expect(isLocalTime('2026-02-30T12:00:00')).toBe(false)
    expect(isLocalTime('2026-10-10T25:00:00')).toBe(false)
    expect(isLocalTime('')).toBe(false)
  })
})
