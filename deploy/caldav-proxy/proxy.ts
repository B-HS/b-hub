const TARGET = 'https://api.gumyo.net'
const TARGET_HOST = 'api.gumyo.net'
const PORT = Number(process.env.PORT) || 4000

type ProxyDeps = {
    target: string
    targetHost: string
    fetchImpl: typeof fetch
}

export const createProxyFetch = (deps: ProxyDeps) => async (req: Request) => {
    const url = new URL(req.url)
    const targetUrl = `${deps.target}${url.pathname}${url.search}`

    const headers = new Headers(req.headers)
    headers.set('Host', deps.targetHost)
    headers.set('Accept-Encoding', 'identity')
    headers.delete('cf-connecting-ip')
    headers.delete('cf-ray')

    const res = await deps.fetchImpl(targetUrl, {
        method: req.method,
        headers,
        body: req.body,
        redirect: 'manual',
    })

    const responseHeaders = new Headers(res.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')

    return new Response(res.body, {
        status: res.status,
        headers: responseHeaders,
    })
}

if (import.meta.main) {
    console.log(`CalDAV proxy running on :${PORT} → ${TARGET}`)

    Bun.serve({
        port: PORT,
        fetch: createProxyFetch({ target: TARGET, targetHost: TARGET_HOST, fetchImpl: fetch }),
    })
}
