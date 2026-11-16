import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Local staging can run beside a production build. Vercel's Next adapter
  // expects the standard output directory for both preview and production.
  distDir: process.env.ERP_STAGING === 'true' && process.env.VERCEL !== '1' ? '.next-staging' : '.next',
  reactStrictMode: true,
  typescript: {
    tsconfigPath: './tsconfig.application.json',
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'motion'],
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
};

export default nextConfig;
