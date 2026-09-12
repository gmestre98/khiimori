import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  applyPackingTemplate,
  createPackingItem,
  createPackingTemplate,
  deletePackingItem,
  deletePackingTemplate,
  fetchPackingItems,
  fetchPackingTemplates,
  updatePackingItem,
  UnauthorizedError,
  type PackingItem,
  type PackingItemInput,
  type PackingTemplate,
} from '../lib/api'
import { Button, Input, ProgressBar, Sheet } from '../components/ui'
import { ConfirmModal } from '../components/ConfirmModal'
import { cacheKeys } from '../lib/cacheKeys'
import { readCache, writeCache } from '../lib/resourceCache'

const UNCATEGORISED = 'Other'

// groupByCategory buckets items by their category (blank → "Other"), preserving
// each item's position order within a group and listing "Other" last.
function groupByCategory(items: PackingItem[]): { category: string; items: PackingItem[] }[] {
  const groups = new Map<string, PackingItem[]>()
  for (const it of items) {
    const key = it.category.trim() || UNCATEGORISED
    const bucket = groups.get(key)
    if (bucket) bucket.push(it)
    else groups.set(key, [it])
  }
  const names = [...groups.keys()].sort((a, b) => {
    if (a === UNCATEGORISED) return 1
    if (b === UNCATEGORISED) return -1
    return a.localeCompare(b)
  })
  return names.map((category) => ({ category, items: groups.get(category)! }))
}

