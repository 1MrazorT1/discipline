/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        paper: "#f7f5f0",
        ink: "#24211d",
        muted: "#767067",
        line: "#ded8cd",
        field: "#fffdf8",
        tomato: "#d95b43",
        mint: "#3f9c75",
        teal: "#2f7f86",
        gold: "#d6a23a"
      }
    }
  },
  plugins: []
};
