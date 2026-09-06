import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createBlogImageHandler } from '../../deploy/upload-server/blog-image-handler'
import { createUploadHandler, isValidAssetId, isValidUploadKey } from '../../deploy/upload-server/upload-handler'

const HUB_BASE_URL = 'https://hub.test'
const L1_MAX_FILE_SIZE = 100 * 1024 * 1024
const ROUTE_MAX_UPLOAD_SIZE_BYTES = 1024

process.env.HUB_BASE_URL = HUB_BASE_URL
process.env.R2_END_POINT = 'https://r2.test'
process.env.MAX_UPLOAD_SIZE_BYTES = String(ROUTE_MAX_UPLOAD_SIZE_BYTES)

const server = (await import('../../deploy/upload-server/index')).default

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'upload-server-test-'))

const createUploadDeps = (tmpDir: string) => {
    const calls = { r2Keys: [] as string[], gdriveKeys: [] as string[] }

    const deps = {
        r2: {
            upload: async (key: string) => {
                calls.r2Keys.push(key)
                return { success: true as const, key }
            },
            uploadBuffer: async (key: string) => {
                calls.r2Keys.push(key)
                return { success: true as const, key }
            },
        },
        gdrive: {
            upload: async (_accessToken: string, _rootFolderId: string, s3Key: string) => {
                calls.gdriveKeys.push(s3Key)
                return { success: true as const, gdriveFileId: 'gdrive-file-id' }
            },
        },
        local: { upload: async () => ({ success: false as const, error: 'Mac Studio not implemented' }) },
        hubBaseUrl: HUB_BASE_URL,
        uploadServerSecret: 'test-secret',
        generateId: () => 'fixed-id',
        l1MaxFileSize: L1_MAX_FILE_SIZE,
        tmpDir,
        imageProcessor: null,
    }

    return { deps, calls }
}

