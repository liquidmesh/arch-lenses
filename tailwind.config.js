/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7fb',
          100: '#eaf0f7',
          200: '#cfe0ef',
          300: '#a6c4e2',
          400: '#6ea0cf',
          500: '#3c76b5',
          600: '#295b94',
          700: '#224a79',
          800: '#1f3d62',
          900: '#1c334f',
        },
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
        gap: {
          ok: '#22c55e',
          warn: '#f59e0b',
          bad: '#ef4444',
        },
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};

