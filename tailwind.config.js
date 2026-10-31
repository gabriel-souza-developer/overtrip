/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Escala derivada de --rust (css/base.css), oklch(0.66 0.17 48) = 500.
        primary: {
          50: '#fff1e7',
          100: '#ffe2cf',
          200: '#ffc9a7',
          300: '#ffa977',
          400: '#fa8746',
          500: '#e26b1b',
          600: '#bf5200',
          700: '#993e00',
          800: '#753000',
          900: '#542202',
        },
        surface: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#0d0d0d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}