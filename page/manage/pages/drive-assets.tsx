import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { ManageShell } from '../components'
import { Badge, CsrfField, DataTable, FilterBar, Pagination, RowAction, Stat, type Column } from '../../admin/components'
import { flashPath, parseFlash } from '../../admin/flash'
import { formatBytes, formatDate, parseIntOr, readPage } from '../../admin/format'
import type { AdminSessionUser } from '../../admin/guard'
import type { Flash } from '../../admin/flash'
import type { ManageContext, ManageGetSession } from '../guard'
import { requireSessionPage } from '../guard'
import { emptyToUndefined, errorToFlashCode, parseCheckbox, parseId } from '../util'
import type { DriveAssetService } from '../../../service/domain/drive/drive-asset'

type ManageDriveAssetsDeps = {
    getSession: ManageGetSession
    driveAssetService?: DriveAssetService
}

type AssetRow = Awaited<ReturnType<DriveAssetService['list']>>['data'][number]
type AssetDetail = Awaited<ReturnType<DriveAssetService['getDetail']>>
type Quota = Awaited<ReturnType<DriveAssetService['getQuota']>>

const DRIVE_ASSETS_PATH = '/manage/drive/assets'
const DEFAULT_PAGE_SIZE = 20
const MIN_PAGE_SIZE = 5
const MAX_PAGE_SIZE = 100
const SORT_OPTIONS = ['created', 'name', 'size'] as const
const ORDER_OPTIONS = ['desc', 'asc'] as const

const isSort = (v: string | undefined): v is (typeof SORT_OPTIONS)[number] => SORT_OPTIONS.includes(v as (typeof SORT_OPTIONS)[number])
const isOrder = (v: string | undefined): v is (typeof ORDER_OPTIONS)[number] => ORDER_OPTIONS.includes(v as (typeof ORDER_OPTIONS)[number])

const NotConfiguredPage: FC<{ user: AdminSessionUser }> = ({ user }) => (
    <ManageShell title='Drive Assets' subtitle='드라이브 자산' user={user} currentPath={DRIVE_ASSETS_PATH}>
        <div class='banner err' role='alert'>
            드라이브 기능이 아직 구성되지 않았습니다.
        </div>
    </ManageShell>
)

type AssetsPageProps = {
    user: AdminSessionUser
    rows: AssetRow[]
    quota: Quota
    total: number
    page: number
    size: number
    mimeType?: string
    folderId?: string
    sort: string
    order: string
    flash?: Flash | null
}

