import { redirect } from 'next/navigation'

/** The product's front door is the candidate application (spec.md §6.1). */
export default function HomePage() {
  redirect('/apply')
}
