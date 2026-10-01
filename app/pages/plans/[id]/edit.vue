<script setup lang="ts">
import { findPlan } from '~/utils/planStore'

const route = useRoute()
const plan = findPlan(String(route.params.id))
useHead({ title: 'プランを編集する | えんメイト' })
</script>

<template>
  <PlanForm v-if="plan" :initial="plan" />
  <PlanNotFound v-else />
</template>
