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
        },
        ink: 'var(--color-ink)',
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
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(17 17 17 / 0.04), 0 1px 3px 0 rgb(17 17 17 / 0.06)',
        card: '0 1px 2px 0 rgb(17 17 17 / 0.04), 0 4px 12px -2px rgb(17 17 17 / 0.06)',
      },
    },
  },
  plugins: [],
}

export default config