const createHubFetchStub = (statusResponse: () => Response) => {
    const hubCalls: string[] = []

    const stub = mock(async (input: RequestInfo | URL) => {
        const url = String(input)
        hubCalls.push(url)
        if (url.endsWith('/status')) return statusResponse()
        if (url.endsWith('/gdrive-token')) return new Response(JSON.stringify({ success: false }), { status: 200 })
        if (url.endsWith('/complete')) return new Response(JSON.stringify({ success: true }), { status: 200 })
        throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    return { stub, hubCalls }
}

const VALID_S3_KEY = 'users/u1/2f0c6d5e/hello.txt'

const runUpload = async (statusResponse: () => Response, s3Key = VALID_S3_KEY) => {
    const tmpDir = createTmpDir()
    const { deps, calls } = createUploadDeps(tmpDir)
    const { stub, hubCalls } = createHubFetchStub(statusResponse)
    const originalFetch = globalThis.fetch
    globalThis.fetch = stub

    try {
        const handler = createUploadHandler(deps)
        const file = new File(['hello-upload'], 'hello.txt', { type: 'text/plain' })
        const result = await handler.handle(file, 1, s3Key, 'token-1')
        return { result, calls, hubCalls }
    } finally {
        globalThis.fetch = originalFetch
        rmSync(tmpDir, { recursive: true, force: true })
    }
}

describe('isValidAssetId', () => {
    test('영숫자·하이픈·언더스코어만 허용한다', () => {
        expect(isValidAssetId('abc-123_XYZ')).toBe(true)
        expect(isValidAssetId('11f0a1b2')).toBe(true)
    })

    test('경로 구분자·상위 경로·빈 값을 거부한다', () => {
        expect(isValidAssetId('../../etc/passwd')).toBe(false)
        expect(isValidAssetId('a/b')).toBe(false)
        expect(isValidAssetId('..')).toBe(false)
        expect(isValidAssetId('a.b')).toBe(false)
        expect(isValidAssetId('')).toBe(false)
    })
})

describe('isValidUploadKey', () => {
    test('drive prepare 가 발급하는 users/<userId>/<uuid>/<파일명> 형태만 허용한다', () => {
        expect(isValidUploadKey('users/u1/2f0c6d5e/hello.txt')).toBe(true)
        expect(isValidUploadKey('users/u1/2f0c6d5e/보고서 v2.pdf')).toBe(true)
    })

    test('다른 접두사·상위 경로·세그먼트 수 불일치를 거부한다', () => {
        expect(isValidUploadKey('a1b2c3.webp')).toBe(false)
        expect(isValidUploadKey('mail/attachments/1/2/a.pdf')).toBe(false)
        expect(isValidUploadKey('users/u1/../../a1b2c3.webp')).toBe(false)
        expect(isValidUploadKey('users/u1/2f0c6d5e/')).toBe(false)
        expect(isValidUploadKey('users\\u1\\2f0c6d5e\\a.txt')).toBe(false)
        expect(isValidUploadKey('')).toBe(false)
    })
})

describe('createUploadHandler.handle - s3Key 검증', () => {
    test('drive 네임스페이스 밖의 s3Key 는 hub 콜백·저장 없이 거부한다', async () => {
        const { result, calls, hubCalls } = await runUpload(
            () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
            'a1b2c3.webp',
        )

        expect(result.success).toBe(false)
        expect(result.message).toBe('Invalid s3Key')
        expect(result.unauthorized).toBeUndefined()
        expect(calls.r2Keys).toEqual([])
        expect(calls.gdriveKeys).toEqual([])
        expect(hubCalls).toEqual([])
    })
})

describe('createUploadHandler.handle - hub status 콜백 게이트', () => {
    test('status 콜백이 비2xx 면 R2·GDrive 에 기록하지 않고 실패한다', async () => {
        const { result, calls, hubCalls } = await runUpload(() => new Response(JSON.stringify({ success: false }), { status: 401 }))

        expect(result.success).toBe(false)
        expect(result.unauthorized).toBe(true)
        expect(calls.r2Keys).toEqual([])
        expect(calls.gdriveKeys).toEqual([])
        expect(hubCalls).toEqual([`${HUB_BASE_URL}/api/drive/assets/1/status`])
    })

    test('status 콜백이 네트워크 오류면 R2·GDrive 에 기록하지 않고 실패한다', async () => {
        const { result, calls } = await runUpload(() => {
            throw new Error('network down')
        })

        expect(result.success).toBe(false)
        expect(result.unauthorized).toBe(true)
        expect(calls.r2Keys).toEqual([])
        expect(calls.gdriveKeys).toEqual([])
    })

    test('status 콜백이 2xx 라도 success 가 아니면 실패한다', async () => {
        const { result, calls } = await runUpload(
            () => new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 200 }),
        )

        expect(result.success).toBe(false)
        expect(result.unauthorized).toBe(true)
        expect(calls.r2Keys).toEqual([])
        expect(calls.gdriveKeys).toEqual([])
    })

    test('status 콜백이 성공하면 R2 에 기록하고 complete 콜백까지 진행한다', async () => {
        const { result, calls, hubCalls } = await runUpload(() => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }))

        expect(result.success).toBe(true)
        expect(result.message).toBe('Uploaded to L1')
        expect(result.unauthorized).toBeUndefined()
        expect(calls.r2Keys).toEqual([VALID_S3_KEY])
        expect(hubCalls).toEqual([
            `${HUB_BASE_URL}/api/drive/assets/1/status`,
            `${HUB_BASE_URL}/api/drive/assets/1/gdrive-token`,
            `${HUB_BASE_URL}/api/drive/assets/1/complete`,
        ])
    })
})

describe('createUploadHandler.handle - hub s3Key 대조', () => {
    test('hub 가 돌려준 s3Key 가 클라이언트 s3Key 와 다르면 저장 없이 거부한다', async () => {
        const { result, calls, hubCalls } = await runUpload(
            () =>
                new Response(JSON.stringify({ success: true, data: { id: 1, uploadStatus: 'uploading', s3Key: 'users/u2/2f0c6d5e/hello.txt' } }), {
                    status: 200,
                }),
        )

        expect(result.success).toBe(false)
        expect(result.message).toBe('Upload not authorized')
        expect(result.unauthorized).toBe(true)
        expect(calls.r2Keys).toEqual([])
        expect(calls.gdriveKeys).toEqual([])
        expect(hubCalls).toEqual([`${HUB_BASE_URL}/api/drive/assets/1/status`])
    })

    test('hub 가 돌려준 s3Key 가 일치하면 그 키로 저장하고 complete 까지 진행한다', async () => {
        const { result, calls, hubCalls } = await runUpload(
            () => new Response(JSON.stringify({ success: true, data: { id: 1, uploadStatus: 'uploading', s3Key: VALID_S3_KEY } }), { status: 200 }),
        )

        expect(result.success).toBe(true)
        expect(calls.r2Keys).toEqual([VALID_S3_KEY])
        expect(hubCalls).toEqual([
            `${HUB_BASE_URL}/api/drive/assets/1/status`,
            `${HUB_BASE_URL}/api/drive/assets/1/gdrive-token`,
            `${HUB_BASE_URL}/api/drive/assets/1/complete`,
        ])
    })

    test('구버전 hub 처럼 s3Key 가 없으면 클라이언트 s3Key 로 그대로 진행한다', async () => {
        const { result, calls } = await runUpload(
            () => new Response(JSON.stringify({ success: true, data: { id: 1, uploadStatus: 'uploading' } }), { status: 200 }),
        )

        expect(result.success).toBe(true)
        expect(calls.r2Keys).toEqual([VALID_S3_KEY])
    })
})

