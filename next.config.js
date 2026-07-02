/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean, self-contained server bundle for Docker/Coolify.
  output: "standalone",
  // The dispatcher worker uses `pg` directly; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
