import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits bottom-left, directly on top of the mobile tab bar,
  // and swallows clicks on the first tab. Dev-only chrome, so turn it off.
  devIndicators: false,
};

export default nextConfig;
