// Sent with every response. The swap page connects wallets and signs
// transactions, so no other site may frame it (clickjacking): the CSP
// frame-ancestors directive for current browsers, X-Frame-Options for older
// ones. A full CSP (script/connect/img sources) is not set here: the wallet
// extensions, WalletConnect and the assetlist image hosts need an allowlist
// tested against every wallet first.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
    }
    return config
  },
}
module.exports = nextConfig
