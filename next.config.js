/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean, self-contained server bundle for Docker/Coolify. Vercel uses its own
  // build output, so skip standalone there (avoids a build-adapter conflict).
  output: process.env.VERCEL ? undefined : "standalone",
  // The dispatcher worker uses `pg` directly; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
