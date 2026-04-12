import { describe, expect, test, mock } from 'bun:test'
import { createGdriveStorageService } from '../../../service/shared/gdrive-storage'

const mockTokenResponse = { access_token: 'mock-access-token', expires_in: 3600 }

const createDeps = () => ({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    refreshToken: 'test-refresh-token',
})

describe('createGdriveStorageService', () => {
    describe('download', () => {
        test('Google Drive에서 파일을 스트림으로 다운로드한다', async () => {
            const originalFetch = globalThis.fetch
            let callCount = 0
            globalThis.fetch = mock(async () => {
                callCount++
                if (callCount === 1) {
                    return new Response(JSON.stringify(mockTokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
                }
                const body = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('file-content'))
                        controller.close()
                    },
                })
                return new Response(body, { status: 200 })
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                const stream = await service.download('test-file-id')
                expect(stream).toBeInstanceOf(ReadableStream)

                const reader = stream.getReader()
                const { value } = await reader.read()
                expect(new TextDecoder().decode(value)).toBe('file-content')
            } finally {
                globalThis.fetch = originalFetch
            }
        })

        test('다운로드 실패 시 DRIVE_L3_DOWNLOAD_FAILED 에러를 던진다', async () => {
            const originalFetch = globalThis.fetch
            let callCount = 0
            globalThis.fetch = mock(async () => {
                callCount++
                if (callCount === 1) {
                    return new Response(JSON.stringify(mockTokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
                }
                return new Response('Not Found', { status: 404 })
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await expect(service.download('invalid-id')).rejects.toMatchObject({ code: 'DRIVE_L3_DOWNLOAD_FAILED' })
            } finally {
                globalThis.fetch = originalFetch
            }
        })
    })

    describe('del', () => {
        test('Google Drive에서 파일을 삭제한다', async () => {
            const originalFetch = globalThis.fetch
            let callCount = 0
            globalThis.fetch = mock(async () => {
                callCount++
                if (callCount === 1) {
                    return new Response(JSON.stringify(mockTokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
                }
                return new Response(null, { status: 204 })
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await expect(service.del('test-file-id')).resolves.toBeUndefined()
            } finally {
                globalThis.fetch = originalFetch
            }
        })

        test('이미 삭제된 파일(404)은 에러를 던지지 않는다', async () => {
            const originalFetch = globalThis.fetch
            let callCount = 0
            globalThis.fetch = mock(async () => {
                callCount++
                if (callCount === 1) {
                    return new Response(JSON.stringify(mockTokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
                }
                return new Response('Not Found', { status: 404 })
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await expect(service.del('already-deleted')).resolves.toBeUndefined()
            } finally {
                globalThis.fetch = originalFetch
            }
        })
    })

    describe('OAuth 토큰', () => {
        test('refresh token으로 access token을 발급받는다', async () => {
            const originalFetch = globalThis.fetch
            let tokenRequestBody = ''
            let callCount = 0
            globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
                callCount++
                if (callCount === 1) {
                    tokenRequestBody = init?.body?.toString() ?? ''
                    return new Response(JSON.stringify(mockTokenResponse), { status: 200 })
                }
                return new Response(
                    new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close() } }),
                    { status: 200 },
                )
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await service.download('test-id')
                expect(tokenRequestBody).toContain('grant_type=refresh_token')
                expect(tokenRequestBody).toContain('client_id=test-client-id')
                expect(tokenRequestBody).toContain('refresh_token=test-refresh-token')
            } finally {
                globalThis.fetch = originalFetch
            }
        })

        test('토큰 갱신 실패 시 DRIVE_L3_DOWNLOAD_FAILED 에러를 던진다', async () => {
            const originalFetch = globalThis.fetch
            globalThis.fetch = mock(async () => new Response('Unauthorized', { status: 401 })) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await expect(service.download('test-file-id')).rejects.toMatchObject({ code: 'DRIVE_L3_DOWNLOAD_FAILED' })
            } finally {
                globalThis.fetch = originalFetch
            }
        })
    })
})
