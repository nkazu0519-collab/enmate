// プランのファイル書き出し・読み込み（設計書 §5.2・§5.4）。PCで作ったプランを、当日スマホで開くために使う。
import type { Plan } from '../types/plan'
import { isPlan } from './planStore'

const APP = 'enmate'
// これより大きいファイルは、プランの書き出しファイルではないとみなす（読み込みで画面が固まらないように）
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export type PlanFile = {
  app: typeof APP
  schemaVersion: 1
  exportedAt: string
  plan: Plan
}

export type ReadResult = { ok: true; plan: Plan } | { ok: false; message: string }

export function planToFileText(plan: Plan, now: Date = new Date()): string {
  const file: PlanFile = { app: APP, schemaVersion: 1, exportedAt: now.toISOString(), plan }
  return JSON.stringify(file, null, 2)
}

// ファイル名に使えない文字を除いた「試合日_プラン名.json」
export function planFileName(plan: Plan): string {
  const name = plan.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 40)
  return `enmate_${plan.matchDate}${name ? `_${name}` : ''}.json`
}

export function readPlanFile(text: string): ReadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: 'えんメイトで書き出したファイルではありません（JSON として読めませんでした）。' }
  }
  const file = parsed as Partial<PlanFile> | null
  if (!file || typeof file !== 'object' || file.app !== APP) {
    return { ok: false, message: 'えんメイトで書き出したファイルではありません。' }
  }
  if (typeof file.schemaVersion === 'number' && file.schemaVersion > 1) {
    return { ok: false, message: 'このファイルは、新しい版のえんメイトで書き出されています。このページを再読み込みしてから、もう一度読み込んでください。' }
  }
  // ID はページの URL に使うので、このアプリが作る形（英数字）に限る
  if (file.schemaVersion !== 1 || !isPlan(file.plan) || !/^[A-Za-z0-9_-]{1,64}$/.test(file.plan.id)) {
    return { ok: false, message: 'ファイルの中身が欠けているか、壊れているため読み込めませんでした。書き出し直したファイルを使ってください。' }
  }
  return { ok: true, plan: file.plan }
}
