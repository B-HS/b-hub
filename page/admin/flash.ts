export type FlashKind = 'ok' | 'err'
export type Flash = { kind: FlashKind; message: string }

const DEFAULT_OK_MESSAGE = '저장되었습니다.'
const DEFAULT_ERR_MESSAGE = '작업에 실패했습니다.'

export const FLASH_ERROR_MESSAGE: Record<string, string> = {
    csrf: '보안 토큰이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
    sync: '동기화에 실패했습니다.',
    not_found: '대상을 찾을 수 없습니다.',
    forbidden: '권한이 없습니다.',
    validation: '입력값이 올바르지 않습니다.',
    conflict: '이미 존재하거나 충돌하는 값입니다.',
    unknown: DEFAULT_ERR_MESSAGE,
}

type QueryContext = { req: { query: (key: string) => string | undefined } }

export const parseFlash = (c: QueryContext, okMessage: string = DEFAULT_OK_MESSAGE): Flash | null => {
    const flash = c.req.query('flash')
    if (flash === 'ok') return { kind: 'ok', message: okMessage }
    if (flash === 'err') {
        const code = c.req.query('code')
        const message = (code && FLASH_ERROR_MESSAGE[code]) || DEFAULT_ERR_MESSAGE
        return { kind: 'err', message }
    }
    return null
}

export const flashPath = (path: string, kind: FlashKind = 'ok', code?: string): string => {
    const separator = path.includes('?') ? '&' : '?'
    const base = `${path}${separator}flash=${kind}`
    return kind === 'err' && code ? `${base}&code=${encodeURIComponent(code)}` : base
}
