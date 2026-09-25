import numbro from "numbro"

export const NumberFormatter = {
  // Used for USD/SUI values
  VALUE: {
    mantissa: 2,
    thousandSeparated: true,
    trimMantissa: true,
  } as numbro.Format,

  formatValue: (value?: any, format?: numbro.Format) => {
    return numbro(value).format({ ...NumberFormatter.VALUE, ...format })
  },

  // Price axis labels: compact from 1,000 up, otherwise 4 significant digits
  // so a stablecoin's 0.9998 does not collapse to "1".
  formatAxisPrice: (value: number) =>
    Math.abs(value) >= 1000
      ? NumberFormatter.formatCompact(value)
      : String(Number(value.toPrecision(4))),

  // Short axis labels: 1.2K, 3.4M, -250.
  formatCompact: (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
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
