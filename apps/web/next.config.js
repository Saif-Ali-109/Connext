/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['lucide-react', '@connext/db'],
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';
    return [
      {
        source: '/api/server/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
