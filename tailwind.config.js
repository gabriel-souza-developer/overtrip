/** @type {import('tailwindcss').Config} */

// Variável CSS -> cor Tailwind com suporte a opacidade (ex.: `bg-primary-50/50`).
// As variáveis guardam canais "r g b" (ver src/validators/organizationBrand.ts),
// não "#rrggbb": é esse formato que `rgb(var(x) / <alpha-value>)` exige.
function withOpacity(variableName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${variableName}))` : `rgb(var(${variableName}) / ${opacityValue})`;
}

export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cada tom lê a variável CSS correspondente (default em :root, ver
        // frontend/src/index.css), nunca um hex fixo: assim todo utilitário
        // primary-* segue a identidade de quem está no elemento raiz do
        // momento — o laranja da OVERTRIP por padrão, ou a cor derivada da
        // empresa quando o painel de agência a sobrescreve (ver
        // src/validators/organizationBrand.ts e OrganizationLayout.tsx).
        // A OVERTRIP não é um caso especial aqui: é só mais um tenant, com
        // sua cor (#ff5a00, a mesma da tela de acesso) passando pela mesma
        // derivação de paleta que qualquer empresa usaria.
        primary: {
          50: withOpacity('--color-primary-50'),
          100: withOpacity('--color-primary-100'),
          200: withOpacity('--color-primary-200'),
          300: withOpacity('--color-primary-300'),
          400: withOpacity('--color-primary-400'),
          500: withOpacity('--color-primary-500'),
          600: withOpacity('--color-primary-600'),
          700: withOpacity('--color-primary-700'),
          800: withOpacity('--color-primary-800'),
          900: withOpacity('--color-primary-900'),
          vivid: withOpacity('--color-primary-vivid'),
          solid: withOpacity('--color-primary-solid'),
        },
        // Cinza neutro da interface (texto, bordas, fundos de chrome):
        // também por variável CSS, mas com um único valor fixo em :root —
        // não é derivado de marca nenhuma, agência ou OVERTRIP.
        surface: {
          50: withOpacity('--color-surface-50'),
          100: withOpacity('--color-surface-100'),
          200: withOpacity('--color-surface-200'),
          300: withOpacity('--color-surface-300'),
          400: withOpacity('--color-surface-400'),
          500: withOpacity('--color-surface-500'),
          600: withOpacity('--color-surface-600'),
          700: withOpacity('--color-surface-700'),
          800: withOpacity('--color-surface-800'),
          900: withOpacity('--color-surface-900'),
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
