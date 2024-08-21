/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        // Related to Pino error with RSC: https://github.com/orgs/vercel/discussions/3150
        serverComponentsExternalPackages: ['pino', 'pino-pretty'],
      },
};

export default nextConfig;
