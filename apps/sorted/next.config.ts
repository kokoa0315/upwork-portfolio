import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The default bottom-left badge sits on top of the sidebar's sign-out button in development.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
