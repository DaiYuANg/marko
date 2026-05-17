import { useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSearch, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isTauriRuntime } from '@/utils/tauri'
import { useI18n } from '@/i18n/useI18n'

type FullTextSearchPanelProps = {
  query: string
  onOpenResult: (result: FsSearchResult) => void
}

export default function FullTextSearchPanel({ query, onOpenResult }: FullTextSearchPanelProps) {
  const { t } = useI18n()
  const deferredQuery = useDeferredValue(query.trim())
  const enabled = isTauriRuntime() && deferredQuery.length >= 2
  const searchQuery = useQuery({
    queryKey: ['workspace-search', deferredQuery],
    queryFn: () => fsApi.searchWorkspace(deferredQuery, 20),
    enabled,
    staleTime: 5_000,
  })

  if (query.trim().length < 2) {
    return (
      <div className="rounded-md border border-dashed border-sidebar-border px-2 py-3 text-xs text-muted-foreground">
        {t('search.minQuery')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex h-6 items-center justify-between px-1 text-[11px] uppercase text-muted-foreground">
        <span>{t('search.fullText')}</span>
        {searchQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
        {searchQuery.data?.length ? (
          <div className="flex flex-col gap-1">
            {searchQuery.data.map((result) => (
              <Button
                key={`${result.path}:${result.line}:${result.column}`}
                variant="ghost"
                size="sm"
                className="h-auto min-h-12 w-full items-start justify-start rounded-md px-2 py-1.5 text-left"
                onClick={() => onOpenResult(result)}
              >
                <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{result.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {result.path}:{result.line}
                  </span>
                  <span className="mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground/85">
                    {result.snippet || t('search.noSnippet')}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            {searchQuery.isFetching ? t('search.searching') : t('search.noResults')}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
