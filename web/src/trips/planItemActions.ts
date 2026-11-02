import { useCallback } from 'react'
import {
  createPlanItem,
  deletePlanItem,
  demotePlanItem,
  fetchDay,
  movePlanItem,
  setPlanItemStatus,
  updatePlanItem,
  type Day,
  type PlanItem,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { splitAmount } from './splitAmount'
import {
  fieldsToInput,
  mergeInput,
  tempPlanItem,
  type PlanItemFormFields,
} from './planItemForm.helpers'

export const PLAN_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

// usePlanItemActions bundles the online/offline-aware writes for one plan item
// (status, update, move, demote, delete). Every write queues offline and
// reflects optimistically, exactly like the old per-row controls did.
export function usePlanItemActions({
  tripId,
  onUpdated,
  onRemoved,
  onAdded,
}: {
  tripId: string
  onUpdated: (item: PlanItem) => void
  onRemoved: (id: string) => void
  onAdded?: (item: PlanItem) => void
}) {
  const online = useIsOnline()

  const setStatus = useCallback(
    async (item: PlanItem, status: string) => {
      if (!online) {
        await enqueue('setPlanItemStatus', { tripId, itemId: item.id, status })
        onUpdated({ ...item, status })
        return
      }
      onUpdated(await setPlanItemStatus(tripId, item.id, status))
    },
    [online, tripId, onUpdated],
  )

  const save = useCallback(
    async (item: PlanItem, fields: PlanItemFormFields, splitParts = 1) => {
      const base = fieldsToInput(fields, item.day_id ?? null)
      if (splitParts > 1 && base.cost != null && base.cost > 0) {
        const shares = splitAmount(base.cost, splitParts)
        const firstInput = {
          ...base,
          title: `${base.title} (part 1/${splitParts})`,
          cost: shares[0],
        }
        const partInputs = Array.from({ length: splitParts - 1 }, (_, i) => ({
          ...base,
          title: `${base.title} (part ${i + 2}/${splitParts})`,
          cost: shares[i + 1],
        }))
        if (!online) {
          await enqueue('updatePlanItem', { tripId, itemId: item.id, input: firstInput })
          onUpdated(mergeInput(item, tripId, firstInput))
          for (const input of partInputs) {
            const withId = { ...input, id: crypto.randomUUID() }
            await enqueue('createPlanItem', { tripId, input: withId })
            onAdded?.(tempPlanItem(tripId, item.day_id ?? null, withId))
          }
          return
        }
        onUpdated(await updatePlanItem(tripId, item.id, firstInput))
        for (const input of partInputs) onAdded?.(await createPlanItem(tripId, input))
        return
      }
      if (!online) {
        await enqueue('updatePlanItem', { tripId, itemId: item.id, input: base })
        onUpdated(mergeInput(item, tripId, base))
        return
      }
      onUpdated(await updatePlanItem(tripId, item.id, base))
    },
    [online, tripId, onUpdated, onAdded],
  )

  const moveToDay = useCallback(
    async (item: PlanItem, targetDate: string): Promise<PlanItem> => {
      if (!online) {
        const cached = await readCache<Day>(cacheKeys.day(tripId, targetDate))
        if (!cached) throw new Error("That day isn't cached for offline use yet.")
        await enqueue('movePlanItem', { tripId, itemId: item.id, dayId: cached.data.id })
        const moved: PlanItem = {
          ...item,
          day_id: cached.data.id,
          sort_order: Number.MAX_SAFE_INTEGER,
        }
        void writeCache(cacheKeys.day(tripId, targetDate), {
          ...cached.data,
          plan_items: [...cached.data.plan_items, moved],
        })
        onRemoved(item.id)
        return moved
      }
      const target = await fetchDay(tripId, targetDate)
      await movePlanItem(tripId, item.id, target.id)
      onRemoved(item.id)
      return { ...item, day_id: target.id, sort_order: Number.MAX_SAFE_INTEGER }
    },
    [online, tripId, onRemoved],
  )

  const demote = useCallback(
    async (item: PlanItem) => {
      if (!online) await enqueue('demotePlanItem', { tripId, itemId: item.id })
      else await demotePlanItem(tripId, item.id)
      onRemoved(item.id)
    },
    [online, tripId, onRemoved],
  )

  const remove = useCallback(
    async (item: PlanItem) => {
      if (!online) await enqueue('deletePlanItem', { tripId, itemId: item.id })
      else await deletePlanItem(tripId, item.id)
      onRemoved(item.id)
    },
    [online, tripId, onRemoved],
  )

  return { setStatus, save, moveToDay, demote, remove }
}
