import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", ".dark"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem", /* 9px */
        md: ".375rem", /* 6px */
        sm: ".1875rem", /* 3px */
      },
      spacing: {
        px: "var(--spacing-px)",
        "0": "var(--spacing-0)",
        "0.5": "var(--spacing-0_5)",
        "1": "var(--spacing-1)",
        "1.5": "var(--spacing-1_5)",
        "2": "var(--spacing-2)",
        "2.5": "var(--spacing-2_5)",
        "3": "var(--spacing-3)",
        "3.5": "var(--spacing-3_5)",
        "4": "var(--spacing-4)",
        "5": "var(--spacing-5)",
        "6": "var(--spacing-6)",
        "7": "var(--spacing-7)",
        "8": "var(--spacing-8)",
        "9": "var(--spacing-9)",
        "10": "var(--spacing-10)",
        "11": "var(--spacing-11)",
        "12": "var(--spacing-12)",
        "14": "var(--spacing-14)",
        "16": "var(--spacing-16)",
        "20": "var(--spacing-20)",
        "24": "var(--spacing-24)",
        "28": "var(--spacing-28)",
        "32": "var(--spacing-32)",
        "36": "var(--spacing-36)",
        "40": "var(--spacing-40)",
        "44": "var(--spacing-44)",
        "48": "var(--spacing-48)",
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        disabled: {
          DEFAULT: "hsl(var(--disabled) / <alpha-value>)",
          foreground: "hsl(var(--disabled-foreground) / <alpha-value>)",
          border: "hsl(var(--disabled-border) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "hsl(var(--status-online) / <alpha-value>)",
          away: "hsl(var(--status-away) / <alpha-value>)",
          busy: "hsl(var(--status-busy) / <alpha-value>)",
          offline: "hsl(var(--status-offline) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xxs: ["0.625rem", { lineHeight: "0.875rem" }],
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        "nav-sm": ["0.8125rem", { lineHeight: "1.125rem" }],
        "home-eyebrow": ["0.68rem", { lineHeight: "1rem" }],
        "collection-title": ["1.7rem", { lineHeight: "2.125rem" }],
        "section-title": ["1.75rem", { lineHeight: "2.25rem" }],
        "dashboard-metric": ["1.85rem", { lineHeight: "1" }],
        "monitor-hero-sm": ["2.375rem", { lineHeight: "1" }],
        "monitor-hero": ["2.75rem", { lineHeight: "1" }],
        "monitor-hero-sm-expanded": ["3rem", { lineHeight: "1" }],
        "monitor-hero-expanded": ["3.5rem", { lineHeight: "1" }],
      },
      letterSpacing: {
        "label-xs": "0.08em",
        "label-sm": "0.12em",
        "label-md": "0.14em",
        "label-lg": "0.16em",
        "label-xl": "0.18em",
        "label-2xl": "0.2em",
        "label-3xl": "0.22em",
        "label-4xl": "0.24em",
        "label-5xl": "0.26em",
        "label-6xl": "0.28em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
