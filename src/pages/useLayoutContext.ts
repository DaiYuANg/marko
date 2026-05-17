import { useOutletContext } from 'react-router-dom'
import type { LayoutContext } from '@/app/AppLayout'

export const useLayoutContext = () => useOutletContext<LayoutContext>()
