import { readUsage } from '~/utils/usage'

const version = ref(0)

// API を呼んだあとに呼ぶ。使用回数の表示を更新する
export function notifyUsageChanged() {
  version.value++
}

export function useUsage() {
  return computed(() => {
    void version.value
    return { route: readUsage('route'), spot: readUsage('spot'), geocoding: readUsage('geocoding') }
  })
}
