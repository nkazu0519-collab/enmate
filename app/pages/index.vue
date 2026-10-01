<script setup lang="ts">
// トップ画面。これからの遠征をチケットとして並べ、終わった遠征は半券としてたたんでしまっておく
import { daysBetween, formatDateJa, formatDistance, formatYen, timeFromDate, todayLocal } from '~/utils/datetime'
import { collectionTotals, groupByYear, homeTimes, planTotals } from '~/utils/planSummary'
import { loadPlans, splitForList } from '~/utils/planStore'

useHead({ title: 'えんメイト' })

const today = todayLocal()
const { plans: loaded, problem } = loadPlans()
const { upcoming, done } = splitForList(loaded, today)
const totals = collectionTotals(done)
const years = groupByYear(done)

function stubDate(matchDate: string): string {
  const [, mo = '', d = ''] = matchDate.split('-')
  return `${Number(mo)}.${Number(d)}`
}
</script>

<template>
  <div class="top">
    <section class="hero">
      <div class="beam beam-left" aria-hidden="true" />
      <div class="beam beam-right" aria-hidden="true" />
      <div class="lamp lamp-left" aria-hidden="true" />
      <div class="lamp lamp-right" aria-hidden="true" />
      <div class="hero-copy">
        <p class="eyebrow">AWAY DAYS</p>
        <h1 class="hero-title">スタンドまで、<br><em>一本道。</em></h1>
        <p class="hero-lead">会場に着きたい時刻から、家を出る時刻を逆算。<br>帰り道まで、まとめて1枚に。</p>
        <NuxtLink to="/plans/new" class="cta">
          {{ loaded.length > 0 ? '＋ 遠征チケットを作る' : '＋ はじめての遠征チケットを作る' }}
        </NuxtLink>
      </div>
    </section>

    <div class="page stack">
      <p v-if="problem === 'unavailable'" class="notice notice-error" role="alert">
        このブラウザでは保存領域が使えないため、プランを保存できません。プライベートブラウズを使っていないか、ブラウザの設定を確かめてください。
      </p>
      <p v-else-if="problem === 'broken'" class="notice notice-error" role="alert">
        保存データの一部を読み込めませんでした。読み込めたプランだけを表示しています。
      </p>

      <section>
        <h2 class="sec-title">MY TICKETS <small>これからの遠征</small></h2>
        <ul v-if="upcoming.length > 0" class="tickets">
          <li v-for="plan in upcoming" :key="plan.id">
            <NuxtLink :to="`/plans/${plan.id}`" class="ticket">
              <div class="ticket-main">
                <p class="ticket-date">{{ formatDateJa(plan.matchDate) }}</p>
                <p class="ticket-name">{{ plan.name }}</p>
                <p class="ticket-meta">{{ plan.home.name }} → {{ plan.venue.name }}</p>
                <p v-if="homeTimes(plan).departAt" class="ticket-meta">
                  出発 {{ timeFromDate(homeTimes(plan).departAt!, plan.matchDate) }}
                  <template v-if="homeTimes(plan).homeAt">／ 帰着 {{ timeFromDate(homeTimes(plan).homeAt!, plan.matchDate) }}</template>
                </p>
              </div>
              <div class="ticket-stub">
                <template v-if="daysBetween(today, plan.matchDate) === 0">
                  <span class="stub-small">いよいよ</span><span class="stub-num stub-today">今日</span>
                </template>
                <template v-else>
                  <span class="stub-small">あと</span>
                  <span class="stub-num">{{ daysBetween(today, plan.matchDate) }}</span>
                  <span class="stub-unit">日</span>
                </template>
              </div>
            </NuxtLink>
          </li>
        </ul>
        <p v-else-if="problem !== 'unavailable'" class="empty">
          {{ done.length > 0 ? 'これからの遠征はまだありません。次の遠征チケットを作りましょう。' : 'まだチケットがありません。作ったチケットは、ここに並びます。' }}
        </p>
      </section>

      <details v-if="done.length > 0" class="holder">
        <summary>
          <span class="pile" aria-hidden="true">
            <i v-for="(plan, i) in done.slice(0, 5)" :key="plan.id" :style="{ '--i': i }" />
          </span>
          <span class="holder-title">COLLECTION<small>遠征完了済み・{{ done.length }}枚の半券</small></span>
          <span class="chev" aria-hidden="true">▼</span>
        </summary>
        <div class="holder-body">
          <div class="stats">
            <div class="stat"><p class="stat-v">{{ totals.count }}<small>回</small></p><p class="stat-l">行った遠征</p></div>
            <div class="stat"><p class="stat-v">{{ formatDistance(totals.distanceMeters) }}</p><p class="stat-l">走った距離</p></div>
            <div class="stat"><p class="stat-v stat-yen">{{ formatYen(totals.tollYen) }}</p><p class="stat-l">高速料金の合計</p></div>
          </div>
          <section v-for="group in years" :key="group.year">
            <h3 class="year">{{ group.year }}</h3>
            <ul class="stubs">
              <li v-for="plan in group.plans" :key="plan.id">
                <NuxtLink :to="`/plans/${plan.id}`" class="half">
                  <p class="half-date">{{ stubDate(plan.matchDate) }}</p>
                  <p class="half-name">{{ plan.name }}</p>
                  <p class="half-venue">{{ plan.venue.name }}</p>
                  <p class="half-km">往復 {{ formatDistance(planTotals(plan).distanceMeters) }}</p>
                  <span class="half-stamp" aria-hidden="true">遠征<br>完了</span>
                </NuxtLink>
              </li>
            </ul>
          </section>
        </div>
      </details>

      <div class="usage-wrap">
        <UsageNote />
      </div>
    </div>
  </div>
