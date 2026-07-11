import {
    mysqlTable,
    int,
    varchar,
    text,
    longtext,
    boolean,
    datetime,
    timestamp,
    bigint,
    json,
    index,
    unique,
    mysqlEnum,
    tinyint,
    smallint,
    customType,
} from 'drizzle-orm/mysql-core'

const mediumblob = customType<{ data: Buffer }>({
    dataType: () => 'mediumblob',
})

export const user = mysqlTable('user', {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: text('name').notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { fsp: 3 }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Seoul'),
    storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' })
        .notNull()
        .default(10 * 1024 * 1024),
})

export const session = mysqlTable('session', {
    id: varchar('id', { length: 36 }).primaryKey(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
        .$onUpdate(() => new Date())
        .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
})

export const account = mysqlTable('account', {
    id: varchar('id', { length: 36 }).primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { fsp: 3 }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { fsp: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
        .$onUpdate(() => new Date())
        .notNull(),
})

export const verification = mysqlTable('verification', {
    id: varchar('id', { length: 36 }).primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
})

export const apiToken = mysqlTable(
    'api_token',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 64 }).notNull().unique(),
        name: varchar('name', { length: 100 }),
        expiresAt: timestamp('expires_at', { fsp: 3 }),
        lastUsedAt: timestamp('last_used_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_api_token_user').on(table.userId)],
)

