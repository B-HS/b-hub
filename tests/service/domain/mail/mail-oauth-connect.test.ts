import { describe, expect, test, mock } from 'bun:test'
import { createMailOAuthConnectService } from '../../../../service/domain/mail/mail-oauth-connect'

const createMockDeps = (overrides: Record<string, unknown> = {}) => ({
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-client-secret',
    secret: 'test-hmac-secret-key-that-is-long-enough',
    findAccountByProviderAndUser: mock(() => Promise.resolve(null)),
    upsertAccount: mock(() => Promise.resolve({ id: 'account-1' })),
    findMailAccountByEmail: mock(() => Promise.resolve(null)),
    createMailAccount: mock(() => Promise.resolve({ id: 1 })),
    updateMailAccountBetterAuthId: mock(() => Promise.resolve()),
    ...overrides,
})

describe('createMailOAuthConnectService', () => {
    describe('generateAuthUrl', () => {
        test('올바른 Google OAuth URL을 생성한다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
            expect(url).toContain('client_id=test-client-id')
        })

        test('scope에 gmail.modify와 gmail.send가 포함된다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('gmail.modify')
            expect(url).toContain('gmail.send')
        })

        test('access_type=offline과 prompt=consent를 설정한다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('access_type=offline')
            expect(url).toContain('prompt=consent')
        })

        test('redirect_uri에 콜백 경로가 포함된다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain(encodeURIComponent('/api/mail/accounts/connect/google/callback'))
        })

        test('state 파라미터가 포함된다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('state=')
        })

        test('response_type=code가 포함된다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const url = await service.generateAuthUrl('user-1', 'https://api.gumyo.net')
            expect(url).toContain('response_type=code')
        })
    })

    describe('parseRedirectFromState', () => {
        test('잘못된 state는 null을 반환한다', () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            const redirect = service.parseRedirectFromState('invalid-state')
            expect(redirect).toBeNull()
        })
    })

    describe('handleCallback', () => {
        test('잘못된 state는 에러를 던진다', async () => {
            const deps = createMockDeps()
            const service = createMailOAuthConnectService(deps)

            await expect(
                service.handleCallback('code', 'invalid-state', 'user-1', 'https://api.gumyo.net'),
            ).rejects.toThrow()
        })
    })
})
