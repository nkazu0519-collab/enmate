// 作成・編集ページの入力（PlanForm）と、保存するプラン（Plan）の変換。
import type { Leg, Plan, PlanForm } from '../types/plan'
import { DEFAULT_HOTEL_ARRIVE_BY, DEFAULT_HOTEL_DEPART_AT, defaultPlanName, hotelAfterOf } from './legs'

function samePoint(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return a.lat === b.lat && a.lon === b.lon
}

// 保存したプランを、編集の入力に戻す。段階2までに保存したプラン（宿泊の時刻を持たない）は初期値で開く
export function formFromPlan(plan: Plan): PlanForm {
  const hotelBefore = plan.hotelsBefore[0] ?? null
  const hotelAfter = plan.hotelsAfter[0] ?? null
  return {
    name: plan.name,
    home: plan.home,
    venue: plan.venue,
    matchDate: plan.matchDate,
    arriveBy: plan.arriveBy,
    matchEnd: plan.matchEnd,
    exitMinutes: plan.exitMinutes,
    stops: Object.fromEntries(plan.legs.map((leg) => [leg.id, leg.stops])),
    restIntervalMinutes: plan.restIntervalMinutes,
    stayBefore: !!hotelBefore,
    hotelBefore,
    hotelBeforeArriveBy: plan.hotelBeforeArriveBy ?? DEFAULT_HOTEL_ARRIVE_BY,
    stayAfter: !!hotelAfter,
    // 前泊と同じ場所に後泊していれば「前日と同じ宿泊先に泊まる」。前泊しないときは初期値（オン）のまま
    sameHotel: !hotelBefore || !hotelAfter || samePoint(hotelBefore, hotelAfter),
    hotelAfter: hotelBefore && hotelAfter && samePoint(hotelBefore, hotelAfter) ? null : hotelAfter,
    hotelAfterDepartAt: plan.hotelAfterDepartAt ?? DEFAULT_HOTEL_DEPART_AT,
  }
}

// 入力と計算結果つきの区間から、保存するプランを作る。入力チェックを通った条件で呼ぶ
export function planFromForm(form: PlanForm, legs: Leg[], base: { id: string; now: string; createdAt?: string }): Plan {
  const hotelAfter = hotelAfterOf(form)
  return {
    id: base.id,
    name: form.name.trim() || defaultPlanName(form.venue!.name, form.matchDate),
    home: form.home!,
    venue: form.venue!,
    matchDate: form.matchDate,
    arriveBy: form.arriveBy,
    matchEnd: form.matchEnd,
    exitMinutes: form.exitMinutes,
    restIntervalMinutes: form.restIntervalMinutes,
    hotelsBefore: form.stayBefore && form.hotelBefore ? [form.hotelBefore] : [],
    hotelsAfter: hotelAfter ? [hotelAfter] : [],
    ...(form.stayBefore ? { hotelBeforeArriveBy: form.hotelBeforeArriveBy } : {}),
    ...(form.stayAfter ? { hotelAfterDepartAt: form.hotelAfterDepartAt } : {}),
    legs,
    createdAt: base.createdAt ?? base.now,
    updatedAt: base.now,
    schemaVersion: 1,
  }
}