describe('createBlogImageHandler.handle - assetId 검증', () => {
    const createBlogDeps = (tmpDir: string) => {
        const calls = { r2Keys: [] as string[] }

        const deps = {
            r2: {
                upload: async (key: string) => {
                    calls.r2Keys.push(key)
                    return { success: true as const, key }
                },
                uploadBuffer: async (key: string) => {
                    calls.r2Keys.push(key)
                    return { success: true as const, key }
                },
            },
            hubBaseUrl: HUB_BASE_URL,
            tmpDir,
            generateId: () => 'fixed-id',
            imageProcessor: {
                toWebp: async (buffer: Buffer) => buffer,
                getMetadata: async () => ({ width: 1, height: 1 }),
            },
            maxFileSize: 10 * 1024 * 1024,
            allowedMimeTypes: ['image/png'],
        }

        return { deps, calls }
    }

    test('경로 탈출 assetId 는 tmp 파일 생성·R2 기록 없이 거부한다', async () => {
        const tmpDir = createTmpDir()
        const { deps, calls } = createBlogDeps(tmpDir)

        try {
            const handler = createBlogImageHandler(deps)
            const file = new File(['png-bytes'], 'a.png', { type: 'image/png' })
            const result = await handler.handle(file, '../../etc/passwd', '../../etc/passwd.webp', 'token-1')

            expect(result.success).toBe(false)
            expect(result.message).toBe('Invalid assetId')
            expect(calls.r2Keys).toEqual([])
        } finally {
            rmSync(tmpDir, { recursive: true, force: true })
        }
    })
})

describe('upload-server 라우트 계약', () => {
    const createUploadForm = (assetId: string, size = 8) => {
        const form = new FormData()
        form.set('file', new File(['x'.repeat(size)], 'a.bin', { type: 'application/octet-stream' }))
        form.set('assetId', assetId)
        form.set('s3Key', 'users/u1/2f0c6d5e/a.bin')
        form.set('uploadToken', 'token-1')
        return form
    }

    const postUpload = (form: FormData) => server.fetch(new Request('http://upload.test/upload', { method: 'POST', body: form }))

    test('/upload 은 경로 탈출 문자가 섞인 assetId 를 400 으로 거부한다', async () => {
        const res = await postUpload(createUploadForm('1.5'))

        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ success: false, error: 'Invalid assetId' })
    })

    test('/upload 의 누락 파라미터 메시지와 413 응답은 그대로 유지된다', async () => {
        const missing = createUploadForm('1')
        missing.delete('uploadToken')
        const missingRes = await postUpload(missing)

        expect(missingRes.status).toBe(400)
        expect(await missingRes.json()).toEqual({ success: false, error: 'Missing assetId, s3Key, or uploadToken' })

        const tooLargeRes = await postUpload(createUploadForm('1', ROUTE_MAX_UPLOAD_SIZE_BYTES + 1))

        expect(tooLargeRes.status).toBe(413)
        expect(await tooLargeRes.json()).toEqual({ success: false, error: 'File too large' })
    })

    test('/upload 은 hub status 콜백이 거부되면 401 로 종료한다', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.endsWith('/status')) return new Response(JSON.stringify({ success: false }), { status: 401 })
            throw new Error(`unexpected fetch: ${url}`)
        }) as unknown as typeof fetch

        try {
            const res = await postUpload(createUploadForm('1'))

            expect(res.status).toBe(401)
            expect(await res.json()).toEqual({ success: false, error: 'Upload not authorized' })
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    test('/upload-blog-image 는 경로 탈출 assetId 를 400 으로 거부한다', async () => {
        const form = new FormData()
        form.set('file', new File(['png'], 'a.png', { type: 'image/png' }))
        form.set('assetId', '../../etc/passwd')
        form.set('s3Key', '../../etc/passwd.webp')
        form.set('uploadToken', 'token-1')

        const res = await server.fetch(new Request('http://upload.test/upload-blog-image', { method: 'POST', body: form }))

        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ success: false, error: 'Invalid assetId' })
    })
})
