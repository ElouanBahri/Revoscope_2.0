/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "rgb(var(--surface-1) / <alpha-value>)",
        plane: "rgb(var(--page-plane) / <alpha-value>)",
        ink: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
        },
        line: "rgb(var(--gridline) / <alpha-value>)",
        baseline: "rgb(var(--baseline) / <alpha-value>)",
        series: {
          1: "rgb(var(--series-1) / <alpha-value>)",
          2: "rgb(var(--series-2) / <alpha-value>)",
          3: "rgb(var(--series-3) / <alpha-value>)",
          4: "rgb(var(--series-4) / <alpha-value>)",
          5: "rgb(var(--series-5) / <alpha-value>)",
          6: "rgb(var(--series-6) / <alpha-value>)",
          7: "rgb(var(--series-7) / <alpha-value>)",
          8: "rgb(var(--series-8) / <alpha-value>)",
        },
        status: {
          good: "rgb(var(--status-good) / <alpha-value>)",
          warning: "rgb(var(--status-warning) / <alpha-value>)",
          serious: "rgb(var(--status-serious) / <alpha-value>)",
          critical: "rgb(var(--status-critical) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
