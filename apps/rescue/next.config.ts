import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the development badge out of the way of the page's own controls.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
