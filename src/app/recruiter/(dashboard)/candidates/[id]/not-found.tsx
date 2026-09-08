import Link from 'next/link'
import { Card } from '@/components/ui'

export default function CandidateNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <Card className="p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Candidate not found</h1>
        <p className="mt-1.5 text-sm text-secondary">
          That Candidate ID does not match any application.
        </p>
        <Link
          href="/recruiter"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          Back to dashboard
        </Link>
      </Card>
    </div>
  )
}
