import { SidebarContent } from '@/components/ui/sidebar'
import ScmPanel from '@/components/ScmPanel'
import SidebarExplorerPanel from '@/components/SidebarExplorerPanel'
import SidebarProjectsPanel from '@/components/SidebarProjectsPanel'
import SidebarSearchPanel from '@/components/SidebarSearchPanel'
import SidebarWorkspaceGraphPanel from '@/components/SidebarWorkspaceGraphPanel'
import type { SidebarToolPanelProps } from '@/components/sidebarPanelTypes'

export default function SidebarToolPanel({
  activeActivity,
  activePath,
  fileCount,
  fileTree,
  focusFileFilterRequest,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onOpenGitDiff,
  onOpenProject,
  onOpenSearchResult,
  onOpenWorkspaceGraph,
  onRenamePath,
  onUseInternalRoot,
  recentProjects,
  rootKind,
  rootPath,
}: SidebarToolPanelProps) {
  return (
    <SidebarContent className="h-full p-1.5">
      {activeActivity === 'search' ? (
        <SidebarSearchPanel onOpenSearchResult={onOpenSearchResult} />
      ) : activeActivity === 'scm' ? (
        <ScmPanel
          collapsed={false}
          rootKind={rootKind}
          rootPath={rootPath}
          onOpenDiff={onOpenGitDiff}
        />
      ) : activeActivity === 'graph' ? (
        <SidebarWorkspaceGraphPanel
          fileCount={fileCount}
          recentProjects={recentProjects}
          rootPath={rootPath}
          onOpenWorkspaceGraph={onOpenWorkspaceGraph}
        />
      ) : activeActivity === 'projects' ? (
        <SidebarProjectsPanel
          recentProjects={recentProjects}
          onOpenProject={onOpenProject}
          onUseInternalRoot={onUseInternalRoot}
        />
      ) : (
        <SidebarExplorerPanel
          activePath={activePath}
          fileCount={fileCount}
          fileTree={fileTree}
          focusFileFilterRequest={focusFileFilterRequest}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onDeletePath={onDeletePath}
          onInspectPath={onInspectPath}
          onOpenFile={onOpenFile}
          onOpenFileView={onOpenFileView}
          onRenamePath={onRenamePath}
          rootKind={rootKind}
        />
      )}
    </SidebarContent>
  )
}
