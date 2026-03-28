import { Hono } from 'hono'
import { Style, css } from 'hono/css'
import { PRIVACY_POLICY } from '../lib/privacy-policy'
import { TERMS_OF_SERVICE } from '../lib/terms-of-service'

type PolicySection = { readonly heading: string; readonly content: string }

const globalStyle = css`
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.8;
        color: #1a1a1a;
        background: #fafafa;
        padding: 2rem 1rem;
    }
`

const mainStyle = css`
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
`

const h1Style = css`
    font-size: 1.6rem;
    margin-bottom: 0.5rem;
    border-bottom: 2px solid #e5e5e5;
    padding-bottom: 0.75rem;
`

const h2Style = css`
    font-size: 1.1rem;
    margin-top: 1.5rem;
    margin-bottom: 0.4rem;
    color: #333;
`

const pStyle = css`
    margin-bottom: 0.8rem;
    color: #555;
`

const updatedStyle = css`
    font-size: 0.85rem;
    color: #999;
    margin-bottom: 2rem;
`

const hrStyle = css`
    border: none;
    border-top: 1px solid #e5e5e5;
    margin: 2.5rem 0;
`

const Section = ({ sections }: { sections: readonly PolicySection[] }) => (
    <>
        {sections.map((s) => (
            <div key={s.heading}>
                <h2 class={h2Style}>{s.heading}</h2>
                <p class={pStyle}>
                    {s.content.split('\n').map((line, i) => (
                        <span key={i}>
                            {i > 0 && <br />}
                            {line}
                        </span>
                    ))}
                </p>
            </div>
        ))}
    </>
)

const PolicyPage = () => (
    <html lang='ko'>
        <head>
            <meta charset='UTF-8' />
            <meta name='viewport' content='width=device-width, initial-scale=1.0' />
            <title>
                {PRIVACY_POLICY.title} & {TERMS_OF_SERVICE.title} - gumyo.net
            </title>
            <Style />
        </head>
        <body class={globalStyle}>
            <main class={mainStyle}>
                <h1 class={h1Style}>{PRIVACY_POLICY.title}</h1>
                <p class={updatedStyle}>최종 업데이트: {PRIVACY_POLICY.lastUpdated}</p>
                <Section sections={PRIVACY_POLICY.sections} />

                <hr class={hrStyle} />

                <h1 class={h1Style}>{TERMS_OF_SERVICE.title}</h1>
                <p class={updatedStyle}>최종 업데이트: {TERMS_OF_SERVICE.lastUpdated}</p>
                <Section sections={TERMS_OF_SERVICE.sections} />
            </main>
        </body>
    </html>
)

export const policyRoute = new Hono()

policyRoute.get('/', (c) => c.html(<PolicyPage />))
