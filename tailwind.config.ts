import type { Config } from 'tailwindcss'

/**
 * Token names mirror spec.md §5 exactly. Colors are wired through CSS variables
 * declared in src/app/globals.css so the same tokens are usable from raw CSS.
 * Light mode only — no `dark:` variants anywhere in this app (spec.md §5).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover: 'var(--color-brand-hover)',
          subtle: 'var(--color-brand-subtle)',
          deep: 'var(--color-brand-deep)',
          light: 'var(--color-brand-light)',
        },
        ink: 'var(--color-ink)',
        // Dark bands on the careers landing page only (globals.css).
        navy: {
          DEFAULT: 'var(--color-navy)',
          deep: 'var(--color-navy-deep)',
          soft: 'var(--color-navy-soft)',
        },
        bg: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        lg: '10px',
        md: '8px',
        xl: '14px',
        '2xl': '20px',
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(17 17 17 / 0.04), 0 1px 3px 0 rgb(17 17 17 / 0.06)',
        card: '0 1px 2px 0 rgb(17 17 17 / 0.04), 0 4px 12px -2px rgb(17 17 17 / 0.06)',
        // Landing page only — a taller lift for the hero's floating panels.
        lift: '0 2px 4px -1px rgb(6 20 38 / 0.06), 0 18px 40px -12px rgb(6 20 38 / 0.22)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
}

export default config
