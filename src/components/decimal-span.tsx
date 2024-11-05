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
          {formattedWhole}.
          {retracedZeroes > 0 && (
            <span className="text-[0.65rem]">0{retracedZeroes}</span>
          )}
          {formattedAfterZeroes}
        </>
      )}
      {percent && "%"}
    </span>
  )
}
DecimalSpan.displayName = "DecimalSpan"

export { DecimalSpan }
