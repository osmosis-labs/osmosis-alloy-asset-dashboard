// Unknown paths. The root error boundary renders the 404 page.
export function loader() {
  throw new Response(null, { status: 404 })
}
