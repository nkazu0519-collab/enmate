<script setup lang="ts">
import type { Usage } from '~/utils/usage'

const usage = useUsage()

function text(u: Usage): string {
  return u.limit === null ? `${u.used} 回` : `${u.used}/${u.limit} 回`
}
</script>

<template>
  <div class="usage">
    <p class="muted">
      NAVITIME の今月の使用回数の目安: ルート検索 {{ text(usage.route) }}・場所検索 {{ text(usage.spot) }}・住所の検索 {{ text(usage.geocoding) }}
    </p>
    <p v-if="usage.route.nearLimit || usage.spot.nearLimit || usage.geocoding.nearLimit" class="notice notice-warn">
      今月の無料枠の残りが少なくなっています。使い切ると、来月まで検索できません（保存したプランは見られます）。
    </p>
    <p class="muted">ほかの端末で使った分は、その端末で検索するまで反映されません。</p>
  </div>
</template>

<style scoped>
.usage > * + * {
  margin-top: 6px;
}
</style>
