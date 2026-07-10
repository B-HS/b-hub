const SSE_DATA_PREFIX = 'data:'
const SSE_EVENT_PREFIX = 'event:'
const SSE_COMMENT_PREFIX = ':'
const SSE_BLOCK_SEPARATOR = '\n\n'

export type SseEvent = {
    event: string
    data: string
}

export const parseSseBlock = (block: string): SseEvent | null => {
    const dataLines: string[] = []
    let event = 'message'
    for (const rawLine of block.split('\n')) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (line === '' || line.startsWith(SSE_COMMENT_PREFIX)) continue
        if (line.startsWith(SSE_EVENT_PREFIX)) {
            event = line.slice(SSE_EVENT_PREFIX.length).trimStart()
        } else if (line.startsWith(SSE_DATA_PREFIX)) {
            dataLines.push(line.slice(SSE_DATA_PREFIX.length).replace(/^ /, ''))
        }
    }
    if (dataLines.length === 0) return null
    return { event, data: dataLines.join('\n') }
}

export const iterateSseEvents = async function* (body: ReadableStream<Uint8Array>) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let separatorIndex = buffer.indexOf(SSE_BLOCK_SEPARATOR)
            while (separatorIndex !== -1) {
                const parsed = parseSseBlock(buffer.slice(0, separatorIndex))
                buffer = buffer.slice(separatorIndex + SSE_BLOCK_SEPARATOR.length)
                if (parsed) yield parsed
                separatorIndex = buffer.indexOf(SSE_BLOCK_SEPARATOR)
            }
        }
        const remaining = buffer.trim()
        if (remaining) {
            const parsed = parseSseBlock(remaining)
            if (parsed) yield parsed
        }
    } finally {
        reader.releaseLock()
    }
}

export const iterateStreamLines = async function* (body: ReadableStream<Uint8Array>) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) yield line.endsWith('\r') ? line.slice(0, -1) : line
        }
        if (buffer) yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    } finally {
        reader.releaseLock()
    }
}
