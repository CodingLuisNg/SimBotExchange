/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0a0a',
          primary: '#33ff00',
          secondary: '#ffb000',
          muted: '#1f521f',
          error: '#ff3333',
          border: '#1f521f',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        none: '0',
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'typing': 'typing 3.5s steps(40, end)',
        'glitch': 'glitch 0.3s ease-in-out',
      },
      keyframes: {
        blink: {
          'from, to': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        typing: {
          'from': { width: '0' },
          'to': { width: '100%' },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '33%': { transform: 'translate(-2px, 2px)' },
          '66%': { transform: 'translate(2px, -2px)' },
        },
      },
    },
  },
  plugins: [],
}
