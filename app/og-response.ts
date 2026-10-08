// Buffer the PNG. ImageResponse's body is a stream that starts after yoga and
// resvg finish; re-wrapping that stream, or letting the dev proxy flush it
// early, has come back as a 200 with an empty body.
export const cachedImage = async (image: Response) => {
  const bytes = await image.arrayBuffer()
  const headers = new Headers(image.headers)
  headers.set("Cache-Control", "public, max-age=300")
  headers.set("Content-Length", String(bytes.byteLength))
  return new Response(bytes, { status: image.status, headers })
}
