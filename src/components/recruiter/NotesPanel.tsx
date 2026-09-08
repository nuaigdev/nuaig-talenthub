'use client'

import { useRef, useState, useTransition } from 'react'
import { Alert, Button, Spinner, Textarea } from '@/components/ui'
import { formatDateTime } from '@/lib/candidate-view'
import type { NoteEntry } from '@/lib/graph/candidates'
import { addNoteAction } from '@/app/recruiter/actions'

/**
 * Append-only recruiter notes (spec.md §10.2, §3 decision 9).
 *
 * "Save note" appends an entry; there is deliberately no edit or delete
 * affordance, because two recruiters writing at the same moment must both end
 * up in the log. The list reads newest-first.
 */
export function NotesPanel({
  candidateId,
  notes,
}: {
  candidateId: string
  notes: NoteEntry[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setError(null)

    const formData = new FormData()
    formData.set('text', text)

    startTransition(async () => {
      const result = await addNoteAction(candidateId, formData)
      if (result.ok) setText('')
      else setError(result.error)
    })
  }

  const entries = [...notes].reverse()

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-ink">Recruiter notes</h2>

      <form ref={formRef} onSubmit={submit} className="space-y-2">
        <label htmlFor="note-text" className="sr-only">
          Add a note
        </label>
        <Textarea
          id="note-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a note for the team…"
          maxLength={4000}
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Notes are appended and visible to all recruiters.</p>
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
            {pending && <Spinner />}
            {pending ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {entries.length === 0 ? (
        <p className="rounded-md bg-surface px-4 py-6 text-center text-sm text-secondary">
          No notes yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {entries.map((note, index) => (
            <li
              key={`${note.timestamp}-${index}`}
              className="rounded-md border border-border bg-surface-raised p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ink">{note.author || 'Unknown'}</p>
                <p className="text-xs text-muted">{formatDateTime(note.timestamp)}</p>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{note.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
