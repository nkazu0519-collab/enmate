// RapidAPI 版の NAVITIME Route(car) で、設計書 §12.1 の項目が使えるかを確かめる。
// 実行: node --env-file=.env.local scripts/check-route-car.mjs
// 2回呼ぶので、無料枠（月500アクセス）を2回分使う。APIキーは表示しない。

const key = process.env.RAPIDAPI_KEY;
if (!key) {
  console.error(".env.local に RAPIDAPI_KEY がありません");
  process.exit(1);
}

const HOST = "navitime-route-car.p.rapidapi.com";

// 新潟駅 → シティライトスタジアム（岡山）。途中で金沢駅に30分寄る
const NIIGATA = "37.9122,139.0617";
const OKAYAMA = "34.6698,133.9111";
const VIA = JSON.stringify([{ lat: 36.5781, lon: 136.6481, "stay-time": 30 }]);

async function call(label, params) {
  const url = `https://${HOST}/route_car?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
  });
  const body = await res.json().catch(() => null);
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  console.log(`\n=== ${label} ===`);
  console.log(`HTTP ${res.status} / 今月の残り: ${remaining ?? "（ヘッダーなし）"}`);
  if (!res.ok || !body) {
    console.log("エラー応答:", JSON.stringify(body)?.slice(0, 500));
    return null;
  }
  if (process.env.DUMP_DIR) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${process.env.DUMP_DIR}/${label.slice(0, 1)}.json`, JSON.stringify(body, null, 2));
  }
  const item = body.items?.[0];
  console.log("応答の項目:", Object.keys(item ?? body).join(", "));
  return item;
}

// A: 行きの検索（到着時刻・線の形・経由地）。確認済みなら ONLY_B=1 で飛ばす
const a = process.env.ONLY_B ? null : await call("A: goal_time + shape + via", {
  start: NIIGATA,
  goal: OKAYAMA,
  goal_time: "2026-10-03T12:00:00",
  shape: "true",
  via: VIA,
});
if (a) {
  console.log("summary.move:", JSON.stringify(a.summary?.move)?.slice(0, 300));
  console.log("shapes あり:", Boolean(a.shapes));
  const viaPoint = a.sections?.find((s) => s.type === "point" && s.name !== "start" && s.name !== "goal");
  console.log("経由地の区間（先頭の1つ）:", JSON.stringify(viaPoint)?.slice(0, 300));
}

// B: 帰りの検索（出発時刻・休憩候補・SA/PA）
const b = await call("B: start_time + continuous_driving_time + divide_with", {
  start: OKAYAMA,
  goal: NIIGATA,
  start_time: "2026-10-03T17:45:00",
  continuous_driving_time: "120",
  options: "turn_by_turn",
  divide_with: "sa.pa", // 複数指定はピリオド区切り（公式仕様）
});
if (b) {
  console.log("recommend_spot あり:", Boolean(b.recommend_spot));
  console.log("recommend_spot（先頭）:", JSON.stringify(b.recommend_spot)?.slice(0, 300));
  const saPa = (b.sections ?? []).filter((s) => s.sapa_type); // SA/PA の地点には sapa_type（"SA"/"PA"）が付く
  console.log(`SA/PA らしき区間: ${saPa.length}件`, saPa.slice(0, 3).map((s) => s.name).join(" / "));
}