const AssetsPage: FC<AssetsPageProps> = ({ user, rows, quota, total, page, size, mimeType, folderId, sort, order, flash }) => (
    <ManageShell title='Drive Assets' subtitle='드라이브 자산' user={user} currentPath={DRIVE_ASSETS_PATH} flash={flash}>
        <div class='cards-grid'>
            <Stat label='Used' value={formatBytes(quota.used)} />
            <Stat label='Total' value={formatBytes(quota.total)} />
            <Stat label='Remaining' value={formatBytes(quota.remaining)} />
        </div>

        <FilterBar
            action={DRIVE_ASSETS_PATH}
            fields={[
                { kind: 'text', name: 'mimeType', label: 'MIME', value: mimeType },
                { kind: 'text', name: 'folderId', label: 'Folder ID', value: folderId },
                {
                    kind: 'select',
                    name: 'sort',
                    label: 'Sort',
                    value: sort,
                    options: SORT_OPTIONS.map((s) => ({ value: s, label: s })),
                },
                {
                    kind: 'select',
                    name: 'order',
                    label: 'Order',
                    value: order,
                    options: ORDER_OPTIONS.map((o) => ({ value: o, label: o })),
                },
                { kind: 'number', name: 'size', label: 'Page size', value: size },
            ]}
        />

        <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty='자산이 없습니다.'
            columns={
                [
                    {
                        key: 'name',
                        header: 'Name',
                        cell: (r) => <a href={`${DRIVE_ASSETS_PATH}/${r.id}`}>{r.originalName}</a>,
                        className: 'truncate',
                    },
                    { key: 'mime', header: 'MIME', cell: (r) => r.mimeType, className: 'mono' },
                    { key: 'size', header: 'Size', cell: (r) => formatBytes(r.sizeBytes), className: 'nowrap' },
                    { key: 'tiers', header: 'Tiers', cell: (r) => <span class='mono'>{r.storageTiers || '-'}</span> },
                    { key: 'public', header: 'Public', cell: (r) => <Badge kind={r.isPublic ? 'success' : 'muted'}>{r.isPublic ? 'Y' : 'N'}</Badge> },
                    { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt), className: 'nowrap' },
                    {
                        key: 'toggle',
                        header: '공개토글',
                        cell: (r) => (
                            <RowAction
                                action={`${DRIVE_ASSETS_PATH}/${r.id}/update`}
                                label={r.isPublic ? '비공개로' : '공개로'}
                                variant='ghost'
                                hidden={{ isPublic: r.isPublic ? 'false' : 'true' }}
                                returnTo={DRIVE_ASSETS_PATH}
                            />
                        ),
                    },
                    {
                        key: 'actions',
                        header: '',
                        cell: (r) => (
                            <RowAction
                                action={`${DRIVE_ASSETS_PATH}/${r.id}/delete`}
                                label='삭제'
                                variant='destructive'
                                returnTo={DRIVE_ASSETS_PATH}
                            />
                        ),
                    },
                ] as Column<AssetRow>[]
            }
        />
        <Pagination page={page} pageSize={size} total={total} baseQuery={{ mimeType, folderId, sort, order, size }} basePath={DRIVE_ASSETS_PATH} />
    </ManageShell>
)

const AssetDetailPage: FC<{ user: AdminSessionUser; asset: AssetDetail; flash?: Flash | null }> = ({ user, asset, flash }) => (
    <ManageShell title='Asset detail' subtitle={asset.originalName} user={user} currentPath={DRIVE_ASSETS_PATH} flash={flash}>
        <div class='card'>
            <dl class='kv'>
                <dt>ID</dt>
                <dd class='mono'>{asset.id}</dd>
                <dt>MIME</dt>
                <dd class='mono'>{asset.mimeType}</dd>
                <dt>Size</dt>
                <dd>{formatBytes(asset.sizeBytes)}</dd>
                <dt>Tiers</dt>
                <dd class='mono'>{asset.storageTiers || '-'}</dd>
                <dt>Public</dt>
                <dd>{asset.isPublic ? 'Y' : 'N'}</dd>
                <dt>Folder</dt>
                <dd class='mono'>{asset.folderId ?? '-'}</dd>
                <dt>Download</dt>
                <dd>
                    <a class='btn sm outline' href={`/api/drive/assets/${asset.id}/download`}>
                        다운로드
                    </a>
                </dd>
            </dl>
        </div>

        <div class='card'>
            <h3 class='card-title-sm'>수정</h3>
            <form method='post' action={`${DRIVE_ASSETS_PATH}/${asset.id}/update`} class='form-stack'>
                <CsrfField />
                <input type='hidden' name='returnTo' value={`${DRIVE_ASSETS_PATH}/${asset.id}`} />
                <div class='hstack wrap'>
                    <div class='field field-grow'>
                        <label for='asset-name'>Name</label>
                        <input id='asset-name' class='input input-block' name='originalName' value={asset.originalName} maxlength={255} />
                    </div>
                    <div class='field field-grow'>
                        <label for='asset-folder'>Folder ID (비우면 루트)</label>
                        <input id='asset-folder' class='input input-block' name='folderId' value={asset.folderId ?? ''} />
                    </div>
                    <div class='field'>
                        <label class='checkbox-row' for='asset-public'>
                            <input id='asset-public' type='checkbox' name='isPublic' value='true' checked={asset.isPublic} />
                            공개
                        </label>
                    </div>
                </div>
                <div>
                    <button class='btn' type='submit'>
                        저장
                    </button>
                </div>
            </form>
        </div>

        <div class='card'>
            <RowAction action={`${DRIVE_ASSETS_PATH}/${asset.id}/delete`} label='자산 삭제' variant='destructive' returnTo={DRIVE_ASSETS_PATH} />
        </div>
    </ManageShell>
)

