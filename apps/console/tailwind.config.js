/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF7900",
          dark: "#E86E00",
          light: "#FFF4EB",
          muted: "#FFE8CC",
          black: "#000000",
        },
      },
      boxShadow: {
        card: "0 2px 8px 0 rgb(0 0 0 / 0.08)",
        header: "0 1px 0 0 rgb(0 0 0 / 0.1)",
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
