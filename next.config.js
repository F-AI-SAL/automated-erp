/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dispatcher worker uses `pg` directly; keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
