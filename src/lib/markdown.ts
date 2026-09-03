import { marked } from 'marked'

/*
 * Разбор markdown для показа через dangerouslySetInnerHTML.
 *
 * `marked` по умолчанию пропускает сырой HTML насквозь. Заметка или описание
 * задачи с `<img src=x onerror=...>` выполнили бы скрипт в контексте приложения,
 * а там в localStorage лежит токен сессии Supabase. Текст пишет сам владелец,
 * но он же его копирует откуда попало и синхронизирует между устройствами,
 * поэтому доверять содержимому нельзя.
 *
 * Сырой HTML экранируется и показывается как текст, ссылки пропускаются только
 * с безопасной схемой. Отдельная библиотека-санитайзер для этого не нужна.
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
      // Битую или опасную ссылку показываем исходным текстом, а не пустой рамкой.
      if (!src) return escapeHtml(token.raw)
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(token.text ?? ''))}" loading="lazy">`
    },
  },
})

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string
}
