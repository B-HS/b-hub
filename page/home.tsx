import { Hono } from 'hono'
import { Style, css } from 'hono/css'
import { resolve } from 'path'

const bodyStyle = css`
    margin: 0;
    min-height: 100dvh;
    min-width: 100dvw;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    background: #fafafa;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    gap: 1.5rem;
`

const faviconStyle = css`
    width: 64px;
    height: 64px;
    border-radius: 12px;
`

const nameStyle = css`
    font-size: 1.4rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-top: 0.5rem;
`

const descStyle = css`
    font-size: 0.95rem;
    color: #666;
    text-align: center;
    line-height: 1.6;
    max-width: 360px;
`

const linkStyle = css`
    color: #999;
    font-size: 0.85rem;
    text-decoration: none;
    &:hover {
        color: #333;
        text-decoration: underline;
    }
`

const HomePage = () => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <meta name='viewport' content='width=device-width, initial-scale=1.0' />
            <title>gumyo.net</title>
            <link rel='icon' href='/favicon.ico' />
            <Style />
        </head>
        <body class={bodyStyle}>
            <img src='/favicon.ico' alt='gumyo.net' class={faviconStyle} />
            <p class={nameStyle}>gumyo.net</p>
            <p class={descStyle}>
                블로그, 날씨, 메일, 음악 등 개인 서비스를 통합 제공하는 API 플랫폼입니다. Google 계정을 통해 안전하게 로그인하고 다양한 기능을 이용할
                수 있습니다.
            </p>
            <a href='/policy' class={linkStyle}>
                개인정보처리방침 · 서비스 이용약관
            </a>
        </body>
    </html>
)

export const homeRoute = new Hono()

homeRoute.get('/', (c) => c.html(<HomePage />))

homeRoute.get('/favicon.ico', async (c) => {
    const file = Bun.file(resolve(import.meta.dir, '../public/favicon.ico'))
    return c.body(await file.arrayBuffer(), {
        headers: {
            'Content-Type': 'image/x-icon',
            'Cache-Control': 'public, max-age=86400',
        },
    })
})
