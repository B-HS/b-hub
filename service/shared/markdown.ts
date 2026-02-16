type MarkdownProcessor = {
    process: (content: string) => Promise<{ toString: () => string }>
}

type MarkdownDeps = {
    processor?: MarkdownProcessor
}

const DANGEROUS_TAGS = /<script[\s>][\s\S]*?<\/script>/gi
const DANGEROUS_EMBED_TAGS = /<\/?(iframe|embed|object|form|base|meta|link)\b[^>]*>/gi
const DANGEROUS_SVG = /<svg\b(?:[^>]*\/>|[\s\S]*?<\/svg\s*>)/gi
const DANGEROUS_ATTRS_DOUBLE = /\s(on\w+|style)\s*=\s*"[^"]*"/gi
const DANGEROUS_ATTRS_SINGLE = /\s(on\w+|style)\s*=\s*'[^']*'/gi
const DANGEROUS_ATTRS_UNQUOTED = /\s(on\w+)\s*=\s*[^\s>]+/gi
const DANGEROUS_HREF = /(<a\s[^>]*href\s*=\s*["']?)\s*(javascript|data|vbscript)\s*:/gi

export const createMarkdownService = (deps: MarkdownDeps = {}) => {
    const sanitizeHtml = (html: string) =>
        html
            .replace(DANGEROUS_TAGS, '')
            .replace(DANGEROUS_EMBED_TAGS, '')
            .replace(DANGEROUS_SVG, '')
            .replace(DANGEROUS_ATTRS_DOUBLE, '')
            .replace(DANGEROUS_ATTRS_SINGLE, '')
            .replace(DANGEROUS_ATTRS_UNQUOTED, '')
            .replace(DANGEROUS_HREF, '$1#blocked:')

    const toHtml = async (markdown: string) => {
        if (deps.processor) {
            const result = await deps.processor.process(markdown)
            return sanitizeHtml(result.toString())
        }

        return sanitizeHtml(
            markdown
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code>$1</code>')
                .replace(/\[(.+?)\]\((.+?)\)/g, (_match, text, url) => {
                    const trimmed = url.trim().toLowerCase()
                    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
                        return `<a href="#blocked">` + text + '</a>'
                    }
                    return `<a href="${url}">${text}</a>`
                })
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^(.+)$/, '<p>$1</p>'),
        )
    }

    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

    const truncate = (text: string, maxLength = 200) => (text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`)

    return { toHtml, sanitizeHtml, stripHtml, truncate }
}

export type MarkdownService = ReturnType<typeof createMarkdownService>
