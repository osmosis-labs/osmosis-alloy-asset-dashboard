export type RawPoolTransaction = {
  block: {
    height: number
    timestamp: string
  }
  transaction: {
    account: {
      address: string
    }
    hash: string
    success: boolean
    messages: any
    is_ibc: boolean
  }
}

export type PoolTransaction = {
  block: {
    height: number
    timestamp: string
  }
  transaction: {
    account: {
      address: string
    }
    hash: string
    success: boolean
    messages: {
      type: string
      detail: {
        "@type": string
        [key: string]: any
      }
    }[]
    is_ibc: boolean
  }
}
