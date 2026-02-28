import { mysqlTable, int, varchar, text, longtext, boolean, datetime, timestamp, bigint, json, index, unique } from 'drizzle-orm/mysql-core'

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
    (table) => [
        index('idx_weather_api_log_user').on(table.userId),
        index('idx_weather_api_log_key_created').on(table.keyId, table.createdAt),
    ],
)

export const hnStories = mysqlTable(
    'hn_stories',
    {
        id: bigint('id', { mode: 'number' }).primaryKey(),
        type: varchar('type', { length: 20 }).notNull(),
        hnType: varchar('hn_type', { length: 20 }).notNull(),
        by: varchar('by', { length: 100 }),
        title: text('title'),
        titleKo: text('title_ko'),
        url: text('url'),
        storyText: text('story_text'),
        storyTextKo: text('story_text_ko'),
        contentSummary: text('content_summary'),
        contentSummaryKo: text('content_summary_ko'),
        tags: json('tags').$type<string[]>().default([]),
        contentParsed: boolean('content_parsed').default(false),
        parseError: text('parse_error'),
        score: int('score').default(0),
        descendants: int('descendants').default(0),
        time: bigint('time', { mode: 'number' }),
        dead: boolean('dead').default(false),
        deleted: boolean('deleted').default(false),
        lastSyncedAt: timestamp('last_synced_at').defaultNow(),
        needsResummarize: boolean('needs_resummarize').default(true),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
    },
    (table) => [
        index('idx_hn_stories_type').on(table.type),
        index('idx_hn_stories_time').on(table.time),
        index('idx_hn_stories_needs_resummarize').on(table.needsResummarize),
    ],
)

export const hnComments = mysqlTable(
    'hn_comments',
    {
        id: bigint('id', { mode: 'number' }).primaryKey(),
        storyId: bigint('story_id', { mode: 'number' }).notNull(),
        parentId: bigint('parent_id', { mode: 'number' }),
        by: varchar('by', { length: 100 }),
        commentText: text('comment_text'),
        time: bigint('time', { mode: 'number' }),
        depth: int('depth').notNull().default(0),
        dead: boolean('dead').default(false),
        deleted: boolean('deleted').default(false),
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => [index('idx_hn_comments_story_id').on(table.storyId), index('idx_hn_comments_parent_id').on(table.parentId)],
)

export const hnSummaries = mysqlTable(
    'hn_summaries',
    {
        id: int('id').primaryKey().autoincrement(),
        storyId: bigint('story_id', { mode: 'number' }).notNull().unique(),
        summary: text('summary').notNull(),
        tags: json('tags').$type<string[]>().default([]),
        summaryType: varchar('summary_type', { length: 20 }).notNull().default('daily'),
        model: varchar('model', { length: 50 }).default('gemini-2.5-flash-lite'),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
    },
    (table) => [index('idx_hn_summaries_story_id').on(table.storyId), index('idx_hn_summaries_type').on(table.summaryType)],
)

export const hnTags = mysqlTable('hn_tags', {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    category: varchar('category', { length: 50 }),
    usageCount: int('usage_count').default(0),
    createdAt: timestamp('created_at').defaultNow(),
})

export const hnDigests = mysqlTable(
    'hn_digests',
    {
        id: int('id').primaryKey().autoincrement(),
        digestType: varchar('digest_type', { length: 20 }).notNull(),
        digestKey: varchar('digest_key', { length: 20 }).notNull(),
        title: varchar('title', { length: 200 }).notNull(),
        content: text('content').notNull(),
        storyIds: json('story_ids').$type<number[]>().default([]),
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => [index('idx_hn_digests_type_key').on(table.digestType, table.digestKey)],
)

export const hnWebhooks = mysqlTable(
    'hn_webhooks',
    {
        id: int('id').primaryKey().autoincrement(),
        provider: varchar('provider', { length: 20 }).notNull().default('discord'),
        url: text('url').notNull(),
        name: varchar('name', { length: 100 }),
        isActive: boolean('is_active').default(true),
        digestTypes: json('digest_types').$type<string[]>().default(['daily', 'weekly', 'monthly']),
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
    },
    (table) => [index('idx_hn_webhooks_provider').on(table.provider), index('idx_hn_webhooks_active').on(table.isActive)],
)

export const hnWebhookLogs = mysqlTable(
    'hn_webhook_logs',
    {
        id: int('id').primaryKey().autoincrement(),
        webhookId: int('webhook_id'),
        provider: varchar('provider', { length: 20 }).notNull(),
        digestType: varchar('digest_type', { length: 20 }),
        status: varchar('status', { length: 20 }).notNull(),
        payload: json('payload'),
        response: text('response'),
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => [index('idx_hn_webhook_logs_webhook_id').on(table.webhookId)],
)

export type User = typeof user.$inferSelect
export type ApiToken = typeof apiToken.$inferSelect
export type WeatherApiKey = typeof weatherApiKey.$inferSelect
export type Post = typeof posts.$inferSelect
export type Comment = typeof comments.$inferSelect
export type HnStory = typeof hnStories.$inferSelect
export type NewHnStory = typeof hnStories.$inferInsert
export type HnComment = typeof hnComments.$inferSelect
export type NewHnComment = typeof hnComments.$inferInsert
export type HnSummary = typeof hnSummaries.$inferSelect
export type HnDigest = typeof hnDigests.$inferSelect
export type HnWebhook = typeof hnWebhooks.$inferSelect

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
    (table) => [
        index('idx_mail_accounts_user').on(table.userId),
        unique('uq_mail_accounts_user_email').on(table.userId, table.email),
    ],
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
        remoteAttachmentId: text('remote_attachment_id'),
        filename: varchar('filename', { length: 255 }),
        mimeType: varchar('mime_type', { length: 100 }),
        sizeBytes: int('size_bytes'),
        contentId: varchar('content_id', { length: 255 }),
        isInline: boolean('is_inline').default(false).notNull(),
        r2Key: varchar('r2_key', { length: 255 }),
        createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
    },
    (table) => [index('idx_mail_attachments_message').on(table.messageId)],
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
    (table) => [
        index('idx_mail_sync_sessions_account_status').on(table.accountId, table.status),
    ],
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

export type MailAccount = typeof mailAccounts.$inferSelect
export type NewMailAccount = typeof mailAccounts.$inferInsert
export type MailFolder = typeof mailFolders.$inferSelect
export type MailMessage = typeof mailMessages.$inferSelect
export type MailAttachment = typeof mailAttachments.$inferSelect
export type MailSyncLog = typeof mailSyncLogs.$inferSelect
export type MailSyncSession = typeof mailSyncSessions.$inferSelect
export type MailUpload = typeof mailUploads.$inferSelect