export const apiRequestLog = mysqlTable(
    'api_request_log',
    {
        id: int('id').autoincrement().primaryKey(),
        method: varchar('method', { length: 10 }).notNull(),
        path: varchar('path', { length: 500 }).notNull(),
        statusCode: int('status_code').notNull(),
        userId: varchar('user_id', { length: 36 }),
        ip: varchar('ip', { length: 45 }),
        userAgent: text('user_agent'),
        durationMs: int('duration_ms'),
        errorCode: varchar('error_code', { length: 50 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_request_log_user').on(table.userId), index('idx_request_log_created').on(table.createdAt)],
)

export const posts = mysqlTable('posts', {
    postId: int('postId').autoincrement().primaryKey().notNull(),
    categoryId: int('categoryId')
        .notNull()
        .references(() => categories.categoryId),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    updatedAt: datetime('updated_at').notNull(),
    createdAt: datetime('created_at').notNull(),
    views: int('views').default(0).notNull(),
    isPublished: boolean('isPublished').default(false).notNull(),
    isHide: boolean('isHide').default(false).notNull(),
    isNotice: boolean('isNotice').default(false).notNull(),
    isComment: boolean('isComment').default(true).notNull(),
})

export const comments = mysqlTable('comments', {
    commentId: int('commentId').autoincrement().primaryKey().notNull(),
    postId: int('postId')
        .notNull()
        .references(() => posts.postId),
    userId: varchar('userId', { length: 36 })
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    comment: text('comment').notNull(),
    updatedAt: datetime('updated_at').notNull(),
    createdAt: datetime('created_at').notNull(),
    isHide: boolean('isHide').default(false).notNull(),
})

export const tags = mysqlTable('tags', {
    tagId: int('tagId').autoincrement().primaryKey().notNull(),
    tag: varchar('tag', { length: 255 }).notNull(),
})

export const categories = mysqlTable('categories', {
    categoryId: int('categoryId').autoincrement().primaryKey().notNull(),
    category: varchar('category', { length: 255 }).notNull(),
    isHide: boolean('isHide').default(false).notNull(),
})

export const postTags = mysqlTable(
    'post_tags',
    {
        postId: int('postId')
            .notNull()
            .references(() => posts.postId, { onDelete: 'cascade' }),
        tagId: int('tagId')
            .notNull()
            .references(() => tags.tagId, { onDelete: 'cascade' }),
    },
    (table) => [unique().on(table.postId, table.tagId)],
)

export const images = mysqlTable('images', {
    imageId: int('imageId').autoincrement().primaryKey().notNull(),
    userId: varchar('userId', { length: 36 })
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    fileName: varchar('fileName', { length: 255 }).notNull(),
    originalName: varchar('originalName', { length: 255 }).notNull(),
    url: text('url').notNull(),
    mimeType: varchar('mimeType', { length: 100 }).notNull(),
    fileSize: int('fileSize').notNull(),
    width: int('width').notNull(),
    height: int('height').notNull(),
    createdAt: datetime('created_at').notNull(),
    updatedAt: datetime('updated_at').notNull(),
})

export const imageAssets = mysqlTable('image_assets', {
    id: varchar('id', { length: 36 }).primaryKey().notNull(),
    r2Key: varchar('r2_key', { length: 255 }).notNull().unique(),
    bucket: varchar('bucket', { length: 100 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    width: int('width'),
    height: int('height'),
    checksum: varchar('checksum', { length: 64 }),
    uploadedBy: varchar('uploaded_by', { length: 36 }).references(() => user.id, {
        onDelete: 'set null',
    }),
    createdAt: datetime('created_at').notNull(),
    updatedAt: datetime('updated_at').notNull(),
})

export const messages = mysqlTable('messages', {
    id: varchar('id', { length: 36 }).primaryKey().notNull(),
    userId: varchar('userId', { length: 36 })
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    replyToId: varchar('replyToId', { length: 36 }),
    retweetOfId: varchar('retweetOfId', { length: 36 }),
    createdAt: datetime('created_at').notNull(),
    updatedAt: datetime('updated_at').notNull(),
    deletedAt: datetime('deleted_at'),
})

export const messageImages = mysqlTable(
    'message_images',
    {
        messageId: varchar('messageId', { length: 36 })
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        imageId: varchar('imageId', { length: 36 })
            .notNull()
            .references(() => imageAssets.id, { onDelete: 'cascade' }),
        order: int('order'),
        createdAt: datetime('created_at').notNull(),
    },
    (table) => [unique().on(table.messageId, table.imageId)],
)

export const messageLikes = mysqlTable(
    'message_likes',
    {
        messageId: varchar('messageId', { length: 36 })
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        userId: varchar('userId', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        createdAt: datetime('created_at').notNull(),
    },
    (table) => [unique().on(table.messageId, table.userId)],
)

export const messageBookmarks = mysqlTable(
    'message_bookmarks',
    {
        messageId: varchar('messageId', { length: 36 })
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        userId: varchar('userId', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        createdAt: datetime('created_at').notNull(),
    },
    (table) => [unique().on(table.messageId, table.userId)],
)

export const follows = mysqlTable(
    'follows',
    {
        followerId: varchar('followerId', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        followingId: varchar('followingId', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        createdAt: datetime('created_at').notNull(),
    },
    (table) => [unique().on(table.followerId, table.followingId)],
)

export const weatherCurrent = mysqlTable(
    'weather_current',
    {
        id: int('id').autoincrement().primaryKey(),
        nx: int('nx').notNull(),
        ny: int('ny').notNull(),
        baseDate: varchar('base_date', { length: 8 }).notNull(),
        baseTime: varchar('base_time', { length: 4 }).notNull(),
        category: varchar('category', { length: 10 }).notNull(),
        obsrValue: varchar('obsr_value', { length: 20 }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('idx_weather_current_grid').on(table.nx, table.ny, table.baseDate, table.baseTime)],
)

export const weatherUltra = mysqlTable(
    'weather_ultra',
    {
        id: int('id').autoincrement().primaryKey(),
        nx: int('nx').notNull(),
        ny: int('ny').notNull(),
        baseDate: varchar('base_date', { length: 8 }).notNull(),
        baseTime: varchar('base_time', { length: 4 }).notNull(),
        fcstDate: varchar('fcst_date', { length: 8 }).notNull(),
        fcstTime: varchar('fcst_time', { length: 4 }).notNull(),
        category: varchar('category', { length: 10 }).notNull(),
        fcstValue: varchar('fcst_value', { length: 20 }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('idx_weather_ultra_grid').on(table.nx, table.ny, table.baseDate, table.baseTime)],
)

export const weatherShort = mysqlTable(
    'weather_short',
    {
        id: int('id').autoincrement().primaryKey(),
        nx: int('nx').notNull(),
        ny: int('ny').notNull(),
        baseDate: varchar('base_date', { length: 8 }).notNull(),
        baseTime: varchar('base_time', { length: 4 }).notNull(),
        fcstDate: varchar('fcst_date', { length: 8 }).notNull(),
        fcstTime: varchar('fcst_time', { length: 4 }).notNull(),
        category: varchar('category', { length: 10 }).notNull(),
        fcstValue: varchar('fcst_value', { length: 20 }).notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('idx_weather_short_grid').on(table.nx, table.ny, table.baseDate, table.baseTime)],
)

export const weatherApiKey = mysqlTable(
    'weather_api_key',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 64 }).notNull().unique(),
        name: varchar('name', { length: 100 }),
        dailyLimit: int('daily_limit').default(100).notNull(),
        expiresAt: timestamp('expires_at', { fsp: 3 }),
        lastUsedAt: timestamp('last_used_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_weather_api_key_user').on(table.userId)],
)

export const weatherApiLog = mysqlTable(
    'weather_api_log',
    {
        id: int('id').autoincrement().primaryKey(),
        keyId: int('key_id').references(() => weatherApiKey.id, { onDelete: 'set null' }),
        userId: varchar('user_id', { length: 36 }).references(() => user.id, {
            onDelete: 'set null',
        }),
        endpoint: varchar('endpoint', { length: 50 }).notNull(),
        nx: int('nx'),
        ny: int('ny'),
        statusCode: int('status_code').notNull(),
        ip: varchar('ip', { length: 45 }),
        userAgent: text('user_agent'),
        durationMs: int('duration_ms'),
        errorCode: varchar('error_code', { length: 50 }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [index('idx_weather_api_log_user').on(table.userId), index('idx_weather_api_log_key_created').on(table.keyId, table.createdAt)],
)

export const mailAccounts = mysqlTable(
    'mail_accounts',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        provider: varchar('provider', { length: 20 }).notNull(),
        email: varchar('email', { length: 255 }).notNull(),
        displayName: varchar('display_name', { length: 100 }),
        credentials: text('credentials'),
        imapHost: varchar('imap_host', { length: 255 }),
        imapPort: int('imap_port'),
        imapTls: boolean('imap_tls').default(true),
        smtpHost: varchar('smtp_host', { length: 255 }),
        smtpPort: int('smtp_port'),
        smtpTls: boolean('smtp_tls').default(true),
        isActive: boolean('is_active').default(true).notNull(),
        lastSyncAt: timestamp('last_sync_at', { fsp: 3 }),
        lastSyncStatus: varchar('last_sync_status', { length: 20 }).default('pending'),
        syncCursor: text('sync_cursor'),
        betterAuthAccountId: varchar('better_auth_account_id', { length: 36 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_mail_accounts_user').on(table.userId), unique('uq_mail_accounts_user_email').on(table.userId, table.email)],
)

export const mailFolders = mysqlTable(
    'mail_folders',
    {
        id: int('id').autoincrement().primaryKey(),
        accountId: int('account_id')
            .notNull()
            .references(() => mailAccounts.id, { onDelete: 'cascade' }),
        remoteFolderId: varchar('remote_folder_id', { length: 255 }).notNull(),
        name: varchar('name', { length: 255 }).notNull(),
        type: varchar('type', { length: 20 }).default('custom').notNull(),
        parentId: int('parent_id'),
        messageCount: int('message_count').default(0).notNull(),
        unreadCount: int('unread_count').default(0).notNull(),
        uidValidity: int('uid_validity'),
        syncCursor: text('sync_cursor'),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('idx_mail_folders_account').on(table.accountId),
        unique('uq_mail_folders_account_remote').on(table.accountId, table.remoteFolderId),
    ],
)

export const mailMessages = mysqlTable(
    'mail_messages',
    {
        id: int('id').autoincrement().primaryKey(),
        accountId: int('account_id')
            .notNull()
            .references(() => mailAccounts.id, { onDelete: 'cascade' }),
        folderId: int('folder_id')
            .notNull()
            .references(() => mailFolders.id, { onDelete: 'cascade' }),
        remoteMessageId: varchar('remote_message_id', { length: 500 }).notNull(),
        messageIdHeader: varchar('message_id_header', { length: 500 }),
        threadId: varchar('thread_id', { length: 255 }),
        inReplyTo: varchar('in_reply_to', { length: 500 }),
        referencesHeader: text('references_header'),
        fromAddress: json('from_address').$type<{ name: string; address: string }>(),
        toAddresses: json('to_addresses').$type<{ name: string; address: string }[]>().default([]),
        ccAddresses: json('cc_addresses').$type<{ name: string; address: string }[]>().default([]),
        bccAddresses: json('bcc_addresses').$type<{ name: string; address: string }[]>().default([]),
        subject: text('subject'),
        bodyHtml: longtext('body_html'),
        bodyText: longtext('body_text'),
        snippet: varchar('snippet', { length: 500 }),
        isRead: boolean('is_read').default(false).notNull(),
        isStarred: boolean('is_starred').default(false).notNull(),
        isDraft: boolean('is_draft').default(false).notNull(),
        hasAttachments: boolean('has_attachments').default(false).notNull(),
        sentAt: timestamp('sent_at', { fsp: 3 }),
        receivedAt: timestamp('received_at', { fsp: 3 }),
        uid: int('uid'),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique('uq_mail_messages_account_remote').on(table.accountId, table.remoteMessageId),
        index('idx_mail_messages_folder').on(table.folderId),
        index('idx_mail_messages_sent_at').on(table.sentAt),
        index('idx_mail_messages_thread').on(table.threadId),
        index('idx_mail_messages_account_read').on(table.accountId, table.isRead),
        index('idx_mail_messages_account_starred_received').on(table.accountId, table.isStarred, table.receivedAt),
        index('idx_mail_messages_account_folder_received').on(table.accountId, table.folderId, table.receivedAt),
        index('idx_mail_messages_account_received').on(table.accountId, table.receivedAt),
    ],
)

export const mailAttachments = mysqlTable(
    'mail_attachments',
    {
        id: int('id').autoincrement().primaryKey(),
        messageId: int('message_id')
            .notNull()
            .references(() => mailMessages.id, { onDelete: 'cascade' }),
        remoteAttachmentId: varchar('remote_attachment_id', { length: 512 }),
        filename: varchar('filename', { length: 255 }),
        mimeType: varchar('mime_type', { length: 100 }),
        sizeBytes: int('size_bytes'),
        contentId: varchar('content_id', { length: 255 }),
        isInline: boolean('is_inline').default(false).notNull(),
        r2Key: varchar('r2_key', { length: 255 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [
        index('idx_mail_attachments_message').on(table.messageId),
        unique('uq_mail_attachments_msg_remote').on(table.messageId, table.remoteAttachmentId),
    ],
)

export const mailSyncLogs = mysqlTable(
    'mail_sync_logs',
    {
        id: int('id').autoincrement().primaryKey(),
        accountId: int('account_id')
            .notNull()
            .references(() => mailAccounts.id, { onDelete: 'cascade' }),
        syncType: varchar('sync_type', { length: 20 }).notNull(),
        status: varchar('status', { length: 20 }).notNull(),
        folderId: int('folder_id'),
        messagesAdded: int('messages_added').default(0),
        messagesUpdated: int('messages_updated').default(0),
        messagesDeleted: int('messages_deleted').default(0),
        durationMs: int('duration_ms'),
        errorMessage: text('error_message'),
        startedAt: timestamp('started_at', { fsp: 3 }),
        completedAt: timestamp('completed_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_mail_sync_logs_account').on(table.accountId)],
)

export const mailSyncSessions = mysqlTable(
    'mail_sync_sessions',
    {
        id: int('id').autoincrement().primaryKey(),
        accountId: int('account_id')
            .notNull()
            .references(() => mailAccounts.id, { onDelete: 'cascade' }),
        folderId: int('folder_id'),
        syncType: varchar('sync_type', { length: 20 }).notNull(),
        status: varchar('status', { length: 20 }).notNull(),
        totalEstimate: int('total_estimate'),
        syncedCount: int('synced_count').default(0),
        cursor: text('cursor'),
        startedAt: timestamp('started_at', { fsp: 3 }),
        lastBatchAt: timestamp('last_batch_at', { fsp: 3 }),
        completedAt: timestamp('completed_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_mail_sync_sessions_account_status').on(table.accountId, table.status)],
)

export const mailUploads = mysqlTable(
    'mail_uploads',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        filename: varchar('filename', { length: 255 }).notNull(),
        mimeType: varchar('mime_type', { length: 100 }).notNull(),
        sizeBytes: int('size_bytes').notNull(),
        r2Key: varchar('r2_key', { length: 255 }).notNull().unique(),
        isInline: boolean('is_inline').default(false).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_mail_uploads_user').on(table.userId)],
)

export const spotifyAccounts = mysqlTable(
    'spotify_accounts',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        spotifyUserId: varchar('spotify_user_id', { length: 255 }).notNull(),
        displayName: varchar('display_name', { length: 100 }),
        email: varchar('email', { length: 255 }),
        betterAuthAccountId: varchar('better_auth_account_id', { length: 36 }),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('idx_spotify_accounts_user').on(table.userId),
        unique('uq_spotify_accounts_user_spotify').on(table.userId, table.spotifyUserId),
    ],
)

export const spotifyApiKeys = mysqlTable(
    'spotify_api_keys',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        spotifyAccountId: int('spotify_account_id')
            .notNull()
            .references(() => spotifyAccounts.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 64 }).notNull().unique(),
        name: varchar('name', { length: 100 }),
        expiresAt: timestamp('expires_at', { fsp: 3 }),
        lastUsedAt: timestamp('last_used_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_spotify_api_keys_user').on(table.userId), index('idx_spotify_api_keys_account').on(table.spotifyAccountId)],
)

export const spotifyWidgetTokens = mysqlTable(
    'spotify_widget_tokens',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        spotifyAccountId: int('spotify_account_id')
            .notNull()
            .references(() => spotifyAccounts.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 64 }).notNull().unique(),
        name: varchar('name', { length: 100 }),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_spotify_widget_tokens_user').on(table.userId), index('idx_spotify_widget_tokens_account').on(table.spotifyAccountId)],
)

export const resumes = mysqlTable(
    'resumes',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        type: varchar('type', { length: 10 }).notNull(),
        title: varchar('title', { length: 255 }).notNull(),
        data: json('data').notNull(),
        isPublic: boolean('is_public').default(false).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_resumes_user').on(table.userId)],
)

export type Resume = typeof resumes.$inferSelect
export type NewResume = typeof resumes.$inferInsert

export type SpotifyAccount = typeof spotifyAccounts.$inferSelect
export type NewSpotifyAccount = typeof spotifyAccounts.$inferInsert
export type SpotifyApiKey = typeof spotifyApiKeys.$inferSelect
export type SpotifyWidgetToken = typeof spotifyWidgetTokens.$inferSelect

export type MailAccount = typeof mailAccounts.$inferSelect
export type NewMailAccount = typeof mailAccounts.$inferInsert
export type MailFolder = typeof mailFolders.$inferSelect
export type MailMessage = typeof mailMessages.$inferSelect
export type MailAttachment = typeof mailAttachments.$inferSelect
export type MailSyncLog = typeof mailSyncLogs.$inferSelect
export type MailSyncSession = typeof mailSyncSessions.$inferSelect
export type MailUpload = typeof mailUploads.$inferSelect

export const calendarGroup = mysqlTable(
    'calendar_group',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 255 }).notNull(),
        color: varchar('color', { length: 50 }).notNull(),
        sortOrder: int('sort_order').notNull().default(0),
        isVisible: boolean('is_visible').notNull().default(true),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_calendar_group_user').on(table.userId)],
)

export type RRuleType = {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval?: number
    count?: number
    until?: string
    byDay?: string[]
    byMonth?: number[]
    byMonthDay?: number[]
} | null

export const calendarEvent = mysqlTable(
    'calendar_event',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        uid: varchar('uid', { length: 255 }).notNull().unique(),
        summary: varchar('summary', { length: 500 }).notNull(),
        description: text('description'),
        location: varchar('location', { length: 500 }),
        dtstart: datetime('dtstart').notNull(),
        dtend: datetime('dtend').notNull(),
        isAllDay: boolean('is_all_day').notNull().default(false),
        rrule: json('rrule').$type<RRuleType>(),
        exdate: json('exdate').$type<string[]>(),
        status: mysqlEnum('status', ['TENTATIVE', 'CONFIRMED', 'CANCELLED']).default('CONFIRMED'),
        transp: mysqlEnum('transp', ['TRANSPARENT', 'OPAQUE']).default('OPAQUE'),
        priority: tinyint('priority'),
        categories: json('categories').$type<string[]>(),
        color: varchar('color', { length: 50 }),
        groupId: varchar('group_id', { length: 36 }).references(() => calendarGroup.id, { onDelete: 'set null' }),
        sequence: tinyint('sequence').notNull().default(0),
        dtstamp: datetime('dtstamp').notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('idx_calendar_event_user').on(table.userId),
        index('idx_calendar_event_user_dtstart').on(table.userId, table.dtstart),
        index('idx_calendar_event_uid').on(table.uid),
        index('idx_calendar_event_group').on(table.groupId),
    ],
)

export const deletedCalendarEvent = mysqlTable(
    'deleted_calendar_event',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        uid: varchar('uid', { length: 255 }).notNull(),
        deletedAt: timestamp('deleted_at', { fsp: 3 }).defaultNow().notNull(),
        syncToken: varchar('sync_token', { length: 64 }).notNull(),
    },
    (table) => [index('idx_deleted_event_user_sync').on(table.userId, table.syncToken)],
)

export const calendarSubscription = mysqlTable(
    'calendar_subscription',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        token: varchar('token', { length: 64 }).notNull().unique(),
        icsToken: varchar('ics_token', { length: 64 }).notNull().unique(),
        name: varchar('name', { length: 255 }),
        isActive: boolean('is_active').notNull().default(true),
        ctag: varchar('ctag', { length: 64 }).notNull().default('0'),
        lastAccessedAt: datetime('last_accessed_at'),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('idx_subscription_token').on(table.token),
        index('idx_subscription_ics_token').on(table.icsToken),
        index('idx_subscription_user').on(table.userId),
    ],
)

export type CalendarGroup = typeof calendarGroup.$inferSelect
export type NewCalendarGroup = typeof calendarGroup.$inferInsert
export type CalendarEvent = typeof calendarEvent.$inferSelect
export type NewCalendarEvent = typeof calendarEvent.$inferInsert
export type CalendarSubscription = typeof calendarSubscription.$inferSelect
export type NewCalendarSubscription = typeof calendarSubscription.$inferInsert
export type DeletedCalendarEvent = typeof deletedCalendarEvent.$inferSelect
export type User = typeof user.$inferSelect
export type ApiToken = typeof apiToken.$inferSelect
export type WeatherApiKey = typeof weatherApiKey.$inferSelect
export type Post = typeof posts.$inferSelect
export type Comment = typeof comments.$inferSelect

export const driveFolders = mysqlTable(
    'drive_folders',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        parentId: varchar('parent_id', { length: 36 }),
        name: varchar('name', { length: 255 }).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_drive_folders_user').on(table.userId), index('idx_drive_folders_user_parent').on(table.userId, table.parentId)],
)

export const cloudAssets = mysqlTable(
    'cloud_assets',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        s3Key: varchar('s3_key', { length: 500 }).notNull().unique(),
        originalName: varchar('original_name', { length: 255 }).notNull(),
        mimeType: varchar('mime_type', { length: 100 }).notNull(),
        sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
        fileHash: varchar('file_hash', { length: 64 }).notNull(),
        folderId: varchar('folder_id', { length: 36 }),
        thumbnailBlob: mediumblob('thumbnail_blob'),
        isPublic: boolean('is_public').default(false).notNull(),
        uploadStatus: varchar('upload_status', { length: 20 }).notNull().default('ready'),
        uploadToken: varchar('upload_token', { length: 64 }),
        localPath: varchar('local_path', { length: 1000 }),
        gdriveFileId: varchar('gdrive_file_id', { length: 100 }),
        storageTiers: varchar('storage_tiers', { length: 20 }).notNull().default('L1'),
        accessCount: int('access_count').notNull().default(0),
        lastViewedAt: timestamp('last_viewed_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('idx_cloud_assets_user').on(table.userId),
        unique('uq_cloud_assets_user_hash').on(table.userId, table.fileHash),
        index('idx_cloud_assets_user_created').on(table.userId, table.createdAt),
        index('idx_cloud_assets_folder').on(table.folderId),
        index('idx_cloud_assets_storage_tiers').on(table.storageTiers),
        index('idx_cloud_assets_access_count').on(table.accessCount),
    ],
)

export const storageLifecycleLogs = mysqlTable(
    'storage_lifecycle_logs',
    {
        id: int('id').autoincrement().primaryKey(),
        assetId: int('asset_id')
            .notNull()
            .references(() => cloudAssets.id, { onDelete: 'cascade' }),
        action: varchar('action', { length: 20 }).notNull(),
        fromTier: varchar('from_tier', { length: 5 }).notNull(),
        toTier: varchar('to_tier', { length: 5 }).notNull(),
        reason: varchar('reason', { length: 255 }).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_storage_lifecycle_logs_asset').on(table.assetId)],
)

export type DriveFolder = typeof driveFolders.$inferSelect
export type NewDriveFolder = typeof driveFolders.$inferInsert
export type CloudAsset = typeof cloudAssets.$inferSelect
export type NewCloudAsset = typeof cloudAssets.$inferInsert
export type StorageLifecycleLog = typeof storageLifecycleLogs.$inferSelect
export type NewStorageLifecycleLog = typeof storageLifecycleLogs.$inferInsert

export const logEvents = mysqlTable(
    'log_events',
    {
        id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
        service: varchar('service', { length: 64 }).notNull(),
        errorCode: varchar('error_code', { length: 64 }).notNull(),
        errorDescription: text('error_description'),
        severity: smallint('severity').default(20).notNull(),
        category: varchar('category', { length: 64 }),
        deviceId: varchar('device_id', { length: 64 }),
        firmwareVersion: varchar('firmware_version', { length: 32 }),
        source: varchar('source', { length: 32 }),
        correlationId: varchar('correlation_id', { length: 36 }),
        sessionId: varchar('session_id', { length: 36 }),
        retryCount: smallint('retry_count'),
        occurredAt: datetime('occurred_at', { fsp: 3 }),
        resolvedAt: datetime('resolved_at', { fsp: 3 }),
        details: json('details').$type<Record<string, unknown>>(),
        ingestIp: varchar('ingest_ip', { length: 45 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [
        index('idx_log_events_service_created').on(table.service, table.createdAt),
        index('idx_log_events_device_created').on(table.deviceId, table.createdAt),
        index('idx_log_events_code_resolved').on(table.errorCode, table.resolvedAt),
        index('idx_log_events_severity_created').on(table.severity, table.createdAt),
    ],
)

export const deviceKey = mysqlTable(
    'device_key',
    {
        id: int('id').autoincrement().primaryKey(),
        token: varchar('token', { length: 64 }).notNull().unique(),
        deviceId: varchar('device_id', { length: 64 }),
        label: varchar('label', { length: 100 }),
        dailyLimit: int('daily_limit').default(2000).notNull(),
        lastUsedAt: timestamp('last_used_at', { fsp: 3 }),
        revokedAt: timestamp('revoked_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_device_key_device').on(table.deviceId)],
)

export type LogEvent = typeof logEvents.$inferSelect
export type NewLogEvent = typeof logEvents.$inferInsert
export type DeviceKey = typeof deviceKey.$inferSelect
export type NewDeviceKey = typeof deviceKey.$inferInsert

export const aiProviders = mysqlTable(
    'ai_providers',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        provider: varchar('provider', { length: 20 }).notNull(),
        authType: varchar('auth_type', { length: 10 }).notNull(),
        credentials: text('credentials').notNull(),
        status: varchar('status', { length: 20 }).default('active').notNull(),
        statusDetail: varchar('status_detail', { length: 255 }),
        displayName: varchar('display_name', { length: 100 }),
        lastUsedAt: timestamp('last_used_at', { fsp: 3 }),
        lastRefreshedAt: timestamp('last_refreshed_at', { fsp: 3 }),
        modelsFetchedAt: timestamp('models_fetched_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_ai_providers_user').on(table.userId), unique('uq_ai_providers_user_provider').on(table.userId, table.provider)],
)

export const aiModels = mysqlTable(
    'ai_models',
    {
        id: int('id').autoincrement().primaryKey(),
        providerId: int('provider_id')
            .notNull()
            .references(() => aiProviders.id, { onDelete: 'cascade' }),
        modelId: varchar('model_id', { length: 100 }).notNull(),
        displayName: varchar('display_name', { length: 255 }),
        metadata: json('metadata').$type<Record<string, unknown>>(),
        fetchedAt: timestamp('fetched_at', { fsp: 3 }).defaultNow().notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_ai_models_provider').on(table.providerId), unique('uq_ai_models_provider_model').on(table.providerId, table.modelId)],
)

export const aiPrompts = mysqlTable(
    'ai_prompts',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        name: varchar('name', { length: 100 }).notNull(),
        description: varchar('description', { length: 255 }),
        stage: varchar('stage', { length: 20 }).default('system').notNull(),
        content: text('content').notNull(),
        featureKey: varchar('feature_key', { length: 50 }),
        sortOrder: int('sort_order').default(0).notNull(),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_ai_prompts_user').on(table.userId), index('idx_ai_prompts_user_feature').on(table.userId, table.featureKey)],
)

export const aiSessions = mysqlTable(
    'ai_sessions',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        providerId: int('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
        provider: varchar('provider', { length: 20 }).notNull(),
        modelId: varchar('model_id', { length: 100 }).notNull(),
        title: varchar('title', { length: 255 }),
        featureKey: varchar('feature_key', { length: 50 }),
        promptIds: json('prompt_ids').$type<number[]>(),
        lastMessageAt: timestamp('last_message_at', { fsp: 3 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { fsp: 3 })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('idx_ai_sessions_user').on(table.userId), index('idx_ai_sessions_user_last').on(table.userId, table.lastMessageAt)],
)

export const aiMessages = mysqlTable(
    'ai_messages',
    {
        id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
        sessionId: varchar('session_id', { length: 36 })
            .notNull()
            .references(() => aiSessions.id, { onDelete: 'cascade' }),
        role: varchar('role', { length: 20 }).notNull(),
        content: longtext('content').notNull(),
        modelId: varchar('model_id', { length: 100 }),
        inputTokens: int('input_tokens'),
        outputTokens: int('output_tokens'),
        durationMs: int('duration_ms'),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_ai_messages_session_created').on(table.sessionId, table.createdAt)],
)

export const aiAttachments = mysqlTable(
    'ai_attachments',
    {
        id: int('id').autoincrement().primaryKey(),
        userId: varchar('user_id', { length: 36 })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        messageId: bigint('message_id', { mode: 'number' }),
        filename: varchar('filename', { length: 255 }).notNull(),
        mimeType: varchar('mime_type', { length: 100 }).notNull(),
        sizeBytes: int('size_bytes').notNull(),
        r2Key: varchar('r2_key', { length: 255 }).notNull().unique(),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_ai_attachments_user').on(table.userId), index('idx_ai_attachments_message').on(table.messageId)],
)

export type AiProvider = typeof aiProviders.$inferSelect
export type NewAiProvider = typeof aiProviders.$inferInsert
export type AiModel = typeof aiModels.$inferSelect
export type NewAiModel = typeof aiModels.$inferInsert
export type AiPrompt = typeof aiPrompts.$inferSelect
export type NewAiPrompt = typeof aiPrompts.$inferInsert
export type AiSession = typeof aiSessions.$inferSelect
export type NewAiSession = typeof aiSessions.$inferInsert
export type AiMessage = typeof aiMessages.$inferSelect
export type NewAiMessage = typeof aiMessages.$inferInsert
export type AiAttachment = typeof aiAttachments.$inferSelect
export type NewAiAttachment = typeof aiAttachments.$inferInsert
