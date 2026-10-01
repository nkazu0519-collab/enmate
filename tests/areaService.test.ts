import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { citiesOf, routeAreaSamples, searchAlongRoute, searchInCity, searchPopular, searchWordIn } from '../app/services/area'
import { sampleRoute, type AreaSample } from '../app/utils/routeArea'
import { FakeStorage } from './helpers'

// 番号（E30、F37 など）は、設計書 §10.5 の表の番号

// サーバー側の中継を呼ぶ部分だけを差し替えて、何をいくつ呼んだかを数える
const callApi = vi.hoisted(() => vi.fn())
vi.mock('../app/services/api', () => ({ callApi }))

const OKAYAMA = { code: '33', name: '岡山県' }
const KAGAWA = { code: '37', name: '香川県' }

// 経度134度の線を、北緯34度から35度まで北へまっすぐ進むルート（約111km）
const LINE: [number, number][] = Array.from({ length: 11 }, (_, i) => [34 + i * 0.1, 134])

// NAVITIME Geocoding の逆ジオコーディングの応答と同じ項目名で作った見本（2026-10-01 に確認した形）。
// 北緯34.5度より南は岡山県岡山市北区、北は鳥取県鳥取市とする
function reverseResponse(lat: number) {
  const [pref, city] = lat < 34.5 ? [['33', '岡山県'], ['33101', '岡山市北区']] : [['31', '鳥取県'], ['31201', '鳥取市']]
  return {
    items: [
      {
        code: `${city[0]}0001`,
        name: `${pref[1]}${city[1]}1丁目`,
        details: [
          { code: pref[0], name: pref[1], level: '1' },
          { code: city[0], name: city[1], level: '2' },
          { code: `${city[0]}0001`, name: '1丁目', level: '3' },
        ],
      },
    ],
  }
}

// スポット検索の応答の見本（値は架空）
const spot = (code: string, name: string, address: string, lat: number, lon: number, category = '0608001', distance?: number) => ({
  code,
  name,
  address_name: address,
  coord: { lat, lon },
  categories: [{ code: category, name: category.startsWith('06') ? 'ホテル' : category.startsWith('03') ? 'ラーメン' : '城' }],
  ...(distance === undefined ? {} : { distance }),
})

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
  callApi.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('通る都道府県を調べる', () => {
  it('E30: ルート上の地点の住所を1地点ずつ調べ、都道府県・市区町村を付ける', async () => {
    callApi.mockImplementation(async (_api: string, _path: string, query: { coord: string }) => reverseResponse(Number(query.coord.split(',')[0])))
    const samples = await routeAreaSamples(LINE)
    expect(callApi).toHaveBeenCalledTimes(sampleRoute(LINE).length)
    expect(callApi.mock.calls[0]!.slice(0, 2)).toEqual(['geocoding', '/api/address-reverse'])
    expect(samples[0]).toMatchObject({ prefCode: '33', prefName: '岡山県', cityCode: '33101', cityName: '岡山市北区' })
    expect(samples.at(-1)).toMatchObject({ prefCode: '31', prefName: '鳥取県' })
  })

  it('F37: 同じ地点の住所は保存したものを使い、もう一度は呼ばない', async () => {
    callApi.mockImplementation(async (_api: string, _path: string, query: { coord: string }) => reverseResponse(Number(query.coord.split(',')[0])))
    await routeAreaSamples(LINE)
    const count = callApi.mock.calls.length
    await routeAreaSamples(LINE)
    expect(callApi).toHaveBeenCalledTimes(count)
  })

  it('F39: 住所が分からない地点（応答が空）は除いて続ける', async () => {
    callApi.mockImplementation(async (_api: string, _path: string, query: { coord: string }) => {
      const lat = Number(query.coord.split(',')[0])
      return lat > 34.2 && lat < 34.4 ? { items: [] } : reverseResponse(lat)
    })
    const samples = await routeAreaSamples(LINE)
    expect(samples.length).toBeLessThan(sampleRoute(LINE).length)
    expect(samples.every((s) => s.prefCode !== '')).toBe(true)
  })
})

describe('市区町村の一覧', () => {
  it('E32: 都道府県の下の市区町村を、名前（都道府県名を除く）・中心の座標と一緒に返す。2回目は呼ばない', async () => {
    callApi.mockResolvedValue({
      total: 2,
      items: [
        { code: '33101', name: '岡山県岡山市北区', coord: { lat: 34.655, lon: 133.919 }, details: [] },
        { code: '33346', name: '岡山県和気郡和気町', coord: { lat: 34.8, lon: 134.15 }, details: [] },
      ],
    })
    const cities = await citiesOf(OKAYAMA)
    expect(cities).toEqual([
      { code: '33101', name: '岡山市北区', fullName: '岡山県岡山市北区', lat: 34.655, lon: 133.919 },
      { code: '33346', name: '和気郡和気町', fullName: '岡山県和気郡和気町', lat: 34.8, lon: 134.15 },
    ])
    await citiesOf(OKAYAMA)
    expect(callApi).toHaveBeenCalledTimes(1)
    expect(callApi).toHaveBeenCalledWith('geocoding', '/api/address-children', { code: '33', offset: '0' })
  })

  it('F41: 100件を超える都道府県（北海道）は、100件ずつ分けて受け取る', async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({ code: `01${start + i}`, name: `北海道町${start + i}`, coord: { lat: 43, lon: 141 } }))
    callApi.mockResolvedValueOnce({ total: 188, items: page(0, 100) }).mockResolvedValueOnce({ total: 188, items: page(100, 88) })
    const cities = await citiesOf({ code: '01', name: '北海道' })
    expect(cities).toHaveLength(188)
    expect(callApi.mock.calls.map((c) => c[2].offset)).toEqual(['0', '100'])
  })
})

