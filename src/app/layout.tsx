import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
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
  // The internal repo name `talenthub` is never shown in product UI (spec.md §1).
  title: {
    default: 'Careers at NuAIg',
    template: '%s · NuAIg',
  },
  description: 'Apply to open roles at NuAIg.',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/logo.svg' },
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
