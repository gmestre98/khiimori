import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  updateTodo,
  UnauthorizedError,
  type TodoInput,
  type TodoPatch,
  type TripTodo,
} from '../lib/api'
import { Button, Input, ProgressBar } from '../components/ui'
import { ConfirmModal } from '../components/ConfirmModal'
import { cacheKeys } from '../lib/cacheKeys'
import { readCache, writeCache } from '../lib/resourceCache'
import { localToday } from '../lib/format'
import { dueLabel, groupTodos, shortDate } from './todoGroups'

// sortTodos keeps the working copy in the server's order after a local change:
// soonest deadline first, undated last, then position.
function sortTodos(list: TripTodo[]): TripTodo[] {
  return [...list].sort((a, b) => {
    if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1
    if (a.due_date !== b.due_date) return (a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1
    return a.position - b.position
  })
}

// TripTodos is the To-dos half of the Prep tab: things to get done for the trip,
// each with an optional deadline, grouped by when they're due and ticked off.
// Optimistic like the packing list: cached first paint, then revalidated; a
// failed write re-syncs from the server.
export function TripTodos({ tripId }: { tripId: string }) {
  const [todos, setTodos] = useState<TripTodo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = localToday()

  const todosRef = useRef<TripTodo[] | null>(todos)
  useEffect(() => {
    todosRef.current = todos
  })

  const persist = useCallback(
    (next: TripTodo[]) => void writeCache(cacheKeys.todos(tripId), next),
    [tripId],
  )

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchTodos(tripId, signal)
        .then((list) => {
          setTodos(list)
          void writeCache(cacheKeys.todos(tripId), list)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!todosRef.current) setError('Could not load the to-dos.')
        })
    },
    [tripId],
  )

  useEffect(() => {
    const controller = new AbortController()
    let done = false
    void readCache<TripTodo[]>(cacheKeys.todos(tripId)).then((cached) => {
      if (done) return
      if (cached) setTodos(cached.data)
      load(controller.signal)
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, load])

  const apply = useCallback(
    (fn: (prev: TripTodo[]) => TripTodo[]) =>
      setTodos((prev) => {
        const next = sortTodos(fn(prev ?? []))
        persist(next)
        return next
      }),
    [persist],
  )

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof UnauthorizedError) return
      setError(err instanceof Error && err.message ? err.message : fallback)
      load()
    },
    [load],
  )

  async function handleAdd(input: TodoInput) {
    setError(null)
    try {
      const created = await createTodo(tripId, input)
      apply((prev) => [...prev, created])
    } catch (err) {
      handleError(err, 'Could not add the to-do.')
    }
  }

  async function handleToggle(todo: TripTodo) {
    apply((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)))
    try {
      await updateTodo(tripId, todo.id, { done: !todo.done })
    } catch (err) {
      handleError(err, 'Could not update the to-do.')
    }
  }

  async function handleEdit(todo: TripTodo, patch: TodoPatch) {
    setError(null)
    try {
      const updated = await updateTodo(tripId, todo.id, patch)
      apply((prev) => prev.map((t) => (t.id === todo.id ? updated : t)))
    } catch (err) {
      handleError(err, 'Could not save the to-do.')
    }
  }

  async function handleDelete(todo: TripTodo) {
    apply((prev) => prev.filter((t) => t.id !== todo.id))
    try {
      await deleteTodo(tripId, todo.id)
    } catch (err) {
      handleError(err, 'Could not remove the to-do.')
    }
  }

  const list = useMemo(() => todos ?? [], [todos])
  const groups = useMemo(() => groupTodos(list, today), [list, today])
  const doneCount = list.filter((t) => t.done).length
  const next = list.find((t) => !t.done && t.due_date && t.due_date >= today)
  const overdueCount = list.filter((t) => !t.done && t.due_date && t.due_date < today).length

  return (
    <div className="trip-todos">
      {list.length > 0 && (
        <ProgressBar
          value={doneCount / list.length}
          variant={overdueCount > 0 ? 'warning' : 'default'}
          label="To-do progress"
          caption={
            `${doneCount} of ${list.length} done` +
            (overdueCount > 0
              ? ` · ${overdueCount} overdue`
              : next?.due_date
                ? ` · next by ${shortDate(next.due_date)}`
                : '')
          }
        />
      )}

      {error && (
        <p role="alert" className="trip-packing-error">
          {error}
        </p>
      )}

      <AddTodoForm onAdd={handleAdd} />

      {todos === null ? (
        <p className="trip-packing-empty" aria-busy="true">
          Loading to-dos…
        </p>
      ) : list.length === 0 ? (
        <p className="trip-packing-empty">
          Nothing to do yet. Add the things to sort out before you go — a visa, a booking to
          confirm, copies to print — with a date if there's a deadline.
        </p>
      ) : (
        <div className="packing-groups">
          {groups.map((group) => (
            <section
              key={group.key}
              className={
                group.key === 'overdue' ? 'packing-group todo-group--overdue' : 'packing-group'
              }
              aria-label={group.title}
            >
              <h2 className="packing-group-title">
                {group.title}
                <span className="packing-group-count">
                  {group.todos.filter((t) => t.done).length}/{group.todos.length}
                </span>
              </h2>
              <ul className="packing-list" role="list">
                {group.todos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    today={today}
                    onToggle={() => handleToggle(todo)}
                    onEdit={(patch) => handleEdit(todo, patch)}
                    onDelete={() => handleDelete(todo)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Add form ---------------------------------------------------------------

function AddTodoForm({ onAdd }: { onAdd: (input: TodoInput) => void | Promise<void> }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    void onAdd({ title: trimmed, due_date: due || null, note: note.trim() })
    setTitle('')
    setNote('')
    // Keep the date so several to-dos for the same deadline can be added in a row.
  }

  return (
    <form className="packing-add todo-add" onSubmit={submit} aria-label="Add to-do">
      <div className="packing-add-main">
        <Input
          className="packing-add-label"
          placeholder="Add a to-do…"
          aria-label="To-do"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={!title.trim()}>
          Add
        </Button>
      </div>
      <div className="packing-add-meta">
        <Input
          type="date"
          className="todo-date-input"
          aria-label="Due date (optional)"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <Input
          className="packing-add-note"
          placeholder="Note (optional)"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </form>
  )
}

// --- Row (view + inline edit) -----------------------------------------------

function TodoRow({
  todo,
  today,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: TripTodo
  today: string
  onToggle: () => void
  onEdit: (patch: TodoPatch) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [due, setDue] = useState(todo.due_date ?? '')
  const [note, setNote] = useState(todo.note)

  function startEdit() {
    setTitle(todo.title)
    setDue(todo.due_date ?? '')
    setNote(todo.note)
    setEditing(true)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onEdit({ title: trimmed, due_date: due || null, note: note.trim() })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="packing-item packing-item--editing">
        <form className="packing-edit" onSubmit={save} aria-label={`Edit ${todo.title}`}>
          <div className="packing-edit-row">
            <Input
              aria-label="To-do"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <Input
              type="date"
              className="todo-date-input"
              aria-label="Due date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="packing-edit-row">
            <Input
              placeholder="Note"
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="packing-edit-actions">
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    )
  }

  const late = !todo.done && !!todo.due_date && todo.due_date < today
  return (
    <li
      className={['packing-item', todo.done ? 'packing-item--packed' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <label className="packing-check">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={onToggle}
          aria-label={`Mark ${todo.title} as ${todo.done ? 'not done' : 'done'}`}
        />
        <span className="packing-item-text">
          <span className="packing-item-label">{todo.title}</span>
          {todo.due_date && (
            <span className={late ? 'todo-due todo-due--late' : 'todo-due'}>
              {dueLabel(todo.due_date, today, todo.done)}
            </span>
          )}
          {todo.note && <span className="packing-item-note">{todo.note}</span>}
        </span>
      </label>
      <div className="packing-item-actions">
        <button
          type="button"
          className="packing-icon-btn"
          onClick={startEdit}
          aria-label={`Edit ${todo.title}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="packing-icon-btn packing-icon-btn--danger"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Remove ${todo.title}`}
        >
          Remove
        </button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Remove to-do"
          message={`Remove "${todo.title}"?`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            setConfirmDelete(false)
            onDelete()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </li>
  )
}
