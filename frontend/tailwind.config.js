/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cr: {
          bg: '#090d16',
          surface: '#111728',
          card: '#151d33',
          cardHover: '#1c2642',
          border: 'rgba(255, 255, 255, 0.08)',
          borderLight: 'rgba(255, 255, 255, 0.14)',
          cyan: '#38bdf8',
          indigo: '#6366f1',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          purple: '#a855f7',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'card': '0 4px 24px -1px rgba(0, 0, 0, 0.28)',
        'glow-cyan': '0 0 20px -4px rgba(56, 189, 248, 0.35)',
        'glow-indigo': '0 0 20px -4px rgba(99, 102, 241, 0.35)',
        'glow-emerald': '0 0 20px -4px rgba(16, 185, 129, 0.35)',
        'glow-rose': '0 0 20px -4px rgba(244, 63, 94, 0.35)',
        'glow-amber': '0 0 20px -4px rgba(245, 158, 11, 0.35)',
      }
    },
  },
  plugins: [],
}
