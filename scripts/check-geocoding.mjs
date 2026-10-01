// RapidAPI 版の NAVITIME Geocoding で、通る都道府県（設計書 §12.1）に使う項目を確かめる。
// 実行: node --env-file=.env scripts/check-geocoding.mjs
// 2回呼ぶので、無料枠（月500アクセス）を2回分使う（失敗した呼び出しも1回に数えられる）。APIキーは表示しない。

const key = process.env.RAPIDAPI_KEY;
if (!key) {
  console.error(".env に RAPIDAPI_KEY がありません");
  process.exit(1);
}

const HOST = "navitime-geocoding.p.rapidapi.com";

async function call(label, path, params) {
  const url = `https://${HOST}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
  });
  const body = await res.json().catch(() => null);
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  console.log(`\n=== ${label} ===`);
  console.log(`HTTP ${res.status} / 今月の残り: ${remaining ?? "（ヘッダーなし）"}`);
  if (process.env.DUMP_DIR && body) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${process.env.DUMP_DIR}/${label.slice(0, 1)}.json`, JSON.stringify(body, null, 2));
  }
  if (!res.ok || !body) {
    console.log("エラー応答:", JSON.stringify(body)?.slice(0, 500));
    return null;
  }
  return body;
}

// A: 逆ジオコーディング（シティライトスタジアムの座標 → 都道府県・市区町村）
const a = process.env.ONLY_B ? null : await call("A: reverse_geocoding", "/address/reverse_geocoding", { coord: "34.6698,133.9111" });
if (a) console.log("items[0]:", JSON.stringify(a.items?.[0])?.slice(0, 800));

// B: 住所検索（岡山県の中の市区町村の一覧。政令指定都市が区ごとに出るか）。
// code と level_from・level_to は一緒に使えない（HTTP 400）。code だけで、その下の住所が返る
const b = await call("B: address code=33", "/address", { code: "33", limit: "100" });
if (b) {
  console.log("count:", JSON.stringify(b.count));
  console.log("名前:", (b.items ?? []).map((i) => `${i.name}(${i.code})`).join(" / "));
  console.log("items[0]:", JSON.stringify(b.items?.[0])?.slice(0, 500));
}
