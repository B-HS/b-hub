import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, CsrfField, DataTable, FilterBar, Pagination, RowAction, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatDate, parseIntOr } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseCheckbox } from '../util'
import { RESUME_TYPE, resumeCreateSchema, resumeUpdateSchema } from '../../../dto/resume/resume'
import type { ResumeService } from '../../../service/domain/resume/resume'

type ManageResumeDeps = {
    getSession: ManageGetSession
    resumeService?: ResumeService
}

type ResumeRow = Awaited<ReturnType<ResumeService['list']>>['resumes'][number]

const RESUME_PATH = '/manage/resume'
const DEFAULT_PAGE_SIZE = 20
const MIN_PAGE_SIZE = 5
const MAX_PAGE_SIZE = 50

const parseJson = (value: unknown): { ok: true; data: unknown } | { ok: false } => {
    if (typeof value !== 'string' || value.trim().length === 0) return { ok: false }
    try {
        return { ok: true, data: JSON.parse(value) }
    } catch {
        return { ok: false }
    }
}

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Resumes' subtitle='이력서 관리' user={user} currentPath={RESUME_PATH}>
        <div class='banner err' role='alert'>
            이력서 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

type ResumesPageProps = { user: AdminSessionUser; rows: ResumeRow[]; total: number; page: number; size: number; type?: string; flash?: Flash | null }