describe('ルート沿い・市区町村の中・都道府県全体から探す', () => {
  const samples: AreaSample[] = sampleRoute(LINE).map((s) => ({
    ...s,
    prefCode: s.lat < 34.5 ? '33' : '31',
    prefName: s.lat < 34.5 ? '岡山県' : '鳥取県',
    cityCode: '',
    cityName: '',
  }))

  it('E31: その都道府県の中で、ルートから10km以内のものを、ルートから近い順に出す。重なった結果は1つにする', async () => {
    callApi.mockResolvedValue({
      items: [
        spot('h1', '遠いホテル', '岡山県岡山市北区1', 34.2, 134.09), // ルートから約9.2km
        spot('h2', '近いホテル', '岡山県岡山市北区2', 34.25, 134.01), // 約0.9km
        spot('h3', '離れすぎのホテル', '岡山県岡山市北区3', 34.2, 134.15), // 約14km
        spot('h4', '鳥取のホテル', '鳥取県鳥取市1', 34.2, 134.01),
      ],
    })
    const places = await searchAlongRoute('hotel', LINE, samples, OKAYAMA)
    expect(places.map((p) => p.name)).toEqual(['近いホテル', '遠いホテル'])
    expect(places[0]!.distanceMeters).toBeGreaterThan(800)
    expect(places[0]!.distanceMeters).toBeLessThan(1000)
    expect(callApi.mock.calls.every((c) => c[1] === '/api/spot-nearby' && c[2].radius === '10000' && c[2].kind === 'hotel')).toBe(true)
    expect(callApi.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('E32: 市区町村の中は、中心から10km以内で住所がその市区町村のものだけを、中心から近い順に出す', async () => {
    callApi.mockResolvedValue({
      items: [
        spot('h1', '北区のホテル', '岡山県岡山市北区1', 34.66, 133.92, '0608001', 300),
        spot('h2', '南区のホテル', '岡山県岡山市南区1', 34.64, 133.92, '0608001', 900),
      ],
    })
    const city = { code: '33101', name: '岡山市北区', fullName: '岡山県岡山市北区', lat: 34.655, lon: 133.919 }
    const places = await searchInCity('hotel', city)
    expect(places.map((p) => [p.name, p.distanceMeters])).toEqual([['北区のホテル', 300]])
    expect(callApi).toHaveBeenCalledWith('spot', '/api/spot-nearby', { kind: 'hotel', coord: '34.65500,133.91900', radius: '10000' })
  })

  it('E33: 通らない都道府県は「都道府県名 ホテル」の100件から、住所がその都道府県の宿泊施設だけを、人気の順のまま出す', async () => {
    callApi.mockResolvedValue({
      items: [
        spot('h1', '高松のホテル', '香川県高松市1', 34.34, 134.05),
        spot('h2', '香川県のラーメン店', '香川県高松市2', 34.34, 134.05, '0302001'),
        spot('h3', '岡山のホテル', '岡山県岡山市北区1', 34.66, 133.92),
        spot('h4', '琴平の旅館', '香川県仲多度郡琴平町1', 34.19, 133.82, '0603001'),
      ],
    })
    const places = await searchPopular('hotel', KAGAWA)
    expect(places.map((p) => p.name)).toEqual(['高松のホテル', '琴平の旅館'])
    expect(callApi).toHaveBeenCalledWith('spot', '/api/spot', { word: '香川県 ホテル', limit: '100' })
  })

  it('E34: 都道府県全体のグルメは「都道府県名 グルメ」で探し、飲食店だけを残す。名前に都道府県名が入っているだけのものは除く', async () => {
    callApi.mockResolvedValue({
      items: [
        spot('m1', 'うどん屋', '香川県高松市1', 34.34, 134.05, '0302001'),
        spot('m2', '○○店(香川県)', '香川県高松市2', 34.34, 134.05, '0302001'),
        spot('m3', '栗林公園', '香川県高松市3', 34.33, 134.04, '0702001'),
      ],
    })
    expect((await searchPopular('meal', KAGAWA)).map((p) => p.name)).toEqual(['うどん屋'])
    expect(callApi).toHaveBeenCalledWith('spot', '/api/spot', { word: '香川県 グルメ', limit: '100' })
  })

  it('E34: 都道府県全体の観光は都道府県名で探し、観光・文化施設だけを残す', async () => {
    callApi.mockResolvedValue({
      items: [spot('m1', 'うどん屋', '香川県高松市1', 34.34, 134.05, '0302001'), spot('m3', '栗林公園', '香川県高松市3', 34.33, 134.04, '0702001')],
    })
    expect((await searchPopular('sightseeing', KAGAWA)).map((p) => p.name)).toEqual(['栗林公園'])
    expect(callApi).toHaveBeenCalledWith('spot', '/api/spot', { word: '香川県', limit: '100' })
  })

  it('E35: 言葉で探すとき、都道府県を選んでいれば言葉の頭に都道府県名を付け、住所がその都道府県のものだけを出す。全国なら言葉のまま', async () => {
    callApi.mockResolvedValue({
      items: [spot('r1', '香川のラーメン', '香川県高松市1', 34.34, 134.05, '0302001'), spot('r2', '岡山のラーメン', '岡山県岡山市北区1', 34.66, 133.92, '0302001')],
    })
    expect((await searchWordIn('ラーメン', KAGAWA)).map((p) => p.name)).toEqual(['香川のラーメン'])
    expect(callApi).toHaveBeenLastCalledWith('spot', '/api/spot', { word: '香川県 ラーメン', limit: '100' })
    expect(await searchWordIn('ラーメン', null)).toHaveLength(2)
    expect(callApi).toHaveBeenLastCalledWith('spot', '/api/spot', { word: 'ラーメン' })
  })
})
