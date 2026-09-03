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
import { initialPull, startSync } from './sync/sync'
import { useBoardMode, useCurrentWorkspace, useTab, useTheme } from './state/ui'
import type { ID, Label, Task } from './db/types'
import './App.css'

// Стабильные ссылки: иначе useMemo ниже пересчитывается на каждом рендере.
const NO_TASKS: Task[] = []
const NO_LABELS: Label[] = []

export function App() {
  const { session, loading } = useSession()
  const [theme, setTheme] = useTheme()

  // Тема применяется и на экране входа, поэтому хук стоит выше проверки сессии.
  void theme

  if (loading) return null
  if (!session) return <SignIn />

  return <Shell theme={theme} onSetTheme={setTheme} />
}

function Shell({
  theme,
  onSetTheme,
}: {
  theme: ReturnType<typeof useTheme>[0]
  onSetTheme: ReturnType<typeof useTheme>[1]
}) {
  const workspaces = useWorkspaces()
  const ids = useMemo(() => workspaces?.map((w) => w.id), [workspaces])
  const [workspaceId, selectWorkspace] = useCurrentWorkspace(ids)

  const [tab, setTab] = useTab()
  const [boardMode, setBoardMode] = useBoardMode()

  const labels = useLabels(workspaceId) ?? NO_LABELS
  const allTasks = useTasks(workspaceId) ?? NO_TASKS

  const [activeLabels, setActiveLabels] = useState<ID[]>([])
  const [openTaskId, setOpenTaskId] = useState<ID | null>(null)
  const [remindersHidden, setRemindersHidden] = useState(false)

  useBootstrap(workspaces)

  // Фильтр по меткам сбрасывается при смене воркспейса: метки там другие.
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
 * Первый запуск: сначала полная загрузка с сервера, и только если данных
 * действительно нет — заводим стартовые воркспейсы. Иначе на втором устройстве
 * появились бы дубликаты.
 */
function useBootstrap(workspaces: ReturnType<typeof useWorkspaces>) {
  const done = useRef(false)

  useEffect(() => {
    let stop: (() => void) | undefined
    void (async () => {
      await initialPull()
      stop = startSync()
    })()
    return () => stop?.()
  }, [])

  useEffect(() => {
    if (done.current || !workspaces || workspaces.length > 0) return
    done.current = true
    void (async () => {
      await createWorkspace('Работа')
      await createWorkspace('Университет')
    })()
  }, [workspaces])
}