const ResumesPage: FC<ResumesPageProps> = ({ user, rows, total, page, size, type, flash }) => (
    <ManageShell title='Resumes' subtitle='이력서 관리' user={user} currentPath={RESUME_PATH} flash={flash}>
        <div class='card'>
            <h3 class='card-title-sm'>새 이력서</h3>
            <form method='post' action={RESUME_PATH} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field'>
                        <label for='resume-type'>Type</label>
                        <select id='resume-type' class='select' name='type'>
                            {RESUME_TYPE.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class='field field-grow'>
                        <label for='resume-title'>Title</label>
                        <input id='resume-title' class='input input-block' name='title' required maxlength={255} />
                    </div>
                    <div class='field'>
                        <label class='checkbox-row' for='resume-public'>
                            <input id='resume-public' type='checkbox' name='isPublic' value='true' />
                            공개
                        </label>
                    </div>
                </div>
                <div class='field'>
                    <label for='resume-data'>Data (JSON)</label>
                    <textarea id='resume-data' class='input input-block mono' name='data' rows={8} placeholder='{ ... }'></textarea>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        생성
                    </button>
                </div>
            </form>
            <p class='text-muted mt-sm'>Data 는 선택한 type 의 스키마에 맞는 JSON 이어야 합니다.</p>
        </div>

        <FilterBar
            action={RESUME_PATH}
            fields={[
                {
                    kind: 'select',
                    name: 'type',
                    label: 'Type',
                    value: type,
                    options: [{ value: '', label: '전체' }, ...RESUME_TYPE.map((t) => ({ value: t, label: t }))],
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='이력서가 없습니다.'
            columns={
                [
                    { key: 'title', header: 'Title', cell: (r) => <a href={`${RESUME_PATH}/${r.id}`}>{r.title}</a> },
                    { key: 'type', header: 'Type', cell: (r) => <Badge kind='secondary'>{r.type}</Badge> },
                    { key: 'public', header: 'Public', cell: (r) => <Badge kind={r.isPublic ? 'success' : 'muted'}>{r.isPublic ? 'Y' : 'N'}</Badge> },
                    { key: 'updated', header: 'Updated', cell: (r) => formatDate(r.updatedAt), className: 'nowrap' },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => <RowAction action={`${RESUME_PATH}/${r.id}/delete`} label='삭제' variant='destructive' returnTo={RESUME_PATH} />,
                    },
                ] as Column<ResumeRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ type, size }} basePath={RESUME_PATH} />
    </ManageShell>
)

const ResumeDetailPage: FC<{ user: AdminSessionUser; resume: ResumeRow; flash?: Flash | null }> = ({ user, resume, flash }) => (
    <ManageShell title='Resume detail' subtitle={resume.title} user={user} currentPath={RESUME_PATH} flash={flash}>
        <div class='card'>
            <h3 class='card-title-sm'>수정</h3>
            <form method='post' action={`${RESUME_PATH}/${resume.id}/update`} class='form-stack'>
                <CsrfField />
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='resume-edit-title'>Title</label>
                        <input id='resume-edit-title' class='input input-block' name='title' value={resume.title} maxlength={255} />
                    </div>
                    <div class='field'>
                        <label class='checkbox-row' for='resume-edit-public'>
                            <input id='resume-edit-public' type='checkbox' name='isPublic' value='true' checked={resume.isPublic} />
                            공개
                        </label>
                    </div>
                </div>
                <div class='field'>
                    <label for='resume-edit-data'>Data (JSON, 비우면 유지)</label>
                    <textarea id='resume-edit-data' class='input input-block mono' name='data' rows={10}>
                        {JSON.stringify(resume.data, null, 2)}
                    </textarea>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        저장
                    </button>
                </div>
            </form>
        </div>
        <div class='card'>
            <RowAction action={`${RESUME_PATH}/${resume.id}/delete`} label='이력서 삭제' variant='destructive' returnTo={RESUME_PATH} />
        </div>
    </ManageShell>
)

const reasonToFlashCode = (reason: 'not_found' | 'not_owner'): string => (reason === 'not_owner' ? 'forbidden' : 'not_found')

export const createManageResumeRoute = (deps: ManageResumeDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.resumeService) return c.html(<NotConfiguredPage user={user} />)
        const page = parseIntOr(c.req.query('page'), 1)
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), DEFAULT_PAGE_SIZE), MIN_PAGE_SIZE), MAX_PAGE_SIZE)
        const typeRaw = c.req.query('type')
        const type = typeRaw === 'resume' || typeRaw === 'cv' || typeRaw === 'web' ? typeRaw : undefined
        const { resumes, total } = await deps.resumeService.list(user.id, { type, page, limit: size })
        return c.html(<ResumesPage user={user} rows={resumes} total={total} page={page} size={size} type={typeRaw} flash={parseFlash(c)} />)
    })

    app.post('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.resumeService) return c.redirect(flashPath(RESUME_PATH, 'err', 'not_configured'), 303)
        const body = await c.req.parseBody()
        const parsedData = parseJson(body.data)
        if (!parsedData.ok) return c.redirect(flashPath(RESUME_PATH, 'err', 'validation'), 303)
        const parsed = resumeCreateSchema.safeParse({
            type: body.type,
            title: body.title,
            isPublic: parseCheckbox(body.isPublic),
            data: parsedData.data,
        })
        if (!parsed.success) return c.redirect(flashPath(RESUME_PATH, 'err', 'validation'), 303)
        try {
            await deps.resumeService.create(user.id, parsed.data)
            return c.redirect(flashPath(RESUME_PATH, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(RESUME_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.get('/:id', async (c) => {
        const user = c.get('manageUser')
        if (!deps.resumeService) return c.html(<NotConfiguredPage user={user} />)
        const id = Number(c.req.param('id'))
        if (!Number.isInteger(id) || id <= 0) return c.redirect(flashPath(RESUME_PATH, 'err', 'validation'), 303)
        const result = await deps.resumeService.getById(id, user.id)
        if (!result.success) return c.redirect(flashPath(RESUME_PATH, 'err', reasonToFlashCode(result.reason)), 303)
        return c.html(<ResumeDetailPage user={user} resume={result.resume} flash={parseFlash(c)} />)
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.resumeService) return c.redirect(flashPath(RESUME_PATH, 'err', 'not_configured'), 303)
        const id = Number(c.req.param('id'))
        if (!Number.isInteger(id) || id <= 0) return c.redirect(flashPath(RESUME_PATH, 'err', 'validation'), 303)
        const body = await c.req.parseBody()
        const dataRaw = parseJson(body.data)
        const parsed = resumeUpdateSchema.safeParse({
            title: emptyToUndefined(body.title),
            isPublic: parseCheckbox(body.isPublic),
            ...(dataRaw.ok ? { data: dataRaw.data } : {}),
        })
        if (!parsed.success) return c.redirect(flashPath(`${RESUME_PATH}/${id}`, 'err', 'validation'), 303)
        const result = await deps.resumeService.update(id, user.id, parsed.data)
        if (!result.success) return c.redirect(flashPath(`${RESUME_PATH}/${id}`, 'err', reasonToFlashCode(result.reason)), 303)
        return c.redirect(flashPath(`${RESUME_PATH}/${id}`, 'ok'), 303)
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.resumeService) return c.redirect(flashPath(RESUME_PATH, 'err', 'not_configured'), 303)
        const id = Number(c.req.param('id'))
        if (!Number.isInteger(id) || id <= 0) return c.redirect(flashPath(RESUME_PATH, 'err', 'validation'), 303)
        const result = await deps.resumeService.delete(id, user.id)
        if (!result.success) return c.redirect(flashPath(RESUME_PATH, 'err', reasonToFlashCode(result.reason)), 303)
        return c.redirect(flashPath(RESUME_PATH, 'ok'), 303)
    })

    return app
}
