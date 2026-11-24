import { useEffect, useState } from 'react'

export const HOME_SCHEDULE_TIME_ZONE = 'America/New_York'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: HOME_SCHEDULE_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
})

export function homeScheduleDate(value: Date | string | null): string | null {
  if (!value) return null
  const date = typeof value === 'string' ? new Date(value) : value
  if (!Number.isFinite(date.getTime())) return null
  const parts = dateFormatter.formatToParts(date)
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-')
}

export function isTodayOrLater(start: string | null, today: string): boolean {
  const date = homeScheduleDate(start)
  return date !== null && date >= today
}

export function useHomeScheduleToday(): string {
  const [today, setToday] = useState(() => homeScheduleDate(new Date())!)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => setToday(homeScheduleDate(new Date())!)
    const schedule = () => {
      // Align to the clock so Eastern midnight is checked at the day boundary.
      timer = setTimeout(() => {
        refresh()
        schedule()
      }, 60_000 - (Date.now() % 60_000))
    }
    refresh()
    schedule()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return today
}
