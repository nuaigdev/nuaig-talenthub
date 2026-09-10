import { CLIENT_LOGOS } from '@/lib/careers-content'

/**
 * The client strip, scrolling continuously.
 *
 * The track holds the list twice and translates exactly -50%, which puts the
 * duplicate where the original started — so the loop has no seam and no JS.
 * The second copy is `aria-hidden`, so a screen reader hears each provider once.
 * `prefers-reduced-motion` stops the animation (globals.css); the strip then
 * reads as a static row, which is why it is not wider than the viewport at rest.
 */
export function LogoMarquee() {
  return (
    <div
      className="relative overflow-hidden py-2"
      style={{
        // Fade both ends into the section ground rather than cutting the logos.
        maskImage: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
      }}
    >
      <ul className="animate-marquee flex w-max items-center gap-14">
        {[0, 1].map((copy) =>
          CLIENT_LOGOS.map((logo) => (
            <li key={`${copy}-${logo.src}`} aria-hidden={copy === 1 || undefined} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.src}
                alt={copy === 1 ? '' : logo.alt}
                loading="lazy"
                decoding="async"
                className="h-10 w-auto max-w-[160px] object-contain opacity-75 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0 sm:h-12"
              />
            </li>
          )),
        )}
      </ul>
    </div>
  )
}
