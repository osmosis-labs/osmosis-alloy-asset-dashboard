// Layout of the Open Graph share images (src/app/opengraph-image.tsx and the
// per-pool one), rendered by next/og. Inline styles only: next/og does not
// read Tailwind classes or the site's CSS variables.
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

const PURPLE = "#7b67f6"
const TEAL = "#30b5bd"

export const ShareImage = ({
  eyebrow,
  title,
  lines,
}: {
  eyebrow: string
  title: string
  lines: string[]
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 72,
      background: "#0a0a14",
      color: "#ffffff",
      fontFamily: "sans-serif",
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", fontSize: 32, color: TEAL }}>
        {eyebrow}
      </div>
      <div style={{ display: "flex", fontSize: 88, fontWeight: 700 }}>
        {title}
      </div>
      {lines.map((line) => (
        <div
          key={line}
          style={{ display: "flex", fontSize: 36, color: "#c9c6e8" }}
        >
          {line}
        </div>
      ))}
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 20,
          height: 20,
          borderRadius: 10,
          background: PURPLE,
        }}
      />
      alloyed.osmosis.zone
    </div>
  </div>
)
