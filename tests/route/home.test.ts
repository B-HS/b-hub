import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { homeRoute } from '../../route/home'

const createApp = () => {
  const app = new Hono()
  app.route('', homeRoute)
  return app
}

describe('GET /', () => {
  test('200 상태와 HTML을 반환한다', async () => {
    const app = createApp()
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
  })

  test('favicon 이미지가 포함된다', async () => {
    const app = createApp()
    const res = await app.request('/')
    const html = await res.text()
    expect(html).toContain('/favicon.ico')
  })

  test('개인정보처리방침 링크가 포함된다', async () => {
    const app = createApp()
    const res = await app.request('/')
    const html = await res.text()
    expect(html).toContain('href="/policy"')
  })
})
