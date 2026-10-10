import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pkijs/asn1js are used only on the server (wallet-ownership attestations); keep them out of the bundler.
  serverExternalPackages: ["pkijs", "asn1js"],
};

export default nextConfig;
