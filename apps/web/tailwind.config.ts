import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const c = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-latin)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        card: { DEFAULT: c('card'), foreground: c('card-foreground') },
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground'), soft: c('destructive-soft') },
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },
        border: c('border'),
        input: c('input'),
        ring: c('ring'),
        chart: { 1: c('chart-1'), 2: c('chart-2'), 3: c('chart-3'), 4: c('chart-4'), 5: c('chart-5') },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      boxShadow: {
        soft: '0 1px 2px hsl(var(--shadow) / 0.05), 0 8px 24px -10px hsl(var(--shadow) / 0.10)',
        lifted: '0 2px 4px hsl(var(--shadow) / 0.06), 0 18px 40px -12px hsl(var(--shadow) / 0.18)',
      },
    },
  },
  plugins: [animate],
};
export default config;
