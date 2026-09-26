// Follows Cosmos SDK key pagination (`pagination.next_key`) until the last
// page, collecting every item. `fetchPage` receives the key for the page to
// read (undefined for the first). Stops with an error after `maxPages`, so a
// server that keeps returning keys cannot loop forever.
export const collectKeyPages = async <T>(
  fetchPage: (
    key: string | undefined
  ) => Promise<{ items: T[]; nextKey: string | null | undefined }>,
  maxPages = 20
): Promise<T[]> => {
  const items: T[] = []
  let key: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(key)
    items.push(...result.items)
    if (!result.nextKey) return items
    key = result.nextKey
  }
  throw new Error(`more than ${maxPages} pages`)
}
