/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verde/teal do Workspace (#26755e = 500, #1d634e = 600/hover), não o
        // laranja do site público: o painel usa esta escala; a marca e as
        // cores da agência no site público e na prévia do card não mudam.
        primary: {
          50: '#fff1e7',
          100: '#ffe2cf',
          200: '#ffc9a7',
          300: '#ffa977',
          400: '#fa8746',
          500: '#e26b1b',
          600: '#ce4900',
          700: '#ae3e00',
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
