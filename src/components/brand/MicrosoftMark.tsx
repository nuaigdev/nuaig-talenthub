/**
 * The Microsoft four-square mark, for the SSO button.
 *
 * Reproduced at its official colours and proportions — the mark is Microsoft's
 * and must not be recoloured or restyled, so the fills are literals here rather
 * than theme tokens (spec §5.5's rule about not altering a logo applies to
 * someone else's mark just as much as to our own).
 */
export function MicrosoftMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 23 23"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  )
}
