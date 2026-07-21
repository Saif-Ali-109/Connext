/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['lucide-react', '@connext/db'],
};

module.exports = nextConfig;
