export type Quote = SuccessQuote | ErrorQuote
export type SuccessQuote = {
  amount_in: {
    denom: string
    amount: string
  }
  amount_out: string
  route: {
    pools: {
      id: number
      type: number
      balances: any[]
      spread_factor: string
      token_out_denom: string
      taker_fee: string
      code_id?: number
    }[]
    "has-cw-pool": boolean
    out_amount: string
    in_amount: string
  }[]

  effective_fee: string
  price_impact: string
  in_base_out_quote_spot_price: string
}

export type ErrorQuote = {
  message: string
}
