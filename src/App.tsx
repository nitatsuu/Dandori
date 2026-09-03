import { useEffect, useMemo, useRef, useState } from 'react'
import { SignIn } from './components/SignIn'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { ReminderBanner } from './components/ReminderBanner'
import { TaskDialog } from './components/TaskDialog'
import { Board } from './views/Board'
import { Timeline } from './views/Timeline'
import { Notes } from './views/Notes'
import { useSession } from './auth/useSession'
import { createWorkspace } from './db/api'
import { useLabels, useTasks, useWorkspaces } from './db/hooks'
import { startSync } from './sync/sync'
import { emptyOf } from './lib/empty'
import { useBoardMode, useCurrentWorkspace, useTab, useTheme, type Theme } from './state/ui'
import type { ID, Label, Task } from './db/types'
import './App.css'

export function App() {
  const { signedIn, loading } = useSession()
  const [theme, setTheme] = useTheme()

  if (loading) return null
  if (!signedIn) return <SignIn />

  return <Shell theme={theme} onSetTheme={setTheme} />
}

function Shell({ theme, onSetTheme }: { theme: Theme; onSetTheme: (t: Theme) => void }) {
  const workspaces = useWorkspaces()
  const ids = useMemo(() => workspaces?.map((w) => w.id), [workspaces])
  const [workspaceId, selectWorkspace] = useCurrentWorkspace(ids)

  const [tab, setTab] = useTab()
  const [boardMode, setBoardMode] = useBoardMode()

  const labels = useLabels(workspaceId) ?? emptyOf<Label>()
  const allTasks = useTasks(workspaceId) ?? emptyOf<Task>()

  const [activeLabels, setActiveLabels] = useState<ID[]>([])
  const [openTaskId, setOpenTaskId] = useState<ID | null>(null)
  const [remindersHidden, setRemindersHidden] = useState(false)

  useBootstrap(workspaces)

  // Reset the label filter when the workspace changes: the other workspace has its own labels.
  const [filteredFor, setFilteredFor] = useState(workspaceId)
  if (filteredFor !== workspaceId) {
    setFilteredFor(workspaceId)
    setActiveLabels([])
  }

  const tasks = useMemo(() => {
    if (activeLabels.length === 0) return allTasks
    return allTasks.filter((t) => activeLabels.some((id) => t.label_ids.includes(id)))
  }, [allTasks, activeLabels])

  function toggleLabel(id: ID) {
    setActiveLabels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  if (!workspaces || !workspaceId) return null

  return (
    <div className="app">
      <Header
        workspaces={workspaces}
        currentId={workspaceId}
        onSelectWorkspace={selectWorkspace}
        tab={tab}
        onSelectTab={setTab}
        labels={labels}
        activeLabels={activeLabels}
        onToggleLabel={toggleLabel}
        theme={theme}
        onSetTheme={onSetTheme}
      />

      {!remindersHidden && (
        <ReminderBanner
          tasks={allTasks}
          onOpenTask={setOpenTaskId}
          onDismiss={() => setRemindersHidden(true)}
        />
      )}

      <main className="app__body">
        {tab === 'board' && (
          <Board
            workspaceId={workspaceId}
            tasks={tasks}
            labels={labels}
            mode={boardMode}
            onSetMode={setBoardMode}
            onOpenTask={setOpenTaskId}
          />
        )}
        {tab === 'timeline' && (
          <Timeline tasks={tasks} labels={labels} onOpenTask={setOpenTaskId} />
        )}
        {tab === 'notes' && <Notes workspaceId={workspaceId} />}
      </main>

      <TabBar tab={tab} onSelect={setTab} />

      {openTaskId && (
        <TaskDialog
          taskId={openTaskId}
          workspaceId={workspaceId}
          labels={labels}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  )
}

/**
 * Starts sync and seeds the initial workspaces.
 *
 * Seeding may only happen after the first exchange with the server: the local
 * database answers with an empty list instantly, and without that wait a second
 * device would create its own duplicate pair of starter workspaces.
 */
function useBootstrap(workspaces: ReturnType<typeof useWorkspaces>) {
  const [pulled, setPulled] = useState(false)
  const seeded = useRef(false)

  useEffect(() => {
    const sync = startSync()
    let alive = true
    void sync.ready.then(() => {
      if (alive) setPulled(true)
    })
    return () => {
      alive = false
      sync.stop()
    }
  }, [])

  useEffect(() => {
    if (!pulled || seeded.current || !workspaces || workspaces.length > 0) return
    seeded.current = true
    void (async () => {
      await createWorkspace('Работа')
      await createWorkspace('Университет')
    })()
  }, [pulled, workspaces])
}
