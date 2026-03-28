import { describe, expect, test, mock } from 'bun:test'
import { createMailProviderFactory } from '../../../../service/domain/mail/mail-provider-factory'

const createMockDeps = () => ({
    crypto: {
        encrypt: mock((text: string) => `enc:${text}`),
        decrypt: mock((text: string) => text.replace('enc:', '')),
    },
    getOAuthToken: mock((_accountId: string, _userId: string) => Promise.resolve({ accessToken: 'token', refreshToken: 'refresh' })),
    refreshOAuthToken: mock((_accountId: string, _refreshToken: string, _userId: string) => Promise.resolve('new-token')),
})

const mockAccount = (overrides = {}) => ({
    id: 1,
    userId: 'user-1',
    provider: 'gmail',
    email: 'test@gmail.com',
    displayName: null,
    credentials: null,
    imapHost: null,
    imapPort: null,
    imapTls: true,
    smtpHost: null,
    smtpPort: null,
    smtpTls: true,
    isActive: true,
    lastSyncAt: null,
    lastSyncStatus: 'pending',
    syncCursor: null,
    betterAuthAccountId: 'ba-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

describe('createMailProviderFactory', () => {
    test('gmail 프로바이더를 생성한다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        const provider = factory.create(mockAccount({ provider: 'gmail' }))
        expect(provider).toBeDefined()
        expect(provider.connect).toBeDefined()
        expect(provider.testConnection).toBeDefined()
        expect(provider.sendMessage).toBeDefined()
    })

    test('naver 프로바이더를 생성한다 (프리셋 적용)', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        const provider = factory.create(
            mockAccount({
                provider: 'naver',
                credentials: 'enc:{"password":"secret"}',
            }),
        )
        expect(provider).toBeDefined()
        expect(deps.crypto.decrypt).toHaveBeenCalledWith('enc:{"password":"secret"}')
    })

    test('daum 프로바이더를 생성한다 (프리셋 적용)', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        const provider = factory.create(
            mockAccount({
                provider: 'daum',
                credentials: 'enc:{"password":"pass"}',
            }),
        )
        expect(provider).toBeDefined()
    })

    test('imap 프로바이더를 커스텀 호스트로 생성한다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        const provider = factory.create(
            mockAccount({
                provider: 'imap',
                imapHost: 'imap.custom.com',
                imapPort: 993,
                smtpHost: 'smtp.custom.com',
                smtpPort: 587,
                credentials: 'enc:{"password":"pass"}',
            }),
        )
        expect(provider).toBeDefined()
    })

    test('credentials의 username을 전달한다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        const provider = factory.create(
            mockAccount({
                provider: 'naver',
                credentials: 'enc:{"username":"bbb301","password":"secret"}',
            }),
        )
        expect(provider).toBeDefined()
        expect(deps.crypto.decrypt).toHaveBeenCalledWith('enc:{"username":"bbb301","password":"secret"}')
    })

    test('gmail에 betterAuthAccountId가 없으면 에러를 발생시킨다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        expect(() =>
            factory.create(
                mockAccount({
                    provider: 'gmail',
                    betterAuthAccountId: null,
                }),
            ),
        ).toThrow()
    })

    test('IMAP에 password가 없으면 에러를 발생시킨다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        expect(() =>
            factory.create(
                mockAccount({
                    provider: 'naver',
                    credentials: null,
                }),
            ),
        ).toThrow()
    })

    test('credentials JSON 파싱 실패 시 에러를 발생시킨다', () => {
        const deps = createMockDeps()
        deps.crypto.decrypt = mock(() => 'not-valid-json')
        const factory = createMailProviderFactory(deps)
        expect(() =>
            factory.create(
                mockAccount({
                    provider: 'naver',
                    credentials: 'encrypted-bad-data',
                }),
            ),
        ).toThrow()
    })

    test('credentials에 password 없으면 에러를 발생시킨다', () => {
        const deps = createMockDeps()
        const factory = createMailProviderFactory(deps)
        expect(() =>
            factory.create(
                mockAccount({
                    provider: 'naver',
                    credentials: 'enc:{"username":"user"}',
                }),
            ),
        ).toThrow()
    })
})
