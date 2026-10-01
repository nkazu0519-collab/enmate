import { describe, expect, it } from 'vitest'
import { readCache, writeCache } from '../app/utils/apiCache'
import { readUsage, recordCall } from '../app/utils/usage'
import { FakeStorage } from './helpers'

const OCT = new Date(2026, 9, 1, 12, 0)
const NOV = new Date(2026, 10, 1, 0, 0)

describe('今月の使用回数の目安', () => {
  it('まだ呼んでいなければ 0 回。ルート検索の上限は 500', () => {
    expect(readUsage('route', OCT, new FakeStorage())).toEqual({ used: 0, limit: 500, nearLimit: false })
  })

  it('E10: 応答ヘッダーの残り回数から、使った回数を出す', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 495, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store)).toMatchObject({ used: 5, limit: 500 })
  })

  it('E10: このブラウザで1回しか呼んでいなくても、ヘッダーの値を優先する（他の端末で使った分も入る）', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 300, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store).used).toBe(200)
  })

  it('ヘッダーがないときは、このブラウザで数えた回数を使う', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: null, limit: null }, OCT, store)
    recordCall('route', { remaining: null, limit: null }, OCT, store)
    expect(readUsage('route', OCT, store)).toMatchObject({ used: 2, limit: 500 })
  })

  it('400回（上限の8割）に達したら注意を出す', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 101, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store).nearLimit).toBe(false)
    recordCall('route', { remaining: 100, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store).nearLimit).toBe(true)
  })

  it('F7: 使い切ったときは 500/500 になる', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 0, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store)).toEqual({ used: 500, limit: 500, nearLimit: true })
  })

  it('月が変わったら 0 回に戻る', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 100, limit: 500 }, OCT, store)
    expect(readUsage('route', NOV, store)).toEqual({ used: 0, limit: 500, nearLimit: false })
  })

  it('ルート検索と場所検索は、別々に数える', () => {
    const store = new FakeStorage()
    recordCall('route', { remaining: 490, limit: 500 }, OCT, store)
    recordCall('spot', { remaining: 499, limit: 500 }, OCT, store)
    expect(readUsage('route', OCT, store).used).toBe(10)
    expect(readUsage('spot', OCT, store).used).toBe(1)
  })

  it('F14: 保存領域が使えなくても落ちない', () => {
    expect(() => recordCall('route', { remaining: 1, limit: 500 }, OCT, null)).not.toThrow()
    expect(readUsage('route', OCT, null).used).toBe(0)
  })
})

describe('API の結果の使い回し', () => {
  const HOUR = 60 * 60 * 1000

  it('期限内なら、保存した結果を返す', () => {
    const store = new FakeStorage()
    writeCache('route:a', { minutes: 159 }, 0, store)
    expect(readCache('route:a', 24 * HOUR, 23 * HOUR, store)).toEqual({ minutes: 159 })
  })

  it('期限を過ぎたら使わない', () => {
    const store = new FakeStorage()
    writeCache('route:a', { minutes: 159 }, 0, store)
    expect(readCache('route:a', 24 * HOUR, 25 * HOUR, store)).toBeNull()
  })

  it('条件（キー）が違えば使わない', () => {
    const store = new FakeStorage()
    writeCache('route:a', { minutes: 159 }, 0, store)
    expect(readCache('route:b', 24 * HOUR, 0, store)).toBeNull()
  })

  it('F14: 保存領域が使えない・壊れているときは「なし」として扱う', () => {
    const store = new FakeStorage()
    store.setItem('enmate:cache:route:a', '壊れたデータ')
    expect(readCache('route:a', HOUR, 0, store)).toBeNull()
    expect(readCache('route:a', HOUR, 0, null)).toBeNull()
    expect(() => writeCache('route:a', 1, 0, null)).not.toThrow()
  })

  it('保存に失敗しても落ちない（使い回せないだけ）', () => {
    const store = new FakeStorage()
    store.failOnSet = true
    expect(() => writeCache('route:a', 1, 0, store)).not.toThrow()
  })
})
