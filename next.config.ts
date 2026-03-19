import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', 'react-hot-toast'],
  },
};

export default nextConfig;
