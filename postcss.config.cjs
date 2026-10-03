// CommonJS on purpose: some Node versions wrap an ES-module config in a "default" field, and Next.js
// then cannot find the "plugins" key ("Your custom PostCSS configuration must export a `plugins` key").
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
