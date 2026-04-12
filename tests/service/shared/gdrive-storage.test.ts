import { describe, expect, test, mock, beforeAll } from 'bun:test'
import { createGdriveStorageService } from '../../../service/shared/gdrive-storage'

const mockTokenResponse = { access_token: 'mock-access-token', expires_in: 3600 }

let TEST_PRIVATE_KEY_PEM = ''

beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, [
        'sign',
        'verify',
    ])
    const exported = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
    TEST_PRIVATE_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END RSA PRIVATE KEY-----\n`
})

const createDeps = () => ({
    serviceAccountKey: {
        client_email: 'test@test-project.iam.gserviceaccount.com',
        private_key: TEST_PRIVATE_KEY_PEM,
        token_uri: 'https://oauth2.googleapis.com/token',
    },
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

    describe('Service Account JWT 인증', () => {
        test('토큰 요청 시 JWT assertion을 사용한다', async () => {
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
                    new ReadableStream({
                        start(c) {
                            c.enqueue(new TextEncoder().encode('data'))
                            c.close()
                        },
                    }),
                    { status: 200 },
                )
            }) as typeof fetch

            try {
                const service = createGdriveStorageService(createDeps())
                await service.download('test-id')
                expect(tokenRequestBody).toContain('grant_type=urn')
                expect(tokenRequestBody).toContain('assertion=')
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
