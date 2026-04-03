const TARGET = 'https://api.gumyo.net'
const PORT = Number(process.env.PORT) || 4000

console.log(`CalDAV proxy running on :${PORT} → ${TARGET}`)

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url)
        const targetUrl = `${TARGET}${url.pathname}${url.search}`

        const headers = new Headers(req.headers)
        headers.set('Host', 'api.gumyo.net')
        headers.delete('cf-connecting-ip')
        headers.delete('cf-ray')

        const res = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: req.body,
            redirect: 'manual',
        })

        return new Response(res.body, {
            status: res.status,
            headers: res.headers,
        })
    },
})