export function TripPackingPage() {
  const { tripId } = useParams<{ tripId: string }>()

  // Local working copy so toggles/edits reflect instantly (optimistic). Seeded
  // from cache for an instant first paint, then revalidated from the server; a
  // failed write re-syncs by reloading. null = not loaded yet.
  const [items, setItems] = useState<PackingItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Mirror the latest items into a ref so the load error handler can tell
  // "nothing shown yet" (surface an error) from "already showing data" (keep it).
  const itemsRef = useRef<PackingItem[] | null>(items)
  useEffect(() => {
    itemsRef.current = items
  })

  // Persist the working copy to the same cache key the loader reads, so a reopen
  // renders the up-to-date list instantly.
  const persist = useCallback(
    (next: PackingItem[]) => {
      if (tripId) void writeCache(cacheKeys.packing(tripId), next)
    },
    [tripId],
  )

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!tripId) return
      fetchPackingItems(tripId, signal)
        .then((list) => {
          setItems(list)
          void writeCache(cacheKeys.packing(tripId), list)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!itemsRef.current) setError('Could not load the packing list.')
        })
    },
    [tripId],
  )

  // Instant-render: seed from cache, then revalidate. setState only ever runs
  // inside the promise callbacks, never synchronously in the effect body.
  useEffect(() => {
    if (!tripId) return
    const controller = new AbortController()
    let done = false
    void readCache<PackingItem[]>(cacheKeys.packing(tripId)).then((cached) => {
      if (done) return
      if (cached) setItems(cached.data)
      load(controller.signal)
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, load])

  const list = useMemo(() => items ?? [], [items])
  const categories = useMemo(
    () => [...new Set(list.map((it) => it.category.trim()).filter(Boolean))].sort(),
    [list],
  )

  const packedCount = list.filter((it) => it.packed).length
  const total = list.length
  const groups = useMemo(() => groupByCategory(list), [list])

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof UnauthorizedError) return
      setError(err instanceof Error && err.message ? err.message : fallback)
      // Re-sync from the server so the optimistic state doesn't drift after a failure.
      load()
    },
    [load],
  )

  async function handleAdd(input: PackingItemInput) {
    if (!tripId) return
    setError(null)
    try {
      const created = await createPackingItem(tripId, input)
      setItems((prev) => {
        const base = prev ?? []
        const next = [...base, created]
        persist(next)
        return next
      })
    } catch (err) {
      handleError(err, 'Could not add item.')
    }
  }

  async function handleToggle(item: PackingItem) {
    if (!tripId) return
    // Optimistic flip.
    setItems((prev) => {
      const base = prev ?? []
      const next = base.map((it) => (it.id === item.id ? { ...it, packed: !it.packed } : it))
      persist(next)
      return next
    })
    try {
      await updatePackingItem(tripId, item.id, { packed: !item.packed })
    } catch (err) {
      handleError(err, 'Could not update item.')
    }
  }

  async function handleEdit(item: PackingItem, patch: PackingItemInput) {
    if (!tripId) return
    setError(null)
    try {
      const updated = await updatePackingItem(tripId, item.id, {
        label: patch.label,
        category: patch.category ?? '',
        quantity: patch.quantity ?? 1,
        note: patch.note ?? '',
      })
      setItems((prev) => {
        const base = prev ?? []
        const next = base.map((it) => (it.id === item.id ? updated : it))
        persist(next)
        return next
      })
    } catch (err) {
      handleError(err, 'Could not save changes.')
    }
  }

  async function handleDelete(item: PackingItem) {
    if (!tripId) return
    setItems((prev) => {
      const base = prev ?? []
      const next = base.filter((it) => it.id !== item.id)
      persist(next)
      return next
    })
    try {
      await deletePackingItem(tripId, item.id)
    } catch (err) {
      handleError(err, 'Could not remove item.')
    }
  }

  async function handleApplyTemplate(templateId: string) {
    if (!tripId) return
    setError(null)
    try {
      const created = await applyPackingTemplate(tripId, templateId)
      setItems((prev) => {
        const base = prev ?? []
        const next = [...base, ...created]
        persist(next)
        return next
      })
      setTemplatesOpen(false)
    } catch (err) {
      handleError(err, 'Could not apply template.')
    }
  }

  if (!tripId) return null

  const loading = items === null

  return (
    <article className="trip-packing-page">
      <div className="screen-content narrow trip-packing-body">
        <div className="trip-packing-head">
          <h1 className="h1">Packing</h1>
          <Button variant="secondary" size="sm" onClick={() => setTemplatesOpen(true)}>
            Templates
          </Button>
        </div>

        {total > 0 && (
          <ProgressBar
            value={total === 0 ? 0 : packedCount / total}
            variant={packedCount === total ? 'default' : 'warning'}
            label="Packing progress"
            caption={`${packedCount} of ${total} packed`}
          />
        )}

        {error && (
          <p role="alert" className="trip-packing-error">
            {error}
          </p>
        )}

        <AddItemForm categories={categories} onAdd={handleAdd} />

        {loading ? (
          <p className="trip-packing-empty" aria-busy="true">
            Loading packing list…
          </p>
        ) : total === 0 ? (
          <p className="trip-packing-empty">
            Nothing packed yet. Add what you need to bring — group items by category (e.g.{' '}
            <em>Safety gear</em>) and check them off as you pack.
          </p>
        ) : (
          <div className="packing-groups">
            {groups.map((group) => (
              <section key={group.category} className="packing-group">
                <h2 className="packing-group-title">
                  {group.category}
                  <span className="packing-group-count">
                    {group.items.filter((it) => it.packed).length}/{group.items.length}
                  </span>
                </h2>
                <ul className="packing-list" role="list">
                  {group.items.map((item) => (
                    <PackingItemRow
                      key={item.id}
                      item={item}
                      categories={categories}
                      onToggle={() => handleToggle(item)}
                      onEdit={(patch) => handleEdit(item, patch)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <TemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        tripId={tripId}
        hasItems={total > 0}
        onApply={handleApplyTemplate}
        onError={(msg) => setError(msg)}
      />
    </article>
  )
}

// --- Add form ---------------------------------------------------------------

function AddItemForm({
  categories,
  onAdd,
}: {
  categories: string[]
  onAdd: (input: PackingItemInput) => void | Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    const qty = Math.max(1, Math.round(Number(quantity) || 1))
    void onAdd({ label: trimmed, category: category.trim(), quantity: qty, note: note.trim() })
    setLabel('')
    setNote('')
    setQuantity('1')
    // Keep the category so several items can be added to the same group in a row.
  }

  return (
    <form className="packing-add" onSubmit={submit} aria-label="Add packing item">
      <div className="packing-add-main">
        <Input
          className="packing-add-label"
          placeholder="Add an item to pack…"
          aria-label="Item"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!label.trim()}>
          Add
        </Button>
      </div>
      <div className="packing-add-meta">
        <Input
          className="packing-add-category"
          list="packing-categories"
          placeholder="Category (optional)"
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Input
          className="packing-add-qty"
          type="number"
          min={1}
          aria-label="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          className="packing-add-note"
          placeholder="Note (optional)"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <datalist id="packing-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </form>
  )
}

// --- Item row (view + inline edit) ------------------------------------------

function PackingItemRow({
  item,
  categories,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: PackingItem
  categories: string[]
  onToggle: () => void
  onEdit: (patch: PackingItemInput) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [category, setCategory] = useState(item.category)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [note, setNote] = useState(item.note)

  function startEdit() {
    setLabel(item.label)
    setCategory(item.category)
    setQuantity(String(item.quantity))
    setNote(item.note)
    setEditing(true)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    onEdit({
      label: trimmed,
      category: category.trim(),
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      note: note.trim(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="packing-item packing-item--editing">
        <form className="packing-edit" onSubmit={save} aria-label={`Edit ${item.label}`}>
          <div className="packing-edit-row">
            <Input
              aria-label="Item"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
            <Input
              className="packing-add-qty"
              type="number"
              min={1}
              aria-label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="packing-edit-row">
            <Input
              list="packing-categories"
              placeholder="Category"
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Input
              placeholder="Note"
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <datalist id="packing-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="packing-edit-actions">
            <Button type="submit" size="sm" disabled={!label.trim()}>
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

  return (
    <li className={['packing-item', item.packed ? 'packing-item--packed' : ''].filter(Boolean).join(' ')}>
      <label className="packing-check">
        <input
          type="checkbox"
          checked={item.packed}
          onChange={onToggle}
          aria-label={`Mark ${item.label} as ${item.packed ? 'not packed' : 'packed'}`}
        />
        <span className="packing-item-text">
          <span className="packing-item-label">
            {item.label}
            {item.quantity > 1 && <span className="packing-item-qty">×{item.quantity}</span>}
          </span>
          {item.note && <span className="packing-item-note">{item.note}</span>}
        </span>
      </label>
      <div className="packing-item-actions">
        <button
          type="button"
          className="packing-icon-btn"
          onClick={startEdit}
          aria-label={`Edit ${item.label}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="packing-icon-btn packing-icon-btn--danger"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Remove ${item.label}`}
        >
          Remove
        </button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Remove item"
          message={`Remove "${item.label}" from the packing list?`}
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

// --- Templates sheet --------------------------------------------------------

function TemplatesSheet({
  open,
  onClose,
  tripId,
  hasItems,
  onApply,
  onError,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  hasItems: boolean
  onApply: (templateId: string) => void
  onError: (msg: string) => void
}) {
  const [templates, setTemplates] = useState<PackingTemplate[] | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const loadedFor = useRef(false)

  const load = useCallback(() => {
    fetchPackingTemplates()
      .then(setTemplates)
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) return
        onError('Could not load templates.')
      })
  }, [onError])

  useEffect(() => {
    if (open && !loadedFor.current) {
      loadedFor.current = true
      load()
    }
    if (!open) loadedFor.current = false
  }, [open, load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const created = await createPackingTemplate(trimmed, tripId)
      setTemplates((prev) => [created, ...(prev ?? [])])
      setName('')
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : 'Could not save template.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setConfirmDeleteId(null)
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== id))
    try {
      await deletePackingTemplate(id)
    } catch {
      onError('Could not delete template.')
      load()
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Packing templates">
      <h2 className="sheet-title">Packing templates</h2>
      <p className="packing-sheet-intro">
        Save this trip's list as a reusable template, or copy a saved one into this trip.
      </p>

      <form className="packing-template-save" onSubmit={save}>
        <Input
          placeholder="Save current list as…"
          aria-label="New template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!hasItems}
        />
        <Button type="submit" size="sm" disabled={!name.trim() || !hasItems || saving}>
          Save
        </Button>
      </form>
      {!hasItems && (
        <p className="packing-sheet-hint">Add some items first to save them as a template.</p>
      )}

      <div className="packing-template-list">
        {templates === null ? (
          <p className="packing-sheet-hint">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="packing-sheet-hint">No saved templates yet.</p>
        ) : (
          <ul role="list" className="packing-template-ul">
            {templates.map((t) => (
              <li key={t.id} className="packing-template-item">
                <div className="packing-template-info">
                  <span className="packing-template-name">{t.name}</span>
                  <span className="packing-template-count">
                    {t.item_count} {t.item_count === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="packing-template-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onApply(t.id)}
                    disabled={t.item_count === 0}
                  >
                    Add to trip
                  </Button>
                  <button
                    type="button"
                    className="packing-icon-btn packing-icon-btn--danger"
                    onClick={() => setConfirmDeleteId(t.id)}
                    aria-label={`Delete template ${t.name}`}
                  >
                    Delete
                  </button>
                </div>
                {confirmDeleteId === t.id && (
                  <ConfirmModal
                    title="Delete template"
                    message={`Delete the template "${t.name}"? This does not change any trip's list.`}
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => remove(t.id)}
                    onCancel={() => setConfirmDeleteId(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
