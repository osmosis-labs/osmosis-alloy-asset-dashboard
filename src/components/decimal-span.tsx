import _ from "lodash"
import numbro from "numbro"

import { NumberFormatter } from "@/lib/number"

const DecimalSpan = ({
  children,
  mantissa = 3,
  optionalMantissa = true,
  className,
  percent,
  dollar,
}: {
  children: number | string
  mantissa?: number
  optionalMantissa?: boolean
  className?: string
  percent?: boolean
  dollar?: boolean
}) => {
  // Input: 0.0000002 -> 0.0_0000_02 -> 0.0₅2 -(apply mantissa)-> 0.0₅2000 or 0.0₅2
  // Input: 23.4023 -> 23.4023 -> 23.4023 -(apply mantissa)-> 23.40
  // Input: 1.00045 -> 1.0_0_045 -> 1.0₂45 -(apply mantissa)-> 1.0₂4 or 1.0₂45
  // Output as span element

  let str = typeof children === "string" ? children : children.toFixed(18)
  let noDecimal =
    typeof children === "string" ? !children.includes(".") : children % 1 === 0
  let [whole, fractional] = str.split(".")
  const formattedWhole = numbro(whole).format("0,0")
  const isWholeUnit = Math.abs(Number(whole)) >= 1
  fractional = fractional || "0"
  const retracedZeroes = fractional.match(/^0(0+)/)?.at(1)?.length || 0
  const afterZeroes =
    retracedZeroes > 0 ? fractional.slice(retracedZeroes + 1) : fractional

  if (!afterZeroes) {
    noDecimal = true
  }

  const formattedAfterZeroes =
    NumberFormatter.formatValue(`0.${afterZeroes}`, {
      mantissa,
      optionalMantissa,
    }).split(".")[1] || _.repeat("9", mantissa)

  return (
    <span className={className}>
      {dollar && "$"}
      {noDecimal ? (
        formattedWhole
      ) : (
        <>
          {formattedWhole}
          {/* From 1 up the decimals are detail: shrink them so the amount stays
              exact but reads at a glance. Below 1 they are the value. */}
          <span className={isWholeUnit ? "text-[0.7em]" : undefined}>
            .
            {retracedZeroes > 0 && (
              <span className="text-[0.65rem]">0{retracedZeroes}</span>
            )}
            {formattedAfterZeroes}
          </span>
        </>
      )}
      {percent && "%"}
    </span>
  )
}
DecimalSpan.displayName = "DecimalSpan"

// Same treatment for an already-formatted string such as "$1,838,177.82":
// decimals render smaller when the whole part is 1 or more.
const SmallDecimals = ({ children }: { children: string }) => {
  const match = children.match(/^(.*?\d)\.(\d+)(.*)$/)
  if (!match) return <>{children}</>
  const [, head, fractional, tail] = match
  if (Number(head.replace(/[^\d]/g, "")) < 1) return <>{children}</>
  return (
    <>
      {head}
      <span className="text-[0.7em]">.{fractional}</span>
      {tail}
    </>
  )
}
SmallDecimals.displayName = "SmallDecimals"

export { DecimalSpan, SmallDecimals }
