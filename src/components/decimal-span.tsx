import BigNumber from "bignumber.js"
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
  // Input: 23.4023 -> 23.40 (mantissa 2)
  // Input: 383.0088 -> 383.01 (mantissa 2); 383.998 -> 384.00
  // Zero runs are only compressed below 1, where the leading zeros carry no
  // value; from 1 up the value is rounded to the mantissa like any amount.
  // Output as span element

  let str = typeof children === "string" ? children : children.toFixed(18)
  let noDecimal =
    typeof children === "string" ? !children.includes(".") : children % 1 === 0
  let [whole, fractional] = str.split(".")
  const formattedWhole = numbro(whole).format("0,0")
  const isWholeUnit = Math.abs(Number(whole)) >= 1

  if (isWholeUnit && !noDecimal) {
    // Round the whole value so a carry reaches the integer part.
    const [roundedWhole, roundedFraction = ""] = new BigNumber(str)
      .toFixed(mantissa, BigNumber.ROUND_HALF_UP)
      .split(".")
    // Trim trailing zeros past the second decimal, but always keep two
    // (12.50, not 12.5), matching NumberFormatter.VALUE.
    const digits = optionalMantissa
      ? roundedFraction.replace(/0+$/, "").padEnd(Math.min(2, mantissa), "0")
      : roundedFraction
    return (
      <span className={className}>
        {dollar && "$"}
        {numbro(roundedWhole).format("0,0")}
        {/* From 1 up the decimals are detail: shrink them so the amount
            stays exact but reads at a glance. */}
        {digits && <span className="text-[0.7em]">.{digits}</span>}
        {percent && "%"}
      </span>
    )
  }

  fractional = fractional || "0"
  const retracedZeroes = fractional.match(/^0(0+)/)?.at(1)?.length || 0
  const afterZeroes =
    retracedZeroes > 0 ? fractional.slice(retracedZeroes + 1) : fractional

  if (!afterZeroes) {
    noDecimal = true
  }

  // Trim trailing zeros past the second decimal, but always keep two
  // (12.50, not 12.5), matching NumberFormatter.VALUE.
  const trimmedAfterZeroes =
    NumberFormatter.formatValue(`0.${afterZeroes}`, {
      mantissa,
      optionalMantissa,
      trimMantissa: true,
    }).split(".")[1] || _.repeat("9", mantissa)
  const formattedAfterZeroes =
    retracedZeroes > 0
      ? trimmedAfterZeroes
      : trimmedAfterZeroes.padEnd(Math.min(2, mantissa), "0")

  return (
    <span className={className}>
      {dollar && "$"}
      {noDecimal ? (
        formattedWhole
      ) : (
        <>
          {formattedWhole}.
          {/* 0.0₃156: the subscript counts the zeros hidden after the first. */}
          {retracedZeroes > 0 && (
            <>
              0<sub className="text-[0.65em]">{retracedZeroes}</sub>
            </>
          )}
          {formattedAfterZeroes}
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
