import { isbot } from "isbot"
import { renderToReadableStream } from "react-dom/server"
import type { EntryContext, RouterContextProvider } from "react-router"
import { ServerRouter } from "react-router"

import { NonceContext } from "@/lib/nonce"
import { requestStore } from "@/lib/request-context"

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider
) {
  let shellRendered = false
  const userAgent = request.headers.get("user-agent")
  // The CSP nonce the Worker sends for this request (workers/app.ts).
  // ServerRouter hands it to <Scripts>, <Links> and its streamed data
  // scripts; NonceContext carries it to the theme script.
  const nonce = requestStore.getStore()?.nonce

  const body = await renderToReadableStream(
    <NonceContext.Provider value={nonce}>
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
    </NonceContext.Provider>,
    {
      nonce,
      onError(error: unknown) {
        responseStatusCode = 500
        if (shellRendered) console.error(error)
      },
    }
  )
  shellRendered = true

  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady
  }

  responseHeaders.set("Content-Type", "text/html")
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  })
}
