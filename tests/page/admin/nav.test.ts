import { describe, expect, test } from 'bun:test'
import { NAV, isActivePath } from '../../../page/admin/nav'

describe('NAV', () => {
    test('Overview 그룹에 Dashboard가 첫 번째다', () => {
        const overview = NAV.find((g) => g.title === 'Overview')
        expect(overview).toBeDefined()
        expect(overview?.items[0]?.href).toBe('/admin')
    })

    test('모든 navigation href가 /admin으로 시작한다', () => {
        for (const group of NAV) {
            for (const item of group.items) {
                expect(item.href.startsWith('/admin')).toBe(true)
            }
        }
    })

    test('모든 도메인 그룹이 포함된다', () => {
        const titles = NAV.map((g) => g.title)
        for (const t of ['Identity', 'Blog', 'Social', 'Weather', 'Mail', 'Spotify', 'Other']) {
            expect(titles).toContain(t)
        }
    })
})

describe('isActivePath', () => {
    test('Dashboard는 정확히 /admin일 때만 active', () => {
        expect(isActivePath('/admin', '/admin')).toBe(true)
        expect(isActivePath('/admin/users', '/admin')).toBe(false)
    })

    test('하위 경로는 active로 매칭된다', () => {
        expect(isActivePath('/admin/users', '/admin/users')).toBe(true)
        expect(isActivePath('/admin/users/abc', '/admin/users')).toBe(true)
        expect(isActivePath('/admin/blog/posts', '/admin/blog/posts')).toBe(true)
    })

    test('다른 경로는 active가 아니다', () => {
        expect(isActivePath('/admin/blog/posts', '/admin/users')).toBe(false)
        expect(isActivePath('/admin/users-extra', '/admin/users')).toBe(false)
    })
})
