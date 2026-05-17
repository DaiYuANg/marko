import { Skeleton } from '@/components/ui/skeleton'

export default function EditorPaneFallback() {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}
