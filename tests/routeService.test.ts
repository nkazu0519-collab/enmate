import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Leg } from '../app/types/plan'
import { buildLegs } from '../app/utils/legs'
import { searchRoute } from '../app/services/route'
import { FakeStorage, formOf } from './helpers'

// サーバー側の中継を呼ぶ部分だけを差し替えて、何回呼んだかを数える
const callApi = vi.hoisted(() => vi.fn())
vi.mock('../app/services/api', () => ({ callApi }))

const item = {
  summary: {
    move: { from_time: '2026-10-10T09:20:22+09:00', to_time: '2026-10-10T12:00:00+09:00', time: 159, distance: 213570 },
  },
  sections: [],
}

let outbound: Leg
let back: Leg

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
  callApi.mockReset()
  callApi.mockResolvedValue({ item })
  ;[outbound, back] = buildLegs(formOf()) as [Leg, Leg]
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ルート検索の呼び出し回数', () => {
  it('行きは到着時刻、帰りは出発時刻を指定して呼ぶ（同時には指定しない）', async () => {
    await searchRoute(outbound)
    await searchRoute(back)
    expect(callApi.mock.calls[0]![2]).toEqual({
      start: '37.9122,139.0617',
      goal: '36.5806,138.1672',
      goal_time: '2026-10-10T12:00:00',
    })
    expect(callApi.mock.calls[1]![2]).toEqual({
      start: '36.5806,138.1672',
      goal: '37.9122,139.0617',
      start_time: '2026-10-10T17:45:00',
    })
  })

  it('E13・E18: 立ち寄り先は入れた順に経由地（滞在時間つき）として渡し、SA/PA は有料道路上の地点にする', async () => {
    const [withStops] = buildLegs(
      formOf({
        stops: {
          outbound: [
            { place: { name: '高田城址公園', lat: 37.1003, lon: 138.2489 }, kind: 'sightseeing', stayMinutes: 30 },
            { place: { name: '妙高SA', lat: 36.9, lon: 138.2 }, kind: 'rest', stayMinutes: 30, tollRoad: true },
          ],
        },
      }),
    )
    await searchRoute(withStops!)
    expect(JSON.parse(callApi.mock.calls[0]![2].via)).toEqual([
      { lat: 37.1003, lon: 138.2489, 'stay-time': 30 },
      { lat: 36.9, lon: 138.2, 'stay-time': 30, 'road-type': 'toll' }, // SA/PA は有料道路上の地点として渡す
    ])
  })

  it('F4: 同じ条件の検索を同時に何度始めても、呼ぶのは1回だけ', async () => {
    const results = await Promise.all([searchRoute(outbound), searchRoute(outbound), searchRoute(outbound)])
    expect(callApi).toHaveBeenCalledTimes(1)
    expect(results[0]).toEqual(results[2])
  })

  it('同じ条件でもう一度計算するときは、保存した結果を使い、呼ばない', async () => {
    const first = await searchRoute(outbound)
    const second = await searchRoute(outbound)
    expect(callApi).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('条件が違えば、もう一度呼ぶ', async () => {
    await searchRoute(outbound)
    await searchRoute({ ...outbound, time: '2026-10-10T13:00:00' })
    expect(callApi).toHaveBeenCalledTimes(2)
  })

  it('F6: 失敗したら失敗として返し、結果を保存しない（次は呼び直す）', async () => {
    callApi.mockRejectedValueOnce(new Error('通信に失敗しました'))
    await expect(searchRoute(outbound)).rejects.toThrow('通信に失敗しました')
    await expect(searchRoute(outbound)).resolves.toMatchObject({ driveMinutes: 159 })
    expect(callApi).toHaveBeenCalledTimes(2)
  })
})
