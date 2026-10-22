// Tests that chart CSS built from registry-supplied keys and colors cannot
// break out of its <style> element.
//
//   node scripts/test-chart-style.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { buildChartCss, isSafeChartColor } = await import(
  pathToFileURL(path.resolve("src/components/ui/chart.tsx")).href
)

test("the app's own keys and colors are emitted", () => {
  const css = buildChartCss("chart-1", {
    Circle: { label: "Circle", color: "hsl(var(--chart-1))" },
    "1868": { label: "allBTC", color: "#F7931A" },
    s6: {
      label: "x",
      color: "color-mix(in srgb, hsl(var(--chart-2)) 60%, black)",
    },
  })
  assert.match(css, /--color-Circle: hsl\(var\(--chart-1\)\);/)
  assert.match(css, /--color-1868: #F7931A;/)
  assert.match(
    css,
    /--color-s6: color-mix\(in srgb, hsl\(var\(--chart-2\)\) 60%, black\);/
  )
})

test("hostile keys and colors are dropped", () => {
  const css =
    buildChartCss("chart-1", {
      "</style><script>alert(1)</script>": { label: "x", color: "#fff" },
      "Wormhole Foundation": { label: "y", color: "#fff" },
      ok: { label: "z", color: "red;}</style><script>alert(1)</script>" },
      ok2: { label: "w", color: "url(https://evil)" },
    }) ?? ""
  assert.doesNotMatch(css, /<|script|evil|Wormhole/)
})

test("theme colors are validated per theme", () => {
  const css = buildChartCss("chart-1", {
    a: { label: "a", theme: { light: "#000", dark: "</style>" } },
  })
  assert.match(css, /--color-a: #000;/)
  assert.doesNotMatch(css, /<\/style>/)
})

test("color validation", () => {
  for (const c of ["#abc", "#AABBCC", "#AABBCCDD", "hsl(var(--chart-3))"])
    assert.equal(isSafeChartColor(c), true, c)
  for (const c of [
    undefined,
    "",
    "red",
    "#ggg",
    "#fff;",
    "hsl(0 0% 0%)",
    "#fff</style>",
  ])
    assert.equal(isSafeChartColor(c), false, String(c))
})
