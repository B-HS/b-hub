type ContentParserDeps = {
    cheerio: typeof import('cheerio')
    fetchFn?: typeof fetch
}

const FETCH_TIMEOUT = 10000
const PARSE_DELAY = 500

const REMOVE_SELECTORS = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'canvas',
    'video',
    'audio',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.advertisement',
    '.ads',
    '.sidebar',
    '.comments',
    '.comment',
    '.social-share',
    '.related-posts',
]

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createContentParser = (deps: ContentParserDeps) => {
    const fetchFn = deps.fetchFn ?? fetch

    const parse = async (url: string): Promise<{ success: boolean; content?: string; error?: string }> => {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

            const response = await fetchFn(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; HNDigestBot/1.0)',
                    Accept: 'text/html,application/xhtml+xml',
                },
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
            }

            const contentType = response.headers.get('content-type') ?? ''
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                return { success: false, error: `Unsupported content type: ${contentType}` }
            }

            const html = await response.text()
            const $ = deps.cheerio.load(html)

            REMOVE_SELECTORS.forEach((selector) => $(selector).remove())

            const article = $('article').first()
            const main = $('main').first()
            const body = $('body')

            let content = ''
            if (article.length) {
                content = article.text()
            } else if (main.length) {
                content = main.text()
            } else {
                content = body.text()
            }

            content = content
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n')
                .trim()

            if (!content || content.length < 100) {
                return { success: false, error: 'Failed to extract meaningful content' }
            }

            await delay(PARSE_DELAY)

            return { success: true, content }
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    return { success: false, error: 'Request timeout' }
                }
                return { success: false, error: error.message }
            }
            return { success: false, error: String(error) }
        }
    }

    return { parse }
}
