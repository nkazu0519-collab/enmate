<script setup lang="ts">
// トップ画面。これからの遠征をチケットとして並べ、終わった遠征は半券としてたたんでしまっておく
import { daysBetween, formatDateJa, formatDistance, formatYen, timeFromDate, todayLocal } from '~/utils/datetime'
import { collectionTotals, countdownOf, groupByYear, homeTimes, planTotals, stayLabel } from '~/utils/planSummary'
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
      <!-- 夜の高速を走り、地平線の先に会場の照明が光る（試合にもライブにも合うよう、会場は形をぼかす） -->
      <div class="scene" aria-hidden="true">
        <div class="stars" />
        <div class="glow" />
        <svg class="venue" viewBox="0 0 400 40" preserveAspectRatio="xMidYMax meet">
          <path d="M168 40 L172 26 Q200 18 228 26 L232 40 Z" fill="#0b1029" />
          <g fill="#0b1029"><rect x="160" y="8" width="2" height="32" /><rect x="238" y="8" width="2" height="32" /></g>
          <g fill="#fffbe0"><rect x="156" y="5" width="10" height="4" rx="1" /><rect x="234" y="5" width="10" height="4" rx="1" /></g>
        </svg>
        <svg class="ridge" viewBox="0 0 400 46" preserveAspectRatio="none">
          <path d="M0 46 L0 30 L40 14 L80 28 L120 8 L150 24 L170 30 L230 30 L260 18 L300 4 L340 22 L370 12 L400 26 L400 46 Z" fill="#0b1229" />
        </svg>
        <div class="road"><div class="plane"><div class="dash" /></div></div>
      </div>
      <div class="hero-copy">
        <p class="eyebrow">ROAD TO THE VENUE</p>
        <h1 class="hero-title">会場まで、<br><em>一本道。</em></h1>
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
                <p class="ticket-date">{{ formatDateJa(plan.matchDate) }}<small v-if="plan.hotelsBefore.length + plan.hotelsAfter.length > 0" class="ticket-stay">{{ stayLabel(plan) }}</small></p>
                <p class="ticket-name">{{ plan.name }}</p>
                <p class="ticket-meta">{{ plan.home.name }} → {{ plan.venue.name }}</p>
                <p v-if="homeTimes(plan).departAt" class="ticket-meta">
                  出発 {{ timeFromDate(homeTimes(plan).departAt!, plan.matchDate) }}
                  <template v-if="homeTimes(plan).homeAt">／ 帰着 {{ timeFromDate(homeTimes(plan).homeAt!, plan.matchDate) }}</template>
                </p>
              </div>
              <div class="ticket-stub">
                <template v-if="countdownOf(today, plan.matchDate).kind === 'today'">
                  <span class="stub-small">いよいよ</span><span class="stub-num stub-today">今日</span>
                </template>
                <template v-else-if="countdownOf(today, plan.matchDate).kind === 'during'">
                  <span class="stub-small">帰り着くまで</span><span class="stub-num stub-during">遠征中</span>
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

/* ===== ヒーロー（夜の高速、その先に会場の光） ===== */
.hero {
  position: relative;
  overflow: hidden;
  padding: 0 16px 270px;
  background: linear-gradient(180deg, #03060f 0%, #0a1230 52%, #1b2150 66%, var(--night) 100%);
  text-align: center;
}

.scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.stars {
  position: absolute;
  inset: 0 0 45% 0;
  opacity: 0.8;
  background-image:
    radial-gradient(1px 1px at 12% 18%, #fff, transparent),
    radial-gradient(1px 1px at 28% 8%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 44% 22%, #fff, transparent),
    radial-gradient(1px 1px at 63% 12%, #fff, transparent),
    radial-gradient(1px 1px at 78% 26%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 90% 9%, #fff, transparent),
    radial-gradient(1px 1px at 8% 40%, #fff, transparent),
    radial-gradient(1px 1px at 55% 38%, #fff, transparent),
    radial-gradient(1px 1px at 86% 44%, #fff, transparent),
    radial-gradient(1px 1px at 35% 46%, #fff, transparent),
    radial-gradient(1px 1px at 70% 3%, #fff, transparent),
    radial-gradient(1px 1px at 20% 30%, #fff, transparent);
}

/* 地平線の先の、会場の照明 */
.glow {
  position: absolute;
  left: 50%;
  bottom: 168px;
  width: 420px;
  height: 200px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse 50% 60% at 50% 100%, rgba(255, 236, 170, 0.75), rgba(255, 200, 120, 0.25) 45%, transparent 70%);
  animation: pulse 4s ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.75;
  }
  to {
    opacity: 1;
  }
}

.venue,
.ridge {
  position: absolute;
  left: 0;
  width: 100%;
}

.venue {
  bottom: 178px;
  height: 40px;
}

.ridge {
  bottom: 176px;
  height: 46px;
}

/* 奥へ伸びる道。中央線を流して、走っている感じを出す */
.road {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 180px;
  overflow: hidden;
  perspective: 140px;
  perspective-origin: 50% 0;
}

.plane {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 200px;
  height: 520px;
  margin-left: -100px;
  transform: rotateX(72deg);
  transform-origin: 50% 100%;
  background:
    linear-gradient(90deg, transparent 0 8px, #d9dcec 8px 12px, transparent 12px calc(100% - 12px), #d9dcec calc(100% - 12px) calc(100% - 8px), transparent calc(100% - 8px)),
    #1c2140;
}

.dash {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 6px;
  margin-left: -3px;
  background: repeating-linear-gradient(180deg, #ffe08a 0 34px, transparent 34px 80px);
  animation: drive 0.9s linear infinite;
}

@keyframes drive {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 80px;
  }
}

/* 地平線と、下のチケットとのつなぎ目をなじませる */
.road::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #1b2150 0%, transparent 30%, transparent 62%, var(--night) 100%);
}

.hero-copy {
  position: relative;
  z-index: 1;
  padding-top: 56px;
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
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
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

.ticket-stay {
  margin-left: 8px;
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: 4px;
  letter-spacing: 0;
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

/* 3文字なので「今日」より小さくして、半券の幅に収める */
.stub-during {
  font-size: 1rem;
  white-space: nowrap;
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
  .glow,
  .dash,
  .pile i,
  .chev {
    animation: none;
    transition: none;
  }
}
</style>
