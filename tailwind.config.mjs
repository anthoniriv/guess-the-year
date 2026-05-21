/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          pink: "#ff2bd6",
          cyan: "#00fff0",
          purple: "#a020f0",
          yellow: "#fff95b",
        },
      },
      boxShadow: {
        neon: "0 0 8px currentColor, 0 0 24px currentColor",
      },
      fontFamily: {
        display: ["'Orbitron'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
