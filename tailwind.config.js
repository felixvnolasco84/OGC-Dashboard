/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
      extend: {
        keyframes: {
          'accordion-down': {
            from: {
              height: '0'
            },
            to: {
              height: 'var(--radix-accordion-content-height)'
            }
          },
          'accordion-up': {
            from: {
              height: 'var(--radix-accordion-content-height)'
            },
            to: {
              height: '0'
            }
          }
        },
        animation: {
          'accordion-down': 'accordion-down 0.2s ease-out',
          'accordion-up': 'accordion-up 0.2s ease-out'
        },
        fontFamily: {
          helvetica: [
            'Helvetica Neue',
            '-apple-system',
            'BlinkMacSystemFont',
            'Segoe UI',
            'Roboto',
            'Oxygen',
            'Ubuntu',
            'Cantarell',
            'sans-serif'
          ],
          sans: [
            'Helvetica Neue',
            '-apple-system',
            'BlinkMacSystemFont',
            'Segoe UI',
            'Roboto',
            'Oxygen',
            'Ubuntu',
            'Cantarell',
            'sans-serif'
          ]
        },
        borderRadius: {
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)'
        },
        colors: {
          background: 'hsl(var(--background) / <alpha-value>)',
          foreground: 'hsl(var(--foreground) / <alpha-value>)',
          card: {
            DEFAULT: 'hsl(var(--card) / <alpha-value>)',
            foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
          },
          popover: {
            DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
            foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
          },
          primary: {
            DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
            foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
          },
          secondary: {
            DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
            foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
          },
          muted: {
            DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
            foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
          },
          subtle: {
            DEFAULT: 'hsl(var(--subtle) / <alpha-value>)',
            foreground: 'hsl(var(--subtle-foreground) / <alpha-value>)'
          },
          disabled: {
            DEFAULT: 'hsl(var(--disabled) / <alpha-value>)',
            foreground: 'hsl(var(--disabled-foreground) / <alpha-value>)'
          },
          inverse: {
            DEFAULT: 'hsl(var(--inverse) / <alpha-value>)',
            foreground: 'hsl(var(--inverse-foreground) / <alpha-value>)'
          },
          'on-color': 'hsl(var(--on-color) / <alpha-value>)',
          accent: {
            DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
            foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
          },
          destructive: {
            DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
            foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
          },
          border: 'hsl(var(--border) / <alpha-value>)',
          'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
          input: 'hsl(var(--input) / <alpha-value>)',
          ring: 'hsl(var(--ring) / <alpha-value>)',
          overlay: 'hsl(var(--overlay) / <alpha-value>)',
          chart: {
            '1': 'hsl(var(--chart-1))',
            '2': 'hsl(var(--chart-2))',
            '3': 'hsl(var(--chart-3))',
            '4': 'hsl(var(--chart-4))',
            '5': 'hsl(var(--chart-5))'
          },
          sidebar: {
            DEFAULT: 'hsl(var(--sidebar-background) / <alpha-value>)',
            foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
            primary: 'hsl(var(--sidebar-primary) / <alpha-value>)',
            'primary-foreground': 'hsl(var(--sidebar-primary-foreground) / <alpha-value>)',
            accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
            'accent-foreground': 'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
            border: 'hsl(var(--sidebar-border) / <alpha-value>)',
            ring: 'hsl(var(--sidebar-ring) / <alpha-value>)'
          }
        }
      }
    },
  plugins: [require("tailwindcss-animate")],
};
