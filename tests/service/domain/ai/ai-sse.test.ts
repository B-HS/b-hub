import { describe, expect, test } from 'bun:test'
import { parseSseBlock, iterateSseEvents, iterateStreamLines } from '../../../../service/domain/ai/ai-sse'

const streamOf = (chunks: string[]) => {
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
        start: (controller) => {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    })
}

const collectEvents = async (body: ReadableStream<Uint8Array>) => {
    const events = []
    for await (const event of iterateSseEvents(body)) events.push(event)
    return events
}

const collectLines = async (body: ReadableStream<Uint8Array>) => {
    const lines = []
    for await (const line of iterateStreamLines(body)) lines.push(line)
    return lines
}

describe('parseSseBlock', () => {
    test('event 와 data 를 분리한다', () => {
        expect(parseSseBlock('event: content_block_delta\ndata: {"x":1}')).toEqual({ event: 'content_block_delta', data: '{"x":1}' })
    })

    test('event 가 없으면 message 로 처리한다', () => {
        expect(parseSseBlock('data: hello')).toEqual({ event: 'message', data: 'hello' })
    })

    test('여러 data 라인을 합친다', () => {
        expect(parseSseBlock('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' })
    })

    test('주석 라인과 빈 라인은 무시한다', () => {
        expect(parseSseBlock(': ping\ndata: v')).toEqual({ event: 'message', data: 'v' })
    })

    test('data 가 없으면 null 이다', () => {
        expect(parseSseBlock(': just a comment')).toBeNull()
    })
})

describe('iterateSseEvents', () => {
    test('여러 이벤트를 순서대로 방출한다', async () => {
        const events = await collectEvents(streamOf(['data: a\n\ndata: b\n\n']))
        expect(events.map((e) => e.data)).toEqual(['a', 'b'])
    })

    test('CRLF 개행을 처리한다', async () => {
        const events = await collectEvents(streamOf(['event: x\r\ndata: 1\r\n\r\n']))
        expect(events).toEqual([{ event: 'x', data: '1' }])
    })

    test('청크 경계로 잘린 블록도 버퍼링하여 방출한다', async () => {
        const events = await collectEvents(streamOf(['event: delta\ndata: {"t":"He', 'llo"}\n\n']))
        expect(events).toEqual([{ event: 'delta', data: '{"t":"Hello"}' }])
    })

    test('마지막 개행이 없는 블록도 방출한다', async () => {
        const events = await collectEvents(streamOf(['data: last']))
        expect(events).toEqual([{ event: 'message', data: 'last' }])
    })
})

describe('iterateStreamLines', () => {
    test('개행 단위로 라인을 방출한다', async () => {
        expect(await collectLines(streamOf(['{"a":1}\n{"b":2}\n']))).toEqual(['{"a":1}', '{"b":2}'])
    })

    test('청크 경계로 잘린 라인을 버퍼링한다', async () => {
        expect(await collectLines(streamOf(['{"a"', ':1}\n']))).toEqual(['{"a":1}'])
    })

    test('CRLF 를 제거하고 마지막 미종결 라인도 방출한다', async () => {
        expect(await collectLines(streamOf(['x\r\ny']))).toEqual(['x', 'y'])
    })
})
