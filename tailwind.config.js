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
          50: '#f1f7f3',
          100: '#eaf5ef',
          200: '#dceee6',
          300: '#c6e5d3',
          400: '#63aa98',
          500: '#26755e',
          600: '#1d634e',
          700: '#194f3f',
          800: '#153f33',
          900: '#102f26',
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