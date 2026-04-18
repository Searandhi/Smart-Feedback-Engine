import {withSentryConfig} from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  devIndicators: {
    appIsrStatus: false,
  },
  // Add allowedDevOrigins to fix cross-origin warnings
  experimental: {
    allowedDevOrigins: ['10.59.58.59', 'localhost:3000'],
    turbo: {
      resolveAlias: {
        canvas: './empty-module.ts',
      },
    },
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "hva-di",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },

  // Sentry SDK options
  // @ts-ignore
  hideSourceMaps: true,
  // @ts-ignore
  disableLogger: true,
  // @ts-ignore
  automaticVercelMonitors: true,
});