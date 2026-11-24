import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { ContactLookup, DistrictLookup } from './ContactLookup'
import { MultiContactLookup } from './MultiContactLookup'
import type { ContactOption, DistrictOption } from './meetingReportTypes'

const sara: ContactOption = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Sara Rahimi',
  email: 'sara@example.com',
  jobTitle: 'Volunteer',
}
const ali: ContactOption = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Ali Staff',
  email: 'ali@example.com',
  jobTitle: 'Staff',
}

function StatefulMultiContactLookup({ kind = 'staff' }: { kind?: 'staff' | 'volunteer' }) {
  const [values, setValues] = useState<readonly ContactOption[]>([ali])
  return (
    <MultiContactLookup
      label={kind === 'staff' ? 'Tag Staff Members' : 'Tag Volunteers'}
      kind={kind}
      values={values}
      onChange={setValues}
      loadOptions={async () => [ali, sara]}
      debounceMs={0}
    />
  )
}

afterEach(() => {
  vi.useRealTimers()
})

test('debounces Contact search and ignores stale results', async () => {
  vi.useFakeTimers()
  const pending: Array<(value: readonly ContactOption[]) => void> = []
  const loadOptions = vi.fn((_search: string) => new Promise<readonly ContactOption[]>((resolve) => pending.push(resolve)))
  const onChange = vi.fn()
  render(<ContactLookup label="Representative / Office" value={null} onChange={onChange} loadOptions={loadOptions} />)

  const input = screen.getByRole('combobox', { name: 'Representative / Office' })
  await act(async () => {
    input.focus()
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'a' }))
    await vi.advanceTimersByTimeAsync(350)
  })
  expect(loadOptions).toHaveBeenCalledTimes(1)

  await act(async () => {
    pending[0]([sara])
    await Promise.resolve()
  })
  expect(screen.getByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
})

test('invalidates an in-flight lookup immediately when raw search text changes', async () => {
  vi.useFakeTimers()
  const pending: Array<(value: readonly ContactOption[]) => void> = []
  const loadOptions = vi.fn((_search: string) => new Promise<readonly ContactOption[]>((resolve) => pending.push(resolve)))
  render(<ContactLookup label="Representative / Office" value={null} onChange={vi.fn()} loadOptions={loadOptions} />)

  const input = screen.getByRole('combobox', { name: 'Representative / Office' })
  await act(async () => {
    input.focus()
    await vi.advanceTimersByTimeAsync(350)
  })
  expect(loadOptions).toHaveBeenCalledTimes(1)

  await act(async () => {
    fireEvent.change(input, { target: { value: 'new' } })
    pending[0]([sara])
    await Promise.resolve()
  })

  expect(screen.queryByRole('option', { name: /Sara Rahimi/ })).not.toBeInTheDocument()
})

test('selects and clears a representative', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <ContactLookup
      label="Representative / Office"
      value={null}
      onChange={onChange}
      loadOptions={async () => [sara]}
      debounceMs={0}
    />,
  )

  await user.click(screen.getByRole('combobox', { name: 'Representative / Office' }))
  await user.click(await screen.findByRole('option', { name: /Sara Rahimi/ }))
  expect(onChange).toHaveBeenCalledWith(sara)

  await user.click(screen.getByRole('combobox', { name: 'Representative / Office' }))
  expect(screen.getByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
})

test('keeps selected values inside every single lookup field', () => {
  const district: DistrictOption = { id: '33333333-3333-3333-3333-333333333333', name: 'DC' }
  render(
    <>
      <ContactLookup label="Representative / Office" value={sara} onChange={vi.fn()} loadOptions={async () => []} />
      <DistrictLookup label="State / District" value={district} onChange={vi.fn()} loadOptions={async () => []} />
    </>,
  )

  const representativeControl = screen.getByRole('combobox', { name: 'Representative / Office' }).parentElement
  const districtControl = screen.getByRole('combobox', { name: 'State / District' }).parentElement

  expect(representativeControl).toHaveClass('meeting-report-lookup__control')
  expect(representativeControl).toContainElement(screen.getByText('Sara Rahimi'))
  expect(representativeControl).toContainElement(screen.getByRole('button', { name: 'Clear Representative / Office' }))
  expect(districtControl).toHaveClass('meeting-report-lookup__control')
  expect(districtControl).toContainElement(screen.getByText('DC'))
  expect(districtControl).toContainElement(screen.getByRole('button', { name: 'Clear State / District' }))
})

