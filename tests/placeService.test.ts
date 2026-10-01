import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from '../app/services/place'
import { FakeStorage } from './helpers'

// サーバー側の中継を呼ぶ部分だけを差し替えて、何回呼んだかを数える
const callApi = vi.hoisted(() => vi.fn())
vi.mock('../app/services/api', () => ({ callApi }))

// NAVITIME スポット検索の応答と同じ項目名で作った見本（値は架空）
const items = [
  {
    code: '00000-0001',
    name: '新潟',
    address_name: '新潟県新潟市中央区花園',
    coord: { lat: 37.9122, lon: 139.0617 },
    // 実際の応答では、細かい種類から順に並ぶ
    categories: [
      { code: '0802001001', name: '駅', level: 'detail' },
      { code: '08', name: '交通', level: 'large' },
    ],
  },
  { code: '00000-0002', name: '座標のない場所' },
]

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
  callApi.mockReset()
  callApi.mockResolvedValue({ items })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('場所の検索', () => {
  it('名前・住所・種類・座標・スポットのコードを取り出す。座標のない結果は除く', async () => {
    expect(await searchPlaces('新潟駅')).toEqual([
      { name: '新潟', lat: 37.9122, lon: 139.0617, spotCode: '00000-0001', address: '新潟県新潟市中央区花園', category: '駅', categoryCode: '0802001001' },
    ])
  })

  it('同じ言葉でもう一度検索するときは、保存した結果を使い、呼ばない', async () => {
    await searchPlaces('新潟駅')
    await searchPlaces(' 新潟駅 ')
    expect(callApi).toHaveBeenCalledTimes(1)
  })

  it('言葉が違えば、もう一度呼ぶ', async () => {
    await searchPlaces('新潟駅')
    await searchPlaces('長岡駅')
    expect(callApi).toHaveBeenCalledTimes(2)
  })

  it('0件でも落ちない', async () => {
    callApi.mockResolvedValue({ items: [] })
    expect(await searchPlaces('どこにもない場所')).toEqual([])
  })

  it('F6: 失敗したら失敗として返し、結果を保存しない', async () => {
    callApi.mockRejectedValueOnce(new Error('通信に失敗しました'))
    await expect(searchPlaces('新潟駅')).rejects.toThrow('通信に失敗しました')
    await expect(searchPlaces('新潟駅')).resolves.toHaveLength(1)
  })
})
