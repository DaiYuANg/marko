import type { ElementType } from 'react'
import { Code2, GitGraph, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import { useAppStore, type FileViewKind } from '@/store/useAppStore'
import SettingsRow from '@/components/settings/SettingsRow'

const fileViews: Array<{ value: FileViewKind; labelKey: string; icon: ElementType }> = [
  { value: 'edit', labelKey: 'editor.modeWysiwyg', icon: PenLine },
  { value: 'source', labelKey: 'editor.modeSource', icon: Code2 },
  { value: 'graph', labelKey: 'tabs.graph', icon: GitGraph },
]

export default function GeneralSettingsPage() {
  const { t } = useI18n()
  const silentSave = useAppStore((state) => state.silentSave)
  const setSilentSave = useAppStore((state) => state.setSilentSave)
  const showEditorStatusBar = useAppStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = useAppStore((state) => state.setShowEditorStatusBar)
  const defaultFileView = useAppStore((state) => state.defaultFileView)
  const setDefaultFileView = useAppStore((state) => state.setDefaultFileView)

  return (
    <div className="space-y-4">
      <SettingsRow
        title={t('settings.silentSave')}
        description={t('settings.silentSaveDescription')}
        control={<Switch checked={silentSave} onCheckedChange={setSilentSave} />}
      />
      <SettingsRow
        title={t('settings.detailedSave')}
        description={t('settings.detailedSaveDescription')}
        control={
          <Switch checked={!silentSave} onCheckedChange={(checked) => setSilentSave(!checked)} />
        }
      />
      <SettingsRow
        title={t('settings.statusBar')}
        description={t('settings.statusBarDescription')}
        control={<Switch checked={showEditorStatusBar} onCheckedChange={setShowEditorStatusBar} />}
      />
      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-1 text-sm font-medium">{t('settings.defaultFileView')}</div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.defaultFileViewDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {fileViews.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.value}
                variant={defaultFileView === item.value ? 'secondary' : 'outline'}
                className="h-9 justify-start rounded-md"
                onClick={() => setDefaultFileView(item.value)}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
