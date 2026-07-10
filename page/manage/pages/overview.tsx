import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, Stat } from '../../admin/components'
import type { AdminSessionUser } from '../../admin/guard'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import type { AiService } from '../../../service/domain/ai/ai'
import type { ApiTokenService } from '../../../service/shared/api-token'
import type { WeatherApiKeyService } from '../../../service/domain/weather/weather-api-key'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'

type ManageOverviewDeps = {
    getSession: ManageGetSession
    aiService?: AiService
    apiTokenService: ApiTokenService
    weatherApiKeyService: WeatherApiKeyService
    mailAccountService?: MailAccountService
}

type AiStatus = Awaited<ReturnType<AiService['getStatus']>>

type OverviewSummary = {
    aiStatus: AiStatus
    aiConfigured: boolean
    tokenCount: number
    weatherKeyCount: number
    mailAccountCount: number
}

const OverviewPage: FC<{ user: AdminSessionUser; summary: OverviewSummary }> = ({ user, summary }) => (
    <ManageShell title='Overview' subtitle='내 계정과 연동 상태 요약' user={user} currentPath='/manage'>
        <div class='card'>
            <h2 class='card-title'>내 계정</h2>
            <dl class='kv'>
                <dt>Email</dt>
                <dd>{user.email}</dd>
                <dt>Name</dt>
                <dd>{user.name}</dd>
                <dt>Role</dt>
                <dd>{user.role ?? 'user'}</dd>
            </dl>
        </div>

        <div class='cards-grid'>
            <Stat label='AI Providers Connected' value={summary.aiStatus.filter((s) => s.connected).length} />
            <Stat label='API Tokens' value={summary.tokenCount} />
            <Stat label='Weather Keys' value={summary.weatherKeyCount} />
            <Stat label='Mail Accounts' value={summary.mailAccountCount} />
        </div>

        <div class='card'>
            <h2 class='card-title'>AI 프로바이더 연동</h2>
            {summary.aiConfigured ? (
                <div class='hstack wrap'>
                    {summary.aiStatus.map((s) => (
                        <span key={s.provider} class='inline-hstack'>
                            <Badge kind={s.connected ? 'success' : 'muted'}>{s.provider}</Badge>
                            <span class='text-muted'>{s.connected ? `${s.keyCount} key(s)` : '미연동'}</span>
                        </span>
                    ))}
                </div>
            ) : (
                <p class='text-muted'>AI 기능이 아직 구성되지 않았습니다.</p>
            )}
        </div>
    </ManageShell>
)

export const createManageOverviewRoute = (deps: ManageOverviewDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        const [aiStatus, tokens, weatherKeys, mailAccounts] = await Promise.all([
            deps.aiService ? deps.aiService.getStatus(user.id) : Promise.resolve([] as AiStatus),
            deps.apiTokenService.listByUser(user.id),
            deps.weatherApiKeyService.listByUser(user.id),
            deps.mailAccountService ? deps.mailAccountService.list(user.id) : Promise.resolve([]),
        ])
        const summary: OverviewSummary = {
            aiStatus,
            aiConfigured: Boolean(deps.aiService),
            tokenCount: tokens.length,
            weatherKeyCount: weatherKeys.length,
            mailAccountCount: mailAccounts.length,
        }
        return c.html(<OverviewPage user={user} summary={summary} />)
    })

    return app
}
