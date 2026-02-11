import { useAppStore } from '@/store/useAppStore'

export function useDarkMode() {
  const theme = useAppStore((state) => state.theme)
  return theme === 'dark'
}