test('compact selection hides replacement search and returns keyboard focus to search when cleared', async () => {
  const user = userEvent.setup()
  function CompactLookup() {
    const [value, setValue] = useState<ContactOption | null>(null)
    return <ContactLookup label="Contact" compactSelection value={value} onChange={setValue} loadOptions={async () => [sara]} debounceMs={0} />
  }
  render(<CompactLookup />)
  await user.click(screen.getByRole('combobox', { name: 'Contact' }))
  const option = await screen.findByRole('option', { name: /Sara Rahimi/ })
  option.focus()
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('combobox', { name: 'Contact' })).not.toBeInTheDocument()
  expect(screen.queryByPlaceholderText('Search to replace...')).not.toBeInTheDocument()
  const clear = screen.getByRole('button', { name: 'Clear Contact' })
  expect(clear).toHaveFocus()
  expect(clear.parentElement).toHaveTextContent('Sara Rahimi')
  await user.keyboard('{Enter}')
  expect(screen.getByRole('combobox', { name: 'Contact' })).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Clear Contact' })).not.toBeInTheDocument()
})

test('compact selection keeps the selected contact immutable while disabled', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<ContactLookup label="Contact" compactSelection value={sara} onChange={onChange} disabled loadOptions={async () => []} />)
  const clear = screen.getByRole('button', { name: 'Clear Contact' })
  expect(clear).toBeDisabled()
  await user.click(clear)
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('combobox', { name: 'Contact' })).not.toBeInTheDocument()
})

test.each(['staff', 'volunteer'] as const)('shows selected %s names immediately while preserving checkbox multi-selection and search', async (kind) => {
  const user = userEvent.setup()
  render(<StatefulMultiContactLookup kind={kind} />)

  const label = kind === 'staff' ? 'Tag Staff Members' : 'Tag Volunteers'
  const trigger = screen.getByRole('combobox', { name: label })
  expect(trigger).toHaveTextContent('Ali Staff')
  await user.click(trigger)

  const aliCheckbox = await screen.findByRole('checkbox', { name: /Ali Staff/ })
  const saraCheckbox = screen.getByRole('checkbox', { name: /Sara Rahimi/ })
  expect(aliCheckbox).toBeChecked()
  expect(saraCheckbox).not.toBeChecked()
  expect(screen.getByRole('searchbox', { name: `Search ${label}` })).toBeInTheDocument()

  await user.click(saraCheckbox)
  expect(trigger).toHaveTextContent('Ali Staff, Sara Rahimi')
  expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await user.click(aliCheckbox)
  expect(trigger).toHaveTextContent('Sara Rahimi')
  expect(aliCheckbox).not.toBeChecked()

  await user.keyboard('{Escape}')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await user.click(trigger)
  await user.click(screen.getByRole('checkbox', { name: /Sara Rahimi/ }))
  expect(trigger).toHaveTextContent(kind === 'staff' ? 'Select staff members' : 'Select volunteers')
})

