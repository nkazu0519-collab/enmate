import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plan } from '../app/types/plan'
import { planFileName, planToFileText, readPlanFile } from '../app/utils/planFile'
import { passphraseProblem } from '../server/utils/passphrase'
import { FakeStorage, NAGANO, NIIGATA } from './helpers'

vi.mock('~/composables/useUsage', () => ({ notifyUsageChanged: () => {} }))
const { ApiError, callApi } = await import('../app/services/api')

function planOf(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'mg1abc2def',
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
    legs: [
      {
        id: 'outbound',
        label: '行き',
        from: NIIGATA,
        to: NAGANO,
        timeRule: 'arriveBy',
        time: '2026-10-10T12:00:00',
        stops: [],
        result: {
          departAt: '2026-10-10T09:10:00',
          arriveAt: '2026-10-10T12:00:00',
          driveMinutes: 170,
          distanceMeters: 210000,
          tollYen: 4800,
          trafficConsidered: false,
          restAreas: [],
          shape: [
            [37.91, 139.06],
            [36.58, 138.17],
          ],
          calculatedAt: '2026-10-01T05:00:00.000Z',
          inputHash: 'x',
        },
      },
    ],
    createdAt: '2026-10-01T05:00:00.000Z',
    updatedAt: '2026-10-01T05:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  }
}

const fileOf = (body: Record<string, unknown>) => JSON.stringify({ app: 'enmate', schemaVersion: 1, exportedAt: '2026-10-02T00:00:00.000Z', ...body })

describe('プランの書き出し・読み込み', () => {
  it('E36: 書き出したファイルを読み込むと、計算結果も含めて同じプランに戻る', () => {
    const plan = planOf()
    const result = readPlanFile(planToFileText(plan))
    expect(result).toEqual({ ok: true, plan })
  })

  it('E36: ファイル名は「enmate_試合日_プラン名.json」で、ファイル名に使えない文字は除く', () => {
    expect(planFileName(planOf())).toBe('enmate_2026-10-10_長野Uスタジアム 遠征 1010.json')
    expect(planFileName(planOf({ name: '  ' }))).toBe('enmate_2026-10-10.json')
  })

  it('F55: JSON でないファイルは読み込まず、理由を出す', () => {
    const result = readPlanFile('これは JSON ではない')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('えんメイトで書き出したファイルではありません')
  })

  it('F56: 別のアプリの JSON や、保存領域の中身（プランの配列）をそのまま渡しても読み込まない', () => {
    for (const text of ['{"name":"別のアプリ"}', JSON.stringify([planOf()]), JSON.stringify(planOf()), 'null', '123']) {
      const result = readPlanFile(text)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.message).toBe('えんメイトで書き出したファイルではありません。')
    }
  })

  it('F57: 新しい版のえんメイトで書き出したファイルは、そう分かるように断る', () => {
    const result = readPlanFile(fileOf({ schemaVersion: 2, plan: planOf() }))
    expect(!result.ok && result.message).toContain('新しい版')
  })

  it('F58: 中身が欠けたプラン（区間の出発地がない、宿泊先が配列でない）は読み込まない', () => {
    const noFrom = planOf()
    delete (noFrom.legs[0] as Partial<Plan['legs'][number]>).from
    for (const plan of [noFrom, { ...planOf(), hotelsAfter: null }, undefined]) {
      const result = readPlanFile(fileOf({ plan }))
      expect(!result.ok && result.message).toContain('欠けているか、壊れている')
    }
  })

  it('F59: ページの URL に使えない ID のプランは読み込まない', () => {
    for (const id of ['../x', 'a/b', '', 'a'.repeat(65)]) {
      expect(readPlanFile(fileOf({ plan: planOf({ id }) })).ok).toBe(false)
    }
  })
})

describe('合言葉（サーバー側）', () => {
  it('F60: 公開したサーバーで合言葉を設定し忘れたら、誰でも呼べる状態にせず中継を止める', () => {
    expect(passphraseProblem(undefined, undefined, false)).toBe('config')
    expect(passphraseProblem('', 'x', false)).toBe('config')
  })

  it('開発サーバーで合言葉を設定していなければ、確かめない', () => {
    expect(passphraseProblem(undefined, undefined, true)).toBe('')
  })

  it('F61: 合言葉がない・違うときは断り、合っていれば通す', () => {
    expect(passphraseProblem('ultras2026', undefined, false)).toBe('passphrase')
    expect(passphraseProblem('ultras2026', 'ultras2025', false)).toBe('passphrase')
    expect(passphraseProblem('ultras2026', 'ultras2026', false)).toBe('')
  })

  it('F61: 日本語の合言葉も、URL エンコードして送れば一致する', () => {
    expect(passphraseProblem('アウェイ遠征', encodeURIComponent('アウェイ遠征'), false)).toBe('')
    expect(passphraseProblem('アウェイ遠征', 'アウェイ遠征', false)).toBe('passphrase')
  })
})

describe('合言葉（ブラウザ側）', () => {
  const fetchMock = vi.fn()
  const promptMock = vi.fn()
  let store: FakeStorage
  const passphraseError = () => Object.assign(new Error('401'), { data: { data: { kind: 'passphrase' } } })
  const headerOf = (call: number) => (fetchMock.mock.calls[call]![1] as { headers: Record<string, string> }).headers['x-enmate-passphrase']

  beforeEach(() => {
    store = new FakeStorage()
    vi.stubGlobal('localStorage', store)
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('window', { prompt: promptMock })
    fetchMock.mockReset()
    promptMock.mockReset()
  })

  it('E37: 保存した合言葉を付けて呼び、聞き直さない', async () => {
    store.setItem('enmate:passphrase', 'アウェイ遠征')
    fetchMock.mockResolvedValue({ items: [], remaining: 400, limit: 500 })
    await callApi('spot', '/api/spot', { word: '新潟' })
    expect(headerOf(0)).toBe(encodeURIComponent('アウェイ遠征'))
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('E38: 合言葉を聞かれて正しく入れると、もう一度だけ呼んで結果を使い、合言葉を保存する', async () => {
    fetchMock.mockRejectedValueOnce(passphraseError()).mockResolvedValueOnce({ items: ['ok'], remaining: 400, limit: 500 })
    promptMock.mockReturnValue(' ultras2026 ')
    await expect(callApi('spot', '/api/spot', { word: '新潟' })).resolves.toMatchObject({ items: ['ok'] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(headerOf(1)).toBe('ultras2026')
    expect(store.getItem('enmate:passphrase')).toBe('ultras2026')
  })

  it('F62: 入れた合言葉も違えば、聞くのは1回だけで、保存せず、使用回数も数えない', async () => {
    fetchMock.mockRejectedValue(passphraseError())
    promptMock.mockReturnValue('まちがい')
    const error = await callApi('route', '/api/route', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as InstanceType<typeof ApiError>).kind).toBe('passphrase')
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getItem('enmate:passphrase')).toBeNull()
    expect(store.getItem('enmate:usage')).toBeNull()
  })

  it('F62: 合言葉の入力を取り消したら、呼び直さない', async () => {
    fetchMock.mockRejectedValue(passphraseError())
    promptMock.mockReturnValue(null)
    await expect(callApi('route', '/api/route', {})).rejects.toMatchObject({ kind: 'passphrase' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
