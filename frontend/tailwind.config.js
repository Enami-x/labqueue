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
          bg: '#080b11',
          surface: '#0f1523',
          card: '#141c2e',
          cardHover: '#1a243b',
          border: '#1f2b45',
          borderLight: '#2c3c61',
          cyan: '#00f0ff',
          emerald: '#00ff88',
          amber: '#ffb703',
          rose: '#ff3366',
          purple: '#a855f7',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 15px -3px rgba(0, 240, 255, 0.3)',
        'glow-emerald': '0 0 15px -3px rgba(0, 255, 136, 0.3)',
        'glow-rose': '0 0 15px -3px rgba(255, 51, 102, 0.3)',
        'glow-amber': '0 0 15px -3px rgba(255, 183, 3, 0.3)',
      }
    },
  },
  plugins: [],
}
