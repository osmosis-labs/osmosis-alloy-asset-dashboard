export type Currency = {
  coinDenom: string
  coinMinimalDenom: string
  coinDecimals: number
  coinGeckoId: string | null
  coinImageUrl: string
  isUnstable: boolean
  isVerified: boolean
  variantGroupKey: string
  isAlloyed: boolean
}

export type AssetOptions = {
  separator: string
  upperCase: boolean
  lowerCase: boolean
  hideDenom?: boolean
  maxDecimals: number
  trim: boolean
  shrink: boolean
  ready: boolean
  locale: string
  inequalitySymbol: boolean
  inequalitySymbolSeparator: string
}

export type CurrencyAmount = {
  currency: Currency
  options: AssetOptions
  amount: string
}

export type Fiat = {
  currency: string
  symbol: string
  maxDecimals: number
  locale: string
}

export type FiatAmount = {
  fiat: Fiat
  options: AssetOptions
  amount: string
}

export type Rate = {
  options: AssetOptions
  rate: string
}

export type CurrencyWithAmount = Currency & {
  contract: string | null
  amount?: string
  usdValue?: FiatAmount
}

export type CurrencyWithPrice = Currency & {
  currentPrice: FiatAmount
}

export type CurrencyWithMarketPrice = Currency & {
  currentPrice: FiatAmount
  marketCap: FiatAmount
  totalSupply: FiatAmount | null
  liquidity: FiatAmount
  priceChange1h: Rate
  priceChange24h: Rate
  priceChange7d: Rate
  volume24h: FiatAmount
}

interface Asset {
  description: string
  extended_description?: string
  denom_units: {
    denom: string
    exponent: number
  }[]
  type_asset: string
  address: string
  base: string
  name: string
  display: string
  symbol: string
  traces: {
    type: string
    counterparty: {
      chain_name: string
      base_denom: string
    }
    provider?: string
  }[]
  images: {
    svg?: string
    image_sync?: {
      chain_name: string
      base_denom: string
    }
    png?: string
    theme?: {
      circle: boolean
      primary_color_hex: string
      background_color_hex: string
    }
  }[]
  keywords: string[]
}

interface AssetWithDecimal extends Asset {
  decimal: number
  denom: string
}

export type Coin = {
  denom: string
  amount: string
}
