import { marked } from 'marked'

/*
 * Markdown parsing for rendering through dangerouslySetInnerHTML.
 *
 * By default `marked` lets raw HTML through untouched. A note or a task
 * description containing `<img src=x onerror=...>` would run a script in the
 * app's context, and that is where the Supabase session token sits in
 * localStorage. The owner writes the text himself, but he also pastes it in
 * from anywhere and syncs it between devices, so the content cannot be trusted.
 *
 * Raw HTML is escaped and shown as text, and links pass only with a safe scheme.
 * A separate sanitizer library is not needed for this.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SAFE_URL = /^(https?:|mailto:|#|\/|\.)/i

function safeUrl(href: string): string | null {
  return SAFE_URL.test(href.trim()) ? href.trim() : null
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    html(token) {
      return escapeHtml(typeof token === 'string' ? token : token.text)
    },

    link(token) {
      const href = safeUrl(String(token.href ?? ''))
      const text = this.parser.parseInline(token.tokens)
      if (!href) return text
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },

    image(token) {
      const src = safeUrl(String(token.href ?? ''))
      // Show a broken or unsafe link as its source text, not as an empty frame.
      if (!src) return escapeHtml(token.raw)
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(token.text ?? ''))}" loading="lazy">`
    },
  },
})

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string
}
