import type { TripTodo } from '../lib/api'

// Pure helpers for the Prep tab's to-do list: date labels and grouping.

// shortDate renders YYYY-MM-DD as "18 Nov".
export function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// daysBetween is the whole-day difference to - from (both YYYY-MM-DD).
function daysBetween(from: string, to: string): number {
  const ms = new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000)
}

// dueLabel describes a deadline relative to today: "Today", "Tomorrow",
// "In 5 days", "2 days late". Done to-dos just show the date.
export function dueLabel(due: string, today: string, done: boolean): string {
  if (done) return shortDate(due)
  const d = daysBetween(today, due)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d > 1) return d <= 14 ? `In ${d} days` : shortDate(due)
  return d === -1 ? '1 day late' : `${-d} days late`
}

export interface TodoGroup {
  key: string
  title: string
  todos: TripTodo[]
}

// groupTodos buckets to-dos for display: "Overdue" (open, past their date)
// first, then one group per due date in order ("By 18 Nov"), then "Anytime"
// for undated ones. Done to-dos stay in their date group.
export function groupTodos(todos: TripTodo[], today: string): TodoGroup[] {
  const overdue: TripTodo[] = []
  const byDate = new Map<string, TripTodo[]>()
  const anytime: TripTodo[] = []
  for (const t of todos) {
    if (!t.due_date) anytime.push(t)
    else if (!t.done && t.due_date < today) overdue.push(t)
    else {
      const bucket = byDate.get(t.due_date)
      if (bucket) bucket.push(t)
      else byDate.set(t.due_date, [t])
    }
  }
  const groups: TodoGroup[] = []
  if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', todos: overdue })
  for (const date of [...byDate.keys()].sort()) {
    groups.push({ key: date, title: `By ${shortDate(date)}`, todos: byDate.get(date)! })
  }
  if (anytime.length) groups.push({ key: 'anytime', title: 'Anytime', todos: anytime })
  return groups
}
