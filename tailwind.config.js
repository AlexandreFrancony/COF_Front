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
        terracota: {
          DEFAULT: '#C65F3C',
          hover: '#B34924',
          'dark-hover': '#D87D5C',
        },
      },
    },
  },
  plugins: [],
};
