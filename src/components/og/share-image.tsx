// Layout of the Open Graph share images, rendered by satori (@vercel/og).
// Inline styles only: satori does not read Tailwind classes or the site's
// CSS variables.
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

const PURPLE = "#7b67f6"
const TEAL = "#30b5bd"
const TRACK = "#25243a"
const MUTED = "#c9c6e8"

// Each variant's share of the pool, most prevalent first.
export type ShareRow = { label: string; percent: number }

export const ShareImage = ({
  eyebrow,
  title,
  logo,
  subtitle,
  lines = [],
  shares = [],
}: {
  eyebrow: string
  title: string
  // Image URL (a data: URI) drawn before the title; omitted when unavailable.
  logo?: string | null
  subtitle?: string | null
  lines?: string[]
  shares?: ShareRow[]
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "44px 72px",
      background: "#0a0a14",
      color: "#ffffff",
      fontFamily: "sans-serif",
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", fontSize: 30, color: TEAL }}>
        {eyebrow}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {logo && (
          <img src={logo} width={80} height={80} alt="" />
        )}
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700 }}>
          {title}
        </div>
      </div>
      {subtitle && (
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
          {subtitle}
        </div>
      )}
      {lines.map((line) => (
        <div key={line} style={{ display: "flex", fontSize: 30, color: MUTED }}>
          {line}
        </div>
      ))}
      {shares.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 4,
          }}
        >
          {shares.map((row) => (
            <div
              key={row.label}
              style={{ display: "flex", alignItems: "center", gap: 20 }}
            >
              <div
                style={{
                  display: "flex",
                  width: 260,
                  fontSize: 24,
                  color: MUTED,
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  height: 18,
                  borderRadius: 9,
                  background: TRACK,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${Math.max(row.percent, 0.8)}%`,
                    height: 18,
                    borderRadius: 9,
                    background: PURPLE,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  width: 110,
                  justifyContent: "flex-end",
                  fontSize: 24,
                }}
              >
                {row.percent < 0.1 ? "<0.1%" : `${row.percent.toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <div
      style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28 }}
    >
      <div
        style={{
          display: "flex",
          width: 18,
          height: 18,
          borderRadius: 9,
          background: PURPLE,
        }}
      />
      alloyed.osmosis.zone
    </div>
  </div>
)
