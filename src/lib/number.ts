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
