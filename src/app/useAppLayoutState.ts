import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { buildRouteMaps } from '@/logic/routing'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useGraphData } from '@/app/useGraphData'

export function useAppLayoutState() {
  const {
    projectPath,
    recentProjects,
    files,
    tabs,
    activePath,
    sidebarCollapsed,
    theme,
    setProjectPath,
    setFiles,
    setTabs,
    setActivePath,
    toggleSidebar,
    setTheme,
    touchRecentProject,
  } = useAppStore()

  const [isMaximized, setIsMaximized] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  const routeMaps = useMemo(() => buildRouteMaps(files), [files])
  const filePathMap = useMemo(() => {
    const map = new Map<string, string>()
    files.forEach((file) => map.set(file.relative_path, file.path))
    return map
  }, [files])

  const { fileContents, setFileContents, editorValue, onEditorChange } = useEditorBuffer({
    activePath,
    filePathMap,
    projectPath,
  })

  const { loadProject, onSelectProject } = useProjectLoader({
    projectPath,
    files,
    tabs,
    activePath,
    locationPathname: location.pathname,
    navigate,
    setFiles,
    setFileContents,
    setProjectPath,
    setTabs,
    touchRecentProject,
  })

  useEffect(() => {
    if (projectPath) {
      void loadProject(projectPath)
    }
  }, [projectPath, loadProject])

  useEffect(() => {
    const slug = params.slug
    if (!slug || location.pathname.includes('graph')) return
    const match = routeMaps.slugToPath.get(slug)
    if (match && match !== activePath) {
      setActivePath(match)
    }
  }, [activePath, location.pathname, params.slug, routeMaps, setActivePath])

  const onOpenFile = useCallback(
    (relativePath: string) => {
      const nextTabs = tabs.includes(relativePath) ? tabs : [...tabs, relativePath]
      setTabs(nextTabs)
      const nextSlug = routeMaps.pathToSlug.get(relativePath) ?? relativePath
      if (location.pathname !== `/${nextSlug}`) {
        navigate(`/${nextSlug}`)
      }
    },
    [location.pathname, navigate, routeMaps, setTabs, tabs],
  )

  const onCloseTab = useCallback(
    (relativePath: string) => {
      const nextTabs = tabs.filter((tab) => tab !== relativePath)
      setTabs(nextTabs)
      if (activePath === relativePath) {
        const nextActive = nextTabs[0] ?? null
        if (nextActive) {
          const nextSlug = routeMaps.pathToSlug.get(nextActive) ?? nextActive
          if (location.pathname !== `/${nextSlug}`) {
            navigate(`/${nextSlug}`)
          }
        }
      }
    },
    [activePath, location.pathname, navigate, routeMaps, setTabs, tabs],
  )

  const fileTree = useMemo(() => buildFileTree(files), [files])
  const graph = useGraphData(files, fileContents, location.pathname)

  return {
    recentProjects,
    files,
    tabs,
    activePath,
    sidebarCollapsed,
    theme,
    routeMaps,
    fileTree,
    graph,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onOpenFile,
    onCloseTab,
    onSelectProject,
    onOpenProject: loadProject,
    setTheme,
    toggleSidebar,
  }
}
