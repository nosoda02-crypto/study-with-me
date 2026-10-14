/** Calendar dates follow the user's local timezone, never UTC. */
export function todayStr(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + delta)
  return todayStr(date)
}
