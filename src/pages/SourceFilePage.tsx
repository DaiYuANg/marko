import { useParams } from 'react-router-dom'
import SourceCodePage from '@/pages/SourceCodePage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useLayoutContext } from '@/pages/useLayoutContext'

export default function SourceFilePage() {
  const params = useParams()
  const context = useLayoutContext()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <SourceCodePage
      activePath={requestedPath}
      value={context.editorValue}
      files={context.files}
      fileContents={context.fileContents}
      workspaceIndex={context.workspaceIndex}
      onChange={context.onEditorChange}
      showStatusBar={context.showEditorStatusBar}
    />
  )
}
