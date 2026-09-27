import numbro from "numbro"

export const NumberFormatter = {
  // Used for USD/SUI values
  // Two decimals whenever decimals are shown (1,837,332.50, not .5); whole
  // numbers stay whole (1,837,332).
  VALUE: {
    mantissa: 2,
    thousandSeparated: true,
    trimMantissa: false,
    optionalMantissa: true,
  } as numbro.Format,

  formatValue: (value?: any, format?: numbro.Format) => {
    return numbro(value).format({ ...NumberFormatter.VALUE, ...format })
  },

  // Short axis labels: 1.2K, 3.4M, -250.
  formatCompact: (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value),

  // Headline figures: 1.57M, 8.62M, 45.24K, 912.5. Pair with the full value
  // (formatValue) in a title or tooltip.
  formatCompactValue: (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value),

  formatValueDecimal: (
    value: string | number,
    decimals: number,
    format?: numbro.Format
  ) => {
    return numbro(value)
      .divide(10 ** decimals)
      .format({ ...NumberFormatter.VALUE, ...format })
  },

  VALUE_UNTRIMMED: {
    mantissa: 2,
    thousandSeparated: true,
    trimMantissa: false,
  } as numbro.Format,

  formatValueUntrimmed: (value?: any, format?: numbro.Format) => {
    return numbro(value).format({
      ...NumberFormatter.VALUE_UNTRIMMED,
      ...format,
    })
  },

  formatValueUntrimmedDecimal: (
    value: string | number,
    decimals: number,
    format?: numbro.Format
  ) => {
    return numbro(value)
      .divide(10 ** decimals)
      .format({
        ...NumberFormatter.VALUE_UNTRIMMED,
        ...format,
      })
  },

  PERCENT: {
    mantissa: 2,
    output: "percent",
  } as numbro.Format,

  formatPercent: (value?: any, format?: numbro.Format) => {
    return numbro(value).format({ ...NumberFormatter.PERCENT, ...format })
  },

  formatPercentDecimal: (
    value: string | number,
    decimals: number,
    format?: numbro.Format
  ) => {
    return numbro(value)
      .divide(10 ** decimals)
      .format({ ...NumberFormatter.PERCENT, ...format })
  },
} as const
