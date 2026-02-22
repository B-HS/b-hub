import type { ErrorCode } from './error-code'

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
    VALIDATION_ERROR: '요청 데이터가 유효하지 않습니다',
    NOT_FOUND: '요청한 리소스를 찾을 수 없습니다',
    UNAUTHORIZED: '인증이 필요합니다',
    FORBIDDEN: '접근 권한이 없습니다',
    RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다',
    INTERNAL_ERROR: '서버 내부 오류가 발생했습니다',
    EXTERNAL_API_ERROR: '외부 API 호출에 실패했습니다',

    STORAGE_UPLOAD_FAILED: '파일 업로드에 실패했습니다',
    STORAGE_DELETE_FAILED: '파일 삭제에 실패했습니다',
    IMAGE_PROCESS_FAILED: '이미지 처리에 실패했습니다',
    IMAGE_GENERATE_FAILED: '이미지 생성에 실패했습니다',
    FONT_NOT_FOUND: '요청한 폰트를 찾을 수 없습니다',
    ICON_LOAD_FAILED: '아이콘 로드에 실패했습니다',
    NOTIFICATION_SEND_FAILED: '알림 전송에 실패했습니다',
    AI_SUMMARIZE_FAILED: 'AI 요약 생성에 실패했습니다',
    API_TOKEN_INVALID: 'API 토큰이 유효하지 않습니다',

    BADGE_INVALID_DIMENSIONS: '뱃지 크기가 유효하지 않습니다',
    BADGE_INVALID_COLOR: '뱃지 색상이 유효하지 않습니다',

    BLOG_POST_NOT_FOUND: '게시글을 찾을 수 없습니다',
    BLOG_COMMENT_NOT_FOUND: '댓글을 찾을 수 없습니다',
    BLOG_CATEGORY_NOT_FOUND: '카테고리를 찾을 수 없습니다',
    BLOG_NOT_COMMENT_OWNER: '댓글 작성자만 수정/삭제할 수 있습니다',
    BLOG_IMAGE_TOO_LARGE: '이미지 크기가 제한을 초과했습니다',
    BLOG_IMAGE_INVALID_TYPE: '허용되지 않는 이미지 형식입니다',

    WEATHER_KMA_API_ERROR: '기상청 API 호출에 실패했습니다',
    WEATHER_INVALID_GRID: '유효하지 않은 격자 좌표입니다',
    WEATHER_DATA_NOT_FOUND: '기상 데이터를 찾을 수 없습니다',
    WEATHER_KEY_INVALID: '날씨 API 키가 유효하지 않습니다',
    WEATHER_KEY_RATE_LIMIT: '날씨 API 일일 요청 한도를 초과했습니다',

    HN_STORY_NOT_FOUND: 'HN 스토리를 찾을 수 없습니다',
    HN_FETCH_FAILED: 'HN 데이터 수집에 실패했습니다',
    HN_CRON_SECRET_INVALID: 'Cron 시크릿이 유효하지 않습니다',
    HN_WEBHOOK_REGISTER_FAILED: '웹훅 등록에 실패했습니다',
}