export const createManageDriveAssetsRoute = (deps: ManageDriveAssetsDeps) => {
    const app = new Hono<ManageContext>()
    app.use('*', requireSessionPage(deps.getSession))

    app.get('/', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveAssetService) return c.html(<NotConfiguredPage user={user} />)
        const page = readPage(c.req.query('page'))
        const size = Math.min(Math.max(parseIntOr(c.req.query('size'), DEFAULT_PAGE_SIZE), MIN_PAGE_SIZE), MAX_PAGE_SIZE)
        const mimeType = emptyToUndefined(c.req.query('mimeType'))
        const folderId = emptyToUndefined(c.req.query('folderId'))
        const sortRaw = c.req.query('sort')
        const orderRaw = c.req.query('order')
        const sort = isSort(sortRaw) ? sortRaw : 'created'
        const order = isOrder(orderRaw) ? orderRaw : 'desc'

        const [result, quota] = await Promise.all([
            deps.driveAssetService.list(user.id, { page, limit: size, mimeType, folderId, sort, order }),
            deps.driveAssetService.getQuota(user.id),
        ])
        return c.html(
            <AssetsPage
                user={user}
                rows={result.data}
                quota={quota}
                total={result.total}
                page={page}
                size={size}
                mimeType={mimeType}
                folderId={folderId}
                sort={sort}
                order={order}
                flash={parseFlash(c)}
            />,
        )
    })

    app.get('/:id', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveAssetService) return c.html(<NotConfiguredPage user={user} />)
        const id = parseId(c.req.param('id'))
        if (id === null) return c.redirect(flashPath(DRIVE_ASSETS_PATH, 'err', 'validation'), 303)
        try {
            const asset = await deps.driveAssetService.getDetail(id, user.id)
            return c.html(<AssetDetailPage user={user} asset={asset} flash={parseFlash(c)} />)
        } catch (error) {
            return c.redirect(flashPath(DRIVE_ASSETS_PATH, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/update', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveAssetService) return c.redirect(flashPath(DRIVE_ASSETS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        const body = await c.req.parseBody()
        const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/manage') ? body.returnTo : DRIVE_ASSETS_PATH
        if (id === null) return c.redirect(flashPath(returnTo, 'err', 'validation'), 303)
        try {
            await deps.driveAssetService.update(id, user.id, {
                originalName: emptyToUndefined(body.originalName),
                isPublic: parseCheckbox(body.isPublic),
                folderId: 'folderId' in body ? (emptyToUndefined(body.folderId) ?? null) : undefined,
            })
            return c.redirect(flashPath(returnTo, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnTo, 'err', errorToFlashCode(error)), 303)
        }
    })

    app.post('/:id/delete', async (c) => {
        const user = c.get('manageUser')
        if (!deps.driveAssetService) return c.redirect(flashPath(DRIVE_ASSETS_PATH, 'err', 'not_configured'), 303)
        const id = parseId(c.req.param('id'))
        const body = await c.req.parseBody()
        const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/manage') ? body.returnTo : DRIVE_ASSETS_PATH
        if (id === null) return c.redirect(flashPath(returnTo, 'err', 'validation'), 303)
        try {
            await deps.driveAssetService.remove(id, user.id)
            return c.redirect(flashPath(returnTo, 'ok'), 303)
        } catch (error) {
            return c.redirect(flashPath(returnTo, 'err', errorToFlashCode(error)), 303)
        }
    })

    return app
}
