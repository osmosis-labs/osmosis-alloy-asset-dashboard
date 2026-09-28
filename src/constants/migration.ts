// Migration alloys, by pool id: transmuter pools that exist to convert a legacy
// token into its replacement 1:1, not to back a multi-source asset. Their
// alloyed denom (allSTARS, ...) is plumbing and not a listed asset. They get
// pool pages and their own section on /pools, but are not on the overview,
// and the minimum-TVL cutoff does not apply to them.
//
// `from` is the legacy variant and `to` its replacement (full minimal denoms).
// Both have normalization factor 1 in their pool, so they share a unit.
//
// No imports: scripts/generate-last-known-good.mjs reads this file too.
export const MIGRATION_ALLOYS: Record<string, { from: string; to: string }> = {
  // allSTARS: STARS.og (Stargaze chain) to STARS (Cosmos Hub).
  "3471": {
    from: "ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4",
    to: "ibc/68BAF19F76BAC04C4CEA06325EF91D43E8637AE43EAC7887CE6211B4B99E1EC0",
  },
  // allDGN: DGN.old to DGN.
  "2886": {
    from: "ibc/3B95D63B520C283BCA86F8CD426D57584039463FD684A5CBA31D2780B86A1995",
    to: "ibc/CD6412358F33B372A355CF22786D8C19477C15092B56BD56188679EED8556964",
  },
  // allMARS: MARS.old (Mars Hub) to MARS.
  "2156": {
    from: "ibc/573FCD90FACEE750F55A8864EF7D38265F07E5A9273FA0E8DAFD39951332B580",
    to: "ibc/B67DF59507B3755EEDE0866C449445BD54B4DA82CCEBA89D775E53DC35664255",
  },
}
