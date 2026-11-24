import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { homeScheduleDate, isTodayOrLater, useHomeScheduleToday } from './homeScheduleDates'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test.each([
  ['2026-09-16T03:59:59Z', '2026-09-15', false],
  ['2026-09-16T04:00:00Z', '2026-09-16', true],
  ['2026-09-17T03:59:59Z', '2026-09-16', true],
  ['2026-09-17T04:00:00Z', '2026-09-17', true],
  ['2026-09-16T00:00:00-04:00', '2026-09-16', true],
  ['2026-09-16T06:59:59+03:00', '2026-09-15', false],
  ['not-a-date', null, false],
  ['', null, false],
  [null, null, false],
] as const)('compares %s with the Eastern calendar date', (value, expectedDate, eligible) => {
  expect(homeScheduleDate(value)).toBe(expectedDate)
  expect(isTodayOrLater(value, '2026-09-16')).toBe(eligible)
})

test.each([
  ['2026-03-08T04:59:59Z', '2026-03-07'],
  ['2026-03-08T05:00:00Z', '2026-03-08'],
  ['2026-03-09T03:59:59Z', '2026-03-08'],
  ['2026-03-09T04:00:00Z', '2026-03-09'],
  ['2026-11-01T03:59:59Z', '2026-10-31'],
  ['2026-11-01T04:00:00Z', '2026-11-01'],
  ['2026-11-02T04:59:59Z', '2026-11-01'],
  ['2026-11-02T05:00:00Z', '2026-11-02'],
])('uses the correct Eastern day across DST at %s', (value, expected) => {
  expect(homeScheduleDate(value)).toBe(expected)
})

test('updates at Eastern midnight without navigation and clears its timer on unmount', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T03:59:59.750Z'))
  const { result, unmount } = renderHook(useHomeScheduleToday)
  expect(result.current).toBe('2026-09-16')

  act(() => vi.advanceTimersByTime(249))
  expect(result.current).toBe('2026-09-16')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe('2026-09-17')

  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

test('cleans up focus and visibility listeners on unmount', () => {
  const removeFocus = vi.spyOn(window, 'removeEventListener')
  const removeVisibility = vi.spyOn(document, 'removeEventListener')
  const { unmount } = renderHook(useHomeScheduleToday)
  unmount()
  expect(removeFocus).toHaveBeenCalledWith('focus', expect.any(Function))
  expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  removeFocus.mockRestore()
  removeVisibility.mockRestore()
})
