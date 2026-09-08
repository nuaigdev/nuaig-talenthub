import Link from 'next/link'

/**
 * The NuAIg wordmark (spec.md §5.5).
 *
 * The SVGs ship as-is and are never recoloured, stretched or filtered — width
 * is derived from the asset's own 362.5×150 viewBox so the aspect ratio cannot
 * drift. The artwork carries its own internal padding, which supplies the
 * required clear space around the mark.
 *
 * `variant="white"` exists for a dark or brand-tinted surface. Nothing in v1
 * uses it (the whole UI is light), but the asset is shipped per §5.5.
 */

const ASPECT_RATIO = 362.5 / 150

export function Logo({
  href,
  height = 34,
  variant = 'default',
  label = 'NuAIg',
}: {
  /** Where the mark links to: the application start, or the dashboard home. */
  href: string
  height?: number
  variant?: 'default' | 'white'
  label?: string
}) {
  const src = variant === 'white' ? '/brand/logo-white.svg' : '/brand/logo.svg'

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
      aria-label={`${label} — home`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        width={Math.round(height * ASPECT_RATIO)}
        height={height}
        style={{ height, width: 'auto' }}
      />
    </Link>
  )
}
