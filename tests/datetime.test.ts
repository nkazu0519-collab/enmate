import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMinutes,
  daysBetween,
  formatDateJa,
  formatDistance,
  formatDuration,
  formatYen,
  nextSaturday,
  stripOffset,
  timeFromDate,
  timePart,
} from '../app/utils/datetime'

describe('時刻の足し引き', () => {
  it('分を足す', () => {
    expect(addMinutes('2026-10-10T17:00:00', 45)).toBe('2026-10-10T17:45:00')
  })

  it('F8: 0:00 をまたぐと翌日になる', () => {
    expect(addMinutes('2026-10-10T23:59:00', 1)).toBe('2026-10-11T00:00:00')
  })

  it('F8: 引くと前日になる', () => {
    expect(addMinutes('2026-10-10T00:10:00', -30)).toBe('2026-10-09T23:40:00')
  })

  it('うるう年の2月末をまたぐ', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })
})

describe('NAVITIME の時刻の読み取り', () => {
  it('+09:00 を外して、日本時間の部分だけにする', () => {
    expect(stripOffset('2026-10-10T09:20:22+09:00')).toBe('2026-10-10T09:20:22')
  })

  it('表示は分まで（秒は切り捨て）', () => {
    expect(timePart('2026-10-10T09:20:22')).toBe('09:20')
    expect(timePart('2026-10-10T00:00:00')).toBe('00:00')
  })
})

describe('表示', () => {
  it('日付に曜日を付ける', () => {
    expect(formatDateJa('2026-10-10')).toBe('10/10（土）')
    expect(formatDateJa('2026-10-01')).toBe('10/1（木）')
  })

  it('運転時間', () => {
    expect(formatDuration(159)).toBe('2時間39分')
    expect(formatDuration(120)).toBe('2時間')
    expect(formatDuration(45)).toBe('45分')
    expect(formatDuration(0)).toBe('0分')
  })

  it('距離と料金', () => {
    expect(formatDistance(213570)).toBe('214km')
    expect(formatDistance(850)).toBe('850m')
    expect(formatDistance(1_870_000)).toBe('1,870km')
    expect(formatYen(4920)).toBe('¥4,920')
  })
})

describe('試合日の初期値（次の土曜日）', () => {
  it('木曜日なら、その週の土曜日', () => {
    expect(nextSaturday('2026-10-01')).toBe('2026-10-03')
  })

  it('土曜日なら、1週間後の土曜日', () => {
    expect(nextSaturday('2026-10-03')).toBe('2026-10-10')
  })

  it('日曜日なら、6日後の土曜日', () => {
    expect(nextSaturday('2026-10-04')).toBe('2026-10-10')
  })
})

describe('チケットに出す日数と時刻', () => {
  it('試合日まであと何日かを数える（当日は0、過ぎたら負）', () => {
    expect(daysBetween('2026-10-01', '2026-10-12')).toBe(11)
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0)
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1)
  })

  it('月や年をまたいでも日数がずれない', () => {
    expect(daysBetween('2026-12-25', '2027-01-03')).toBe(9)
  })

  it('F16: 試合日から見て、前日の出発と翌日の帰着が分かる', () => {
    expect(timeFromDate('2026-10-10T04:50:00', '2026-10-10')).toBe('04:50')
    expect(timeFromDate('2026-10-09T23:40:00', '2026-10-10')).toBe('前日 23:40')
    expect(timeFromDate('2026-10-11T02:10:00', '2026-10-10')).toBe('翌 02:10')
    expect(timeFromDate('2026-10-12T01:00:00', '2026-10-10')).toBe('10/12 01:00')
  })
})