test.each(['staff', 'volunteer'] as const)('shows saved %s names before lookup results arrive and across searches', async (kind) => {
  const user = userEvent.setup()
  const third: ContactOption = { ...ali, id: '33333333-3333-3333-3333-333333333333', name: 'Test User 10' }
  const values = Object.freeze([ali, sara, third])
  const label = kind === 'staff' ? 'Tag Staff Members' : 'Tag Volunteers'
  const loadOptions = vi.fn(async () => [])
  const onChange = vi.fn()
  render(<MultiContactLookup label={label} kind={kind} values={values} onChange={onChange} loadOptions={loadOptions} debounceMs={0} />)

  const trigger = screen.getByRole('combobox', { name: label })
  expect(trigger).toHaveTextContent('Ali Staff, Sara Rahimi, Test User 10')
  expect(trigger.querySelector('span')).toHaveAttribute('title', 'Ali Staff, Sara Rahimi, Test User 10')
  await user.click(trigger)
  await screen.findByRole('checkbox', { name: /Test User 10/ })
  await user.type(screen.getByRole('searchbox', { name: `Search ${label}` }), 'unrelated')
  await waitFor(() => expect(loadOptions).toHaveBeenLastCalledWith('unrelated', expect.any(AbortSignal)))
  expect(trigger).toHaveTextContent('Ali Staff, Sara Rahimi, Test User 10')
  expect(onChange).not.toHaveBeenCalled()
  expect(values.map(value => value.id)).toEqual([
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
  ])
})

test.each([
  ['staff', 'Tag Staff Members', 'Select staff members'],
  ['volunteer', 'Tag Volunteers', 'Select volunteers'],
] as const)('shows the empty %s placeholder', (kind, label, placeholder) => {
  render(<MultiContactLookup label={label} kind={kind} values={[]} onChange={vi.fn()} loadOptions={async () => []} />)
  expect(screen.getByRole('combobox', { name: label })).toHaveTextContent(placeholder)
})