</template>

<style scoped>
.top {
  --night: #0d1530;
  --night-card: #121b40;
  --night-line: #26326a;
  --lime: #b6ff3b;
  --paper: #fdfbf3;
  --ticket-accent: #e8383d;
  min-height: calc(100dvh - var(--header-height));
  background: var(--night);
  color: #e8ecff;
}

/* ===== ヒーロー（ナイター照明のスタジアム） ===== */
.hero {
  position: relative;
  overflow: hidden;
  padding: 0 16px 32px;
  background:
    radial-gradient(ellipse 120% 22% at 50% 100%, #1f6b3a 0 60%, transparent 62%),
    linear-gradient(180deg, #050a1c, var(--night));
  text-align: center;
}

.beam {
  position: absolute;
  top: -40px;
  width: 340px;
  height: 560px;
  opacity: 0.35;
  background: conic-gradient(from 160deg at 50% 0, transparent 0deg, #fffbe0 10deg, transparent 22deg);
  transform-origin: 50% 0;
  animation: sway 5s ease-in-out infinite alternate;
}

.beam-left {
  left: -120px;
}

.beam-right {
  right: -120px;
  transform: scaleX(-1);
  animation-delay: -2.5s;
}

@keyframes sway {
  from {
    rotate: -6deg;
  }
  to {
    rotate: 6deg;
  }
}

.lamp {
  position: absolute;
  top: 20px;
  width: 70px;
  height: 18px;
  border-radius: 4px;
  background: repeating-linear-gradient(90deg, #fffbe0 0 8px, #b9b28a 8px 10px);
  box-shadow: 0 0 30px 10px rgba(255, 251, 224, 0.5);
}

.lamp-left {
  left: 14%;
}

.lamp-right {
  right: 14%;
}

.hero-copy {
  position: relative;
  z-index: 1;
  padding-top: 72px;
}

.eyebrow {
  display: inline-block;
  padding: 2px 10px;
  border: 1px solid var(--lime);
  border-radius: 4px;
  color: var(--lime);
  font-size: 0.75rem;
  letter-spacing: 0.25em;
}

.hero-title {
  margin-top: 14px;
  font-family: 'Dela Gothic One', sans-serif;
  font-weight: 400;
  font-size: clamp(1.8rem, 6.5vw, 2.6rem);
  line-height: 1.3;
}

.hero-title em {
  font-style: normal;
  color: var(--lime);
}

.hero-lead {
  margin-top: 10px;
  color: #aab4d9;
  font-size: 0.9rem;
}

.cta {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 420px;
  min-height: 60px;
  margin: 22px auto 0;
  border-radius: 12px;
  background: var(--lime);
  color: var(--night);
  font-weight: 900;
  font-size: 1.05rem;
  text-decoration: none;
  box-shadow: 0 0 0 4px rgba(182, 255, 59, 0.2), 0 0 30px rgba(182, 255, 59, 0.35);
}

.cta:hover {
  filter: brightness(1.06);
}

/* ===== これからの遠征（チケット） ===== */
.sec-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
  font-family: 'Dela Gothic One', sans-serif;
  font-weight: 400;
  font-size: 1.05rem;
  letter-spacing: 0.1em;
  color: #fff;
}

.sec-title small {
  font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  color: #7c86ad;
}

.tickets,
.stubs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tickets {
  display: grid;
  gap: 14px;
}

.ticket {
  display: grid;
  grid-template-columns: 1fr 96px;
  color: #1a1f33;
  text-decoration: none;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
}

.ticket:hover .ticket-name {
  text-decoration: underline;
}

.ticket-main {
  position: relative;
  padding: 12px 14px 12px 18px;
  border-radius: 12px 0 0 12px;
  background: var(--paper);
}

.ticket-main::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  border-radius: 12px 0 0 12px;
  background: var(--ticket-accent);
}

.ticket-date {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: #7a7f93;
}

.ticket-name {
  font-weight: 900;
  font-size: 1.05rem;
  line-height: 1.4;
}

.ticket-meta {
  margin-top: 2px;
  font-size: 0.8rem;
  color: #4a5068;
}

/* 切り取り線の上下に丸い切り欠きを入れる */
.ticket-stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  border-left: 2px dashed #c9c3ad;
  border-radius: 0 12px 12px 0;
  background: var(--paper);
  line-height: 1.2;
  -webkit-mask:
    radial-gradient(circle 9px at 0 0, transparent 98%, #000) top left / 100% 51% no-repeat,
    radial-gradient(circle 9px at 0 100%, transparent 98%, #000) bottom left / 100% 51% no-repeat;
  mask:
    radial-gradient(circle 9px at 0 0, transparent 98%, #000) top left / 100% 51% no-repeat,
    radial-gradient(circle 9px at 0 100%, transparent 98%, #000) bottom left / 100% 51% no-repeat;
}

.stub-small {
  font-size: 0.7rem;
  color: #7a7f93;
}

.stub-num {
  font-family: 'Dela Gothic One', sans-serif;
  font-size: 2rem;
  color: var(--ticket-accent);
}

.stub-today {
  font-size: 1.3rem;
}

.stub-unit {
  font-size: 0.75rem;
  font-weight: 700;
}

.empty {
  color: #aab4d9;
  font-size: 0.9rem;
}

/* ===== 完了済み（半券ホルダー） ===== */
.holder {
  margin-top: 32px;
}

.holder > summary {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--night-line);
  border-radius: 14px;
  background: var(--night-card);
  list-style: none;
  cursor: pointer;
}

.holder > summary::-webkit-details-marker {
  display: none;
}

.holder > summary:hover {
  border-color: var(--lime);
}

.holder[open] > summary {
  border-radius: 14px 14px 0 0;
}

.pile {
  position: relative;
  flex: none;
  width: 64px;
  height: 46px;
}

.pile i {
  position: absolute;
  top: 4px;
  left: calc(var(--i) * 6px);
  width: 34px;
  height: 40px;
  border-top: 5px solid var(--ticket-accent);
  border-radius: 5px;
  background: #efe9d6;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transform: rotate(calc(var(--i) * 6deg - 12deg));
  transition: transform 0.25s;
}

.holder > summary:hover .pile i {
  transform: rotate(calc(var(--i) * 9deg - 18deg)) translateY(-2px);
}

.holder-title {
  flex: 1;
  font-family: 'Dela Gothic One', sans-serif;
  letter-spacing: 0.1em;
  line-height: 1.4;
  color: #fff;
}

.holder-title small {
  display: block;
  font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  color: #8d97c4;
}

.chev {
  color: var(--lime);
  transition: transform 0.2s;
}

.holder[open] .chev {
  transform: rotate(180deg);
}

.holder-body {
  padding: 14px 4px 4px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat {
  padding: 10px 6px;
  border: 1px solid var(--night-line);
  border-radius: 12px;
  background: #16204a;
  text-align: center;
  line-height: 1.25;
}

.stat-v {
  font-family: 'Dela Gothic One', sans-serif;
  font-size: 1.3rem;
  color: var(--lime);
}

.stat-v small {
  margin-left: 2px;
  font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
  font-size: 0.7rem;
  color: #aab4d9;
}

.stat-yen {
  font-size: 1rem;
  line-height: 1.65;
}

.stat-l {
  margin-top: 4px;
  font-size: 0.7rem;
  color: #8d97c4;
}

.year {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 10px;
  font-family: 'Dela Gothic One', sans-serif;
  font-weight: 400;
  font-size: 0.95rem;
  color: #5d6898;
}

.year::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--night-line);
}

.stubs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px 12px;
}

.half {
  position: relative;
  display: block;
  height: 100%;
  padding: 10px 12px 12px 14px;
  border-top: 6px solid var(--ticket-accent);
  border-radius: 8px;
  background: #efe9d6;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  color: #2a2f45;
  text-decoration: none;
}

/* ちぎった跡 */
.half::before {
  content: '';
  position: absolute;
  right: 0;
  bottom: -6px;
  left: 0;
  height: 8px;
  background: radial-gradient(circle at 5px 0, var(--night) 4px, transparent 4.5px) 0 0 / 10px 8px repeat-x;
}

.stubs li:nth-child(3n + 1) .half {
  transform: rotate(-1.2deg);
}

.stubs li:nth-child(3n + 2) .half {
  transform: rotate(0.8deg);
}

.half-date {
  font-family: 'Dela Gothic One', sans-serif;
  font-size: 1.1rem;
  line-height: 1.2;
}

.half-name {
  margin-top: 4px;
  font-weight: 900;
  font-size: 0.85rem;
  line-height: 1.35;
}

.half-venue {
  font-size: 0.7rem;
  line-height: 1.4;
  color: #6a6f85;
}

.half-km {
  margin-top: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #4a5068;
}

.half-stamp {
  position: absolute;
  right: 8px;
  bottom: 6px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 2px solid #c43d3d;
  border-radius: 50%;
  color: #c43d3d;
  font-weight: 900;
  font-size: 0.62rem;
  line-height: 1.1;
  text-align: center;
  opacity: 0.8;
  transform: rotate(14deg);
}

/* 暗い背景の上でも読めるよう、使用回数の文字を明るくする */
.usage-wrap {
  margin-top: 28px;
}

.usage-wrap :deep(.muted) {
  color: #7c86ad;
}

@media (prefers-reduced-motion: reduce) {
  .beam,
  .pile i,
  .chev {
    animation: none;
    transition: none;
  }
}
</style>
