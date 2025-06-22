/** @type {import('tailwindcss').Config} */
export default {
  // The content array tells Tailwind which files to scan for classes.
  content: ['./src/**/*.{html,js,svelte,ts}'],

  theme: {
    extend: {
      // Here we define your custom theme values.
      colors: {
        parchment: '#fdf6e3',
        ink: '#4a3f35',
        'ink-light': '#6a5f55',
        'border-color': '#d3c7b3',
        'accent-color': '#8b4513',
      },
      fontFamily: {
        // Define custom font families to use with classes like `font-sans` or `font-display`.
        sans: ['IM Fell English', 'serif'],
        display: ['Uncial Antiqua', 'cursive'],
      }
    },
  },

  // No plugins are needed for this setup.
  plugins: [],
}
