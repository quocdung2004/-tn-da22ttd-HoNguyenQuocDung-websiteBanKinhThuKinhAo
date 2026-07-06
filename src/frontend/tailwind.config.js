/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/react/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  safelist: [
    {
      pattern: /^(bg|text|border|fill|stroke)-(blue|indigo|emerald|rose|amber|slate)(-(50|100|200|300|400|500|600|700|800|900|950))?$/,
      variants: ['hover', 'focus'],
    },
  ],
  plugins: [],
}