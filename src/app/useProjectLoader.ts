import { useCallback } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { NavigateFunction } from 'react-router-dom'
import type { MarkdownFile } from '@/store/useAppStore'
import { buildRouteMaps } from '@/logic/routing'

type UseProjectLoaderArgs = {
  projectPath: string | null
  files: MarkdownFile[]
  tabs: string[]
  activePath: string | null
  locationPathname: string
  navigate: NavigateFunction
  setFiles: (files: MarkdownFile[]) => void
  setFileContents: (files: Record<string, string>) => void
  setProjectPath: (path: string) => void
  setTabs: (tabs: string[]) => void
  touchRecentProject: (path: string) => void
}

export function useProjectLoader({
  projectPath,
  files,
  tabs,
  activePath,
  locationPathname,
  navigate,
  setFiles,
  setFileContents,
  setProjectPath,
  setTabs,
  touchRecentProject,
}: UseProjectLoaderArgs) {
  const loadProject = useCallback(
    async (path: string) => {
      if (!path.trim() || !isTauri()) return
      if (path === projectPath && files.length > 0) return
      const projectFiles = await invoke<MarkdownFile[]>('list_markdown_files', {
        root: path,
      })
      const contentsEntries = await Promise.all(
        projectFiles.map(async (file) => {
          const content = await invoke<string>('read_markdown_file', {
            path: file.path,
          })
          return [file.relative_path, content] as const
        }),
      )
      const nextContents: Record<string, string> = {}
      contentsEntries.forEach(([relative, content]) => {
        nextContents[relative] = content
      })
      setFiles(projectFiles)
      setFileContents(nextContents)
      setProjectPath(path)
      touchRecentProject(path)

      if (projectFiles.length > 0) {
        const available = new Set(projectFiles.map((file) => file.relative_path))
        const defaultPath = projectFiles[0].relative_path
        const nextTabs = tabs.filter((tab) => available.has(tab))
        const finalTabs = nextTabs.length > 0 ? nextTabs : [defaultPath]
        setTabs(finalTabs)
        const nextActive = activePath && available.has(activePath) ? activePath : defaultPath
        const nextRouteMaps = buildRouteMaps(projectFiles)
        const nextSlug = nextRouteMaps.pathToSlug.get(nextActive) ?? nextActive
        if (locationPathname !== `/${nextSlug}`) {
          navigate(`/${nextSlug}`, { replace: true })
        }
      }
    },
    [
      activePath,
      files.length,
      locationPathname,
      navigate,
      projectPath,
      setFileContents,
      setFiles,
      setProjectPath,
      setTabs,
      tabs,
      touchRecentProject,
    ],
  )

  const onSelectProject = useCallback(async () => {
    if (!isTauri()) return
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择项目目录',
    })
    if (typeof selected === 'string') {
      await loadProject(selected)
    }
  }, [loadProject])

  return { loadProject, onSelectProject }
}
