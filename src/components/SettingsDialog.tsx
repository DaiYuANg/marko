import { Languages, Palette, Save, SlidersHorizontal } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { useAppStore, type ThemeMode } from '@/store/useAppStore'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const themes: Array<{ value: ThemeMode; labelKey: string }> = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
  { value: 'marko-light', labelKey: 'theme.markoLight' },
  { value: 'marko-dark', labelKey: 'theme.markoDark' },
]

const locales: Array<{ value: Locale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'language.zh' },
  { value: 'en-US', labelKey: 'language.en' },
]

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t, locale, setLocale } = useI18n()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const silentSave = useAppStore((state) => state.silentSave)
  const setSilentSave = useAppStore((state) => state.setSilentSave)
  const showEditorStatusBar = useAppStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = useAppStore((state) => state.setShowEditorStatusBar)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-md p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="grid min-h-[360px] grid-cols-[160px_1fr]">
          <TabsList className="flex h-full flex-col items-stretch justify-start rounded-none border-r border-border bg-muted/30 p-2">
            <TabsTrigger value="general" className="justify-start gap-2 rounded-md">
              <Save className="h-4 w-4" />
              {t('settings.general')}
            </TabsTrigger>
            <TabsTrigger value="appearance" className="justify-start gap-2 rounded-md">
              <Palette className="h-4 w-4" />
              {t('settings.appearance')}
            </TabsTrigger>
          </TabsList>

          <div className="min-w-0 p-5">
            <TabsContent value="general" className="m-0 space-y-4">
              <SettingsRow
                title={t('settings.silentSave')}
                description={t('settings.silentSaveDescription')}
                control={<Switch checked={silentSave} onCheckedChange={setSilentSave} />}
              />
              <SettingsRow
                title={t('settings.detailedSave')}
                description={t('settings.detailedSaveDescription')}
                control={
                  <Switch
                    checked={!silentSave}
                    onCheckedChange={(checked) => setSilentSave(!checked)}
                  />
                }
              />
              <SettingsRow
                title={t('settings.statusBar')}
                description={t('settings.statusBarDescription')}
                control={
                  <Switch checked={showEditorStatusBar} onCheckedChange={setShowEditorStatusBar} />
                }
              />
            </TabsContent>

            <TabsContent value="appearance" className="m-0 space-y-5">
              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Palette className="h-4 w-4 text-primary" />
                  {t('menu.theme')}
                </div>
                <div className="mb-3 text-xs text-muted-foreground">
                  {t('settings.themeDescription')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((item) => (
                    <Button
                      key={item.value}
                      variant={theme === item.value ? 'secondary' : 'outline'}
                      className="h-9 justify-start rounded-md"
                      onClick={() => setTheme(item.value)}
                    >
                      {t(item.labelKey)}
                    </Button>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Languages className="h-4 w-4 text-primary" />
                  {t('menu.language')}
                </div>
                <div className="mb-3 text-xs text-muted-foreground">
                  {t('settings.languageDescription')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {locales.map((item) => (
                    <Button
                      key={item.value}
                      variant={locale === item.value ? 'secondary' : 'outline'}
                      className="h-9 justify-start rounded-md"
                      onClick={() => setLocale(item.value)}
                    >
                      {t(item.labelKey)}
                    </Button>
                  ))}
                </div>
              </section>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string
  description: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  )
}
