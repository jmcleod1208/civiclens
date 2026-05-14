/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        teal: {
          50:  '#f0fafa',
          100: '#cceeef',
          200: '#99dcdf',
          300: '#5fc4c9',
          400: '#2faab1',
          500: '#01696f',
          600: '#015a5f',
          700: '#01484d',
          800: '#01373b',
          900: '#002528',
        },
        surface: '#f7f6f2',
        card:    '#ffffff',
        border:  '#e4e2dc',
      },
    },
  },
  plugins: [],
}
