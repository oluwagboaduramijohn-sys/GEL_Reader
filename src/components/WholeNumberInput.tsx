import { useState } from 'react'

interface Props {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}

/**
 * A whole-number box that lets you type freely. The text is kept as typed
 * and applied only once it's a whole number in range, so clearing the box
 * and typing "20" gives 20 (not "1", then "120", clamped to 30). Leaving the
 * box shows the value in use again.
 */
export function WholeNumberInput({ value, min, max, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const parse = (text: string) => {
    const n = Number(text)
    return text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null
  }
  const invalid = draft !== null && parse(draft) === null
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? value}
      aria-invalid={invalid || undefined}
      title={invalid ? `Enter a whole number from ${min} to ${max}` : undefined}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = parse(e.target.value)
        if (n !== null && n !== value) onChange(n)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
