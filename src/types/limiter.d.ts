export type RawLimiterResponse =
  | {
      static_limiter: {
        upper_limit: string
      }
    }
  | {
      change_limiter: {
        latest_value: string
        boundary_offset: string
        divisions: {
          started_at: string
          updated_at: string
          latest_value: string
          integral: string
        }[]
        window_config: {
          window_size: string
          division_count: string
        }
      }
    }

export type Limiter = StaticLimiter | ChangeLimiter

export type StaticLimiter = {
  type: "static"
  upper_limit: string
}

export type ChangeLimiter = {
  type: "change"
  latest_value: string
  boundary_offset: string
  divisions: {
    started_at: string
    updated_at: string
    latest_value: string
    integral: string
  }[]
  window_config: {
    window_size: string
    division_count: string
  }
}
