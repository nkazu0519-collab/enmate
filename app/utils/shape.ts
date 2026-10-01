// ルートの形を、見た目がほぼ変わらない範囲で間引く（保存する量を減らすため）。

type Point = [number, number] // 緯度, 経度

const METERS_PER_DEGREE = 111_320

// 点 p から線分 a-b までの距離（メートル）。狭い範囲なので平面とみなして計算する
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const scaleX = Math.cos((a[0] * Math.PI) / 180) * METERS_PER_DEGREE
  const px = (p[1] - a[1]) * scaleX
  const py = (p[0] - a[0]) * METERS_PER_DEGREE
  const bx = (b[1] - a[1]) * scaleX
  const by = (b[0] - a[0]) * METERS_PER_DEGREE
  const lengthSquared = bx * bx + by * by
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared))
  return Math.hypot(px - t * bx, py - t * by)
}

// ずれが toleranceMeters 以内に収まるように点を減らす（Douglas-Peucker 法）。始点と終点は必ず残す
export function simplifyShape(points: Point[], toleranceMeters = 30): Point[] {
  if (points.length <= 2) return points.map(round)
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const ranges: [number, number][] = [[0, points.length - 1]]
  while (ranges.length > 0) {
    const [start, end] = ranges.pop()!
    let farthest = -1
    let maxDistance = toleranceMeters
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i]!, points[start]!, points[end]!)
      if (d > maxDistance) {
        maxDistance = d
        farthest = i
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true
      ranges.push([start, farthest], [farthest, end])
    }
  }
  return points.filter((_, i) => keep[i]).map(round)
}

// 小数5桁（約1m）に丸める
function round(p: Point): Point {
  return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]
}
