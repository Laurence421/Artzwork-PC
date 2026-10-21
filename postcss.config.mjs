// Tailwind CSS through PostCSS: works with both of Next's compilers (Turbopack in dev, webpack for deploys).
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
