import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import { useAppStore, type GraphContentMode } from '@/store/useAppStore'
import SettingsRow from '@/components/settings/SettingsRow'

const graphContentModes: Array<{ value: GraphContentMode; labelKey: string }> = [
  { value: 'none', labelKey: 'settings.graphContentNone' },
  { value: 'summary', labelKey: 'settings.graphContentSummary' },
  { value: 'full', labelKey: 'settings.graphContentFull' },
]

export default function GraphSettingsPage() {
  const { t } = useI18n()
  const graphMiniMapEnabled = useAppStore((state) => state.graphMiniMapEnabled)
  const setGraphMiniMapEnabled = useAppStore((state) => state.setGraphMiniMapEnabled)
  const graphContentMode = useAppStore((state) => state.graphContentMode)
  const setGraphContentMode = useAppStore((state) => state.setGraphContentMode)

  return (
    <div className="space-y-4">
      <SettingsRow
        title={t('settings.graphMiniMap')}
        description={t('settings.graphMiniMapDescription')}
        control={<Switch checked={graphMiniMapEnabled} onCheckedChange={setGraphMiniMapEnabled} />}
      />
      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Map className="h-4 w-4 text-primary" />
          {t('settings.graphContentMode')}
        </div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.graphContentModeDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {graphContentModes.map((item) => (
            <Button
              key={item.value}
              variant={graphContentMode === item.value ? 'secondary' : 'outline'}
              className="h-9 rounded-md"
              onClick={() => setGraphContentMode(item.value)}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
