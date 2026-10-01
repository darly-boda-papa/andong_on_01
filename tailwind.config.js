/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        andong: {
          navy: '#1a446c',
          dark: '#1e232a',
          ink: '#0f172a',
          paper: '#fbf9f3',
          paperDark: '#f2eee3',
          vermilion: '#d94b38',
          gold: '#c59b27',
          gray: '#64748b',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif KR"', 'serif'],
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
