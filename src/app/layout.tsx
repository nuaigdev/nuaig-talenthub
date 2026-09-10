import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ogImage, siteDescription, siteName, siteTagline, siteUrl } from '@/lib/site'
import './globals.css'

/**
 * Inter, per spec.md §5.4, exposed as `--font-inter` so the Tailwind `sans`
 * stack (tailwind.config.ts) picks it up with a system fallback.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  // Absolute origin for every relative URL below — link-preview crawlers
  // reject relative image paths, so this has to be set for `/og.png` to work.
  metadataBase: new URL(siteUrl),
  // The internal repo name `talenthub` is never shown in product UI (spec.md §1).
  title: {
    default: siteTagline,
    template: '%s · NuAIg',
  },
  description: siteDescription,
  // `noindex` keeps this out of search results; it does not affect the link
  // previews below, which crawlers fetch regardless of robots directives.
  robots: { index: false, follow: false },
  icons: { icon: '/brand/logo.svg' },
  applicationName: siteName,
  // Declared on the root layout so every route inherits a preview. Next merges
  // metadata shallowly, so a page overriding `openGraph` must restate all of it.
  openGraph: {
    type: 'website',
    siteName,
    title: siteTagline,
    description: siteDescription,
    url: siteUrl,
    locale: 'en_US',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTagline,
    description: siteDescription,
    images: [ogImage.url],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-bg font-sans antialiased">
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
