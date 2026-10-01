// ルートが通る都道府県を調べる（宿泊先・立ち寄り先を選ぶ画面の「通る都道府県」タブ）。
// タブを開いたときに1回だけ調べる。ルートの形は loadRoute で受け取る（計算済みの結果か、保存したルート検索の結果を使う）
import { routeAreaSamples } from '~/services/area'
import { citiesAlong, prefecturesAlong, type AreaSample } from '~/utils/routeArea'

type Point = [number, number]

export function useRouteAreas(loadRoute: () => Promise<Point[]>) {
  const shape = ref<Point[]>([])
  const samples = ref<AreaSample[] | null>(null)
  const loading = ref(false)
  const error = ref('')

  const prefectures = computed(() => prefecturesAlong(samples.value ?? []))
  const routeCityCodes = computed(() => citiesAlong(samples.value ?? []))

  async function load() {
    if (samples.value || loading.value) return
    loading.value = true
    error.value = ''
    try {
      shape.value = await loadRoute()
      samples.value = await routeAreaSamples(shape.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '通る都道府県を調べられませんでした。もう一度開いてください。'
    } finally {
      loading.value = false
    }
  }

  return { shape, samples, prefectures, routeCityCodes, loading, error, load }
}