test('renders District loading errors and allows retry', async () => {
  const user = userEvent.setup()
  const district: DistrictOption = { id: '33333333-3333-3333-3333-333333333333', name: 'DC' }
  const loadOptions = vi.fn()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce([district])
  render(
    <DistrictLookup
      label="State / District"
      value={null}
      onChange={vi.fn()}
      loadOptions={loadOptions}
      debounceMs={0}
    />,
  )

  await user.click(screen.getByRole('combobox', { name: 'State / District' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Options could not be loaded.')
  await user.click(screen.getByRole('button', { name: 'Retry State / District lookup' }))
  expect(await screen.findByRole('option', { name: 'DC' })).toBeInTheDocument()
})

test('appends additional contact pages on demand without duplicate IDs and selects the later contact', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const loader = vi.fn(async (_search: string, _signal?: AbortSignal, nextLink?: string | null) => (
    nextLink ? { options: [sara, ali], nextLink: null } : { options: [sara], nextLink: 'page-two' }
  ))
  render(<ContactLookup label="Contact" value={null} onChange={onChange} loadOptions={loader} debounceMs={0} />)
  await user.click(screen.getByRole('combobox', { name: 'Contact' }))
  await screen.findByRole('option', { name: /Sara Rahimi/ })
  expect(screen.queryByRole('option', { name: /Ali Staff/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Load more contacts' }))
  await user.click(await screen.findByRole('option', { name: /Ali Staff/ }))
  expect(onChange).toHaveBeenCalledWith(ali)
  expect(loader).toHaveBeenCalledTimes(2)
})

test('ignores a late additional contact page after a new search', async () => {
  const user = userEvent.setup()
  let resolveMore!: (page: { options: readonly ContactOption[]; nextLink: null }) => void
  const loader = vi.fn((search: string, _signal?: AbortSignal, nextLink?: string | null) => {
    if (nextLink) return new Promise<{ options: readonly ContactOption[]; nextLink: null }>(resolve => { resolveMore = resolve })
    return Promise.resolve({ options: search ? [ali] : [sara], nextLink: search ? null : 'page-two' })
  })
  render(<ContactLookup label="Contact" value={null} onChange={vi.fn()} loadOptions={loader} debounceMs={0} />)
  const input = screen.getByRole('combobox', { name: 'Contact' })
  await user.click(input)
  await screen.findByRole('option', { name: /Sara Rahimi/ })
  await user.click(screen.getByRole('button', { name: 'Load more contacts' }))
  await user.type(input, 'Ali')
  await screen.findByRole('option', { name: /Ali Staff/ })
  await act(async () => resolveMore({ options: [sara], nextLink: null }))
  expect(screen.queryByRole('option', { name: /Sara Rahimi/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('option')).toHaveLength(1)
})

test('retains existing contacts and retries only a failed additional page', async () => {
  const user = userEvent.setup()
  let attempts = 0
  const loader = vi.fn(async (_search: string, _signal?: AbortSignal, nextLink?: string | null) => {
    if (!nextLink) return { options: [sara], nextLink: 'page-two' }
    if (++attempts === 1) throw new Error('temporary failure')
    return { options: [ali, sara], nextLink: null }
  })
  render(<ContactLookup label="Contact" value={null} onChange={vi.fn()} loadOptions={loader} debounceMs={0} />)
  await user.click(screen.getByRole('combobox', { name: 'Contact' }))
  await screen.findByRole('option', { name: /Sara Rahimi/ })
  await user.click(screen.getByRole('button', { name: 'Load more contacts' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry loading contacts' }))
  await screen.findByRole('option', { name: /Ali Staff/ })
  expect(screen.getAllByRole('option')).toHaveLength(2)
  expect(loader).toHaveBeenCalledTimes(3)
})


test('opt-in normalized lookup keeps results for equivalent whitespace without extra requests', async () => {
  const loader = vi.fn(async () => [sara])
  render(<ContactLookup label="Appointment Contact" value={null} onChange={vi.fn()} loadOptions={loader} debounceMs={0}
    normalizeSearch={value => value.trim().replace(/\s+/g, ' ')} emptyMessage="No matching contacts found" />)
  const input = screen.getByRole('combobox', { name: 'Appointment Contact' })
  fireEvent.focus(input)
  expect(await screen.findByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'Sara' } })
  expect(await screen.findByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  const calls = loader.mock.calls.length
  fireEvent.change(input, { target: { value: '  Sara  ' } })
  expect(await screen.findByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  expect(loader).toHaveBeenCalledTimes(calls)
  expect(screen.queryByText(/Loading options/)).not.toBeInTheDocument()
})

test('contact-specific empty text is opt-in', async () => {
  render(<ContactLookup label="Appointment Contact" value={null} onChange={vi.fn()} loadOptions={async () => []} debounceMs={0} emptyMessage="No matching contacts found" />)
  fireEvent.focus(screen.getByRole('combobox', { name: 'Appointment Contact' }))
  expect(await screen.findByText('No matching contacts found')).toBeInTheDocument()
})


test('opt-in normalized lookup retries when typing returns to an aborted debounced term', async () => {
  vi.useFakeTimers()
  const loader = vi.fn(async (_search: string) => [sara])
  render(<ContactLookup label="Appointment Contact" value={null} onChange={vi.fn()} loadOptions={loader}
    normalizeSearch={value => value.trim().replace(/\s+/g, ' ')} />)
  const input = screen.getByRole('combobox', { name: 'Appointment Contact' })
  await act(async () => { input.focus(); await vi.advanceTimersByTimeAsync(350) })
  await act(async () => { fireEvent.change(input, { target: { value: 'Sara' } }); await vi.advanceTimersByTimeAsync(350) })
  expect(screen.getByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  await act(async () => {
    fireEvent.change(input, { target: { value: 'Sarax' } })
    fireEvent.change(input, { target: { value: 'Sara' } })
    await vi.advanceTimersByTimeAsync(350)
  })
  expect(loader.mock.calls.map(([search]) => search)).toEqual(['', 'Sara', 'Sara'])
  expect(screen.getByRole('option', { name: /Sara Rahimi/ })).toBeInTheDocument()
  expect(screen.queryByText(/Loading options/)).not.toBeInTheDocument()
})
