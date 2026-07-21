/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['lucide-react', '@connext/db'],
  async rewrites() {
    return [
      {
        source: '/api/server/:path*',
        destination: 'http://localhost:4001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
