/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['lucide-react', '@connext/db'],
  async rewrites() {
    // Trailing slash would produce `//path` destinations Express rejects with 404.
    const backendUrl = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001').replace(
      /\/+$/,
      ''
    );
    return [
      {
        source: '/api/server/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
