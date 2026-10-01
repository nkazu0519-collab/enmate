import type { Place, PlanForm } from '../app/types/plan'

// テスト用の保存領域。failOnSet を true にすると、保存に失敗する状態を再現できる
export class FakeStorage implements Storage {
  private items = new Map<string, string>()
  failOnSet = false

  get length() {
    return this.items.size
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failOnSet) throw new Error('QuotaExceededError')
    this.items.set(key, value)
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  clear() {
    this.items.clear()
  }
}

export const NIIGATA: Place = { name: '新潟駅', lat: 37.9122, lon: 139.0617 }
export const NAGANO: Place = { name: '長野Uスタジアム', lat: 36.5806, lon: 138.1672 }

export function formOf(overrides: Partial<PlanForm> = {}): PlanForm {
  return {
    name: '',
    home: NIIGATA,
    venue: NAGANO,
    matchDate: '2026-10-10',
    arriveBy: '12:00',
    matchEnd: '17:00',
    exitMinutes: 45,
    stops: {},
    restIntervalMinutes: 120,
    stayBefore: false,
    hotelBefore: null,
    hotelBeforeArriveBy: '18:00',
    stayAfter: false,
    sameHotel: true,
    hotelAfter: null,
    hotelAfterDepartAt: '10:00',
    ...overrides,
  }
}
