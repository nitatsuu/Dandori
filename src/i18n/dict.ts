import type { Lang } from '../state/ui'

/*
 * Every string the interface shows, both languages side by side.
 *
 * One table, not two files: two files drift, and the first thing to go missing
 * is the translation nobody reads. Here a key with one language missing does
 * not compile.
 *
 * `{n}` and `{name}` are filled in by `translate`. Russian keeps its guillemets
 * and English its curly quotes — the punctuation is part of the language.
 */

export type Text = Record<Lang, string>

/**
 * The forms `Intl.PluralRules` picks between. Russian uses three of them and
 * English two, so every form but `other` is optional — `other` is the one CLDR
 * guarantees every language has, and it is what a missing form falls back to.
 */
export type Forms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>
export type Plural = Record<Lang, Forms>

export const TEXT = {
  // -------------------------------------------------------------- common

  'common.untitled': { ru: 'Без названия', en: 'Untitled' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.done': { ru: 'Готово', en: 'Done' },
  'common.add': { ru: 'Добавить', en: 'Add' },
  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.create': { ru: 'Создать', en: 'Create' },
  'common.delete': { ru: 'Удалить', en: 'Delete' },

  // Everything a markdown box says: the same words on the task card and in the
  // notes editor. «Markdown» is spelled the same in both languages and is
  // written here twice all the same — a word hardcoded in a component is a word
  // nobody finds when it has to change.
  'md.edit': { ru: 'Править', en: 'Edit' },
  'md.preview': { ru: 'Просмотр', en: 'Preview' },
  'md.placeholder': { ru: 'Markdown', en: 'Markdown' },

  // ---------------------------------------------------------------- tabs

  'tab.board': { ru: 'Доска', en: 'Board' },
  'tab.timeline': { ru: 'Таймлайн', en: 'Timeline' },
  'tab.notes': { ru: 'Заметки', en: 'Notes' },

  // -------------------------------------------------------------- header

  'header.newWorkspace': { ru: 'Новый воркспейс', en: 'New workspace' },
  'header.workspaceName': { ru: 'Название воркспейса', en: 'Workspace name' },

  // ---------------------------------------------------------------- sync

  'sync.syncing': { ru: 'Синхронизация…', en: 'Syncing…' },
  'sync.offline': {
    ru: 'Офлайн, изменения сохранятся локально',
    en: 'Offline, changes are kept on this device',
  },
  'sync.error': { ru: 'Не удалось синхронизироваться', en: 'Could not sync' },

  // ------------------------------------------------------------- sign in

  // The address is called «Email» in Russian as well — one name for it wherever
  // it is asked for and wherever it is refused.
  'signin.email': { ru: 'Email', en: 'Email' },
  'signin.password': { ru: 'Пароль', en: 'Password' },
  'signin.submit': { ru: 'Войти', en: 'Sign in' },
  'signin.busy': { ru: 'Вход…', en: 'Signing in…' },
  'signin.failed': { ru: 'Не удалось войти', en: 'Could not sign in' },
  'signin.wrong': { ru: 'Неверный email или пароль', en: 'Wrong email or password' },
  'signin.unreachable': { ru: 'Нет связи с сервером', en: 'No connection to the server' },

  // ----------------------------------------------------------- reminders

  'reminder.today': { ru: 'сегодня', en: 'today' },
  'reminder.dismiss': {
    ru: 'Скрыть до следующего входа',
    en: 'Hide until the app is opened again',
  },

  // --------------------------------------------------------------- board

  'board.mode.days': { ru: '14 дней', en: '14 days' },
  'board.mode.ribbon': { ru: 'Лента', en: 'Feed' },
  'board.mode.month': { ru: 'Месяц', en: 'Month' },

  'board.today': { ru: 'Сегодня', en: 'Today' },
  'board.tomorrow': { ru: 'Завтра', en: 'Tomorrow' },
  'board.yesterday': { ru: 'Вчера', en: 'Yesterday' },
  'board.noDate': { ru: 'Без даты', en: 'No date' },
  'board.newTask': { ru: 'Новая задача', en: 'New task' },
  'board.taskPlaceholder': { ru: 'Задача', en: 'Task' },
  'board.prevMonth': { ru: 'Предыдущий месяц', en: 'Previous month' },
  'board.nextMonth': { ru: 'Следующий месяц', en: 'Next month' },

  // ------------------------------------------------------------ timeline

  'timeline.zoom.all': { ru: 'Всё', en: 'All' },
  'timeline.zoom.month': { ru: 'Месяц', en: 'Month' },

  // ----------------------------------------------------------- task card

  'task.title': { ru: 'Название', en: 'Title' },
  'task.start': { ru: 'Начало', en: 'Start' },
  'task.due': { ru: 'Дедлайн', en: 'Deadline' },
  // The hours a task runs. One label over the pair, and a name apiece for the
  // two fields under it — read on their own by a screen reader, where «Начало»
  // alone would be the start date's word a second time.
  'task.time': { ru: 'Время', en: 'Time' },
  'task.timeStart': { ru: 'Время начала', en: 'Start time' },
  'task.timeEnd': { ru: 'Время окончания', en: 'End time' },
  'task.remind': { ru: 'Напомнить', en: 'Remind' },
  'task.remindNever': { ru: 'Не напоминать', en: 'No reminder' },
  'task.mute': { ru: 'Не показывать в напоминаниях', en: 'Keep out of reminders' },
  'task.description': { ru: 'Описание', en: 'Description' },
  'task.delete': { ru: 'Удалить задачу', en: 'Delete task' },
  'task.confirmDelete': { ru: 'Удалить задачу «{name}»?', en: 'Delete the task “{name}”?' },

  'task.note': { ru: 'Заметка', en: 'Note' },
  'task.noteUnlink': { ru: 'Отвязать', en: 'Unlink' },
  'task.noteOpen': { ru: 'Открыть', en: 'Open' },
  'task.notePick': { ru: 'Выбрать заметку', en: 'Choose a note' },
  'task.noteAttach': { ru: 'Привязать заметку', en: 'Attach a note' },

  'task.fields': { ru: 'Поля', en: 'Fields' },
  'task.fieldName': { ru: 'Имя поля', en: 'Field name' },
  'task.fieldValue': { ru: 'Значение', en: 'Value' },
  'task.fieldDelete': { ru: 'Удалить поле', en: 'Delete field' },

  // -------------------------------------------------------------- labels

  'label.plural': { ru: 'Метки', en: 'Labels' },
  'label.manage': { ru: 'Правка', en: 'Edit' },
  'label.new': { ru: 'Новая', en: 'New' },
  'label.name': { ru: 'Название метки', en: 'Label name' },
  'label.delete': { ru: 'Удалить метку', en: 'Delete label' },
  'label.confirmDelete': {
    ru: 'Удалить метку «{name}»? Она снимется со всех задач.',
    en: 'Delete the label “{name}”? It comes off every task.',
  },

  // --------------------------------------------------------------- notes

  'notes.newFile': { ru: 'Новая заметка', en: 'New note' },
  'notes.newFolder': { ru: 'Новая папка', en: 'New folder' },
  'notes.actions': { ru: 'Действия', en: 'Actions' },
  'notes.rename': { ru: 'Переименовать', en: 'Rename' },
  'notes.confirmDeleteFolder': {
    ru: 'Удалить папку «{name}» со всем содержимым?',
    en: 'Delete the folder “{name}” and everything in it?',
  },
  'notes.confirmDeleteFile': {
    ru: 'Удалить заметку «{name}»?',
    en: 'Delete the note “{name}”?',
  },
  'notes.back': { ru: 'К дереву', en: 'Back to the tree' },
  'notes.name': { ru: 'Название', en: 'Title' },

  // ------------------------------------------------------------ settings

  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.theme': { ru: 'Тема', en: 'Theme' },
  'settings.language': { ru: 'Язык', en: 'Language' },
  'settings.workspace': { ru: 'Воркспейс', en: 'Workspace' },
  'settings.account': { ru: 'Аккаунт', en: 'Account' },

  'settings.themeSystem': { ru: 'Как в системе', en: 'Match the system' },
  'settings.themeLight': { ru: 'Светлая', en: 'Light' },
  'settings.themeDark': { ru: 'Тёмная', en: 'Dark' },

  'settings.rename': { ru: 'Переименовать воркспейс', en: 'Rename workspace' },
  'settings.remove': { ru: 'Удалить воркспейс', en: 'Delete workspace' },
  // Asked at sign-out, which wipes this device: those edits exist nowhere else.
  'settings.confirmSignOut': {
    ru: 'Не все изменения ушли на сервер. Выйти и потерять их?',
    en: 'Some edits never reached the server. Sign out and lose them?',
  },
  'settings.confirmRemove': {
    ru: 'Удалить воркспейс «{name}»? Вместе с ним удалятся его задачи, метки и заметки.',
    en: 'Delete the workspace “{name}”? Its tasks, labels and notes go with it.',
  },

  'settings.export': { ru: 'Экспорт в JSON', en: 'Export to JSON' },
  'settings.signOut': { ru: 'Выйти', en: 'Sign out' },

  // ----------------------------------------------------- google calendar

  // «Calendar» stays English in the Russian column: it is the service's name.
  'gcal.section': { ru: 'Google Календарь', en: 'Google Calendar' },
  'gcal.sync': {
    ru: 'Синхронизировать с Google Calendar',
    en: 'Sync with Google Calendar',
  },
  'gcal.edit': { ru: 'Править', en: 'Edit' },

  'gcal.event': { ru: 'Событие в календаре', en: 'Calendar event' },
  'gcal.time': { ru: 'Время', en: 'Time' },
  'gcal.calendar': { ru: 'Календарь', en: 'Calendar' },
  'gcal.calendarPrimary': { ru: 'Основной', en: 'Primary' },
  'gcal.color': { ru: 'Цвет', en: 'Colour' },
  'gcal.colorDefault': { ru: 'Как у календаря', en: 'Whatever the calendar uses' },
  'gcal.reminders': { ru: 'Напоминания', en: 'Reminders' },
  'gcal.addReminder': { ru: 'Добавить напоминание', en: 'Add a reminder' },
  'gcal.removeReminder': { ru: 'Убрать напоминание', en: 'Remove the reminder' },
  'gcal.popup': { ru: 'Уведомление', en: 'Notification' },
  'gcal.email': { ru: 'Письмо', en: 'E-mail' },
  'gcal.atTime': { ru: 'В момент события', en: 'When it starts' },

  'gcal.unconfigured': {
    ru: 'В этой сборке нет ключа Google — календарь недоступен',
    en: 'This build carries no Google key, so the calendar is out of reach',
  },
  'gcal.signedOut': { ru: 'Аккаунт Google не подключён', en: 'No Google account is connected' },
  'gcal.connect': { ru: 'Подключить Google', en: 'Connect Google' },
  'gcal.connecting': { ru: 'Подключение…', en: 'Connecting…' },
  'gcal.needsConsent': {
    ru: 'Google больше не продлевает доступ — его нужно выдать заново',
    en: 'Google has stopped renewing access; it has to be granted again',
  },
  'gcal.reconnect': { ru: 'Выдать доступ', en: 'Grant access' },
  'gcal.ready': { ru: 'Аккаунт Google подключён', en: 'The Google account is connected' },
  'gcal.disconnect': { ru: 'Отключить', en: 'Disconnect' },

  'gcal.defaults': { ru: 'Настройки воркспейса «{name}»', en: 'Defaults for “{name}”' },
  'gcal.workspaceSync': { ru: 'Синхронизировать воркспейс', en: 'Sync the whole workspace' },

  /* Google's own names for its palette, as its own interface gives them. */
  'gcal.color.1': { ru: 'Лаванда', en: 'Lavender' },
  'gcal.color.2': { ru: 'Шалфей', en: 'Sage' },
  'gcal.color.3': { ru: 'Виноград', en: 'Grape' },
  'gcal.color.4': { ru: 'Фламинго', en: 'Flamingo' },
  'gcal.color.5': { ru: 'Банан', en: 'Banana' },
  'gcal.color.6': { ru: 'Мандарин', en: 'Tangerine' },
  'gcal.color.7': { ru: 'Павлин', en: 'Peacock' },
  'gcal.color.8': { ru: 'Графит', en: 'Graphite' },
  'gcal.color.9': { ru: 'Черника', en: 'Blueberry' },
  'gcal.color.10': { ru: 'Базилик', en: 'Basil' },
  'gcal.color.11': { ru: 'Помидор', en: 'Tomato' },
} as const satisfies Record<string, Text>

export type TextKey = keyof typeof TEXT

/*
 * Counted phrases, whole. Not a number glued to a noun: «просрочено на 3 дня»
 * puts the count in the middle and "3 days overdue" puts it at the front, so
 * the word order belongs to the entry and not to the code.
 */
export const PLURALS = {
  'reminder.overdue': {
    ru: {
      one: 'просрочено на {n} день',
      few: 'просрочено на {n} дня',
      many: 'просрочено на {n} дней',
      other: 'просрочено на {n} дней',
    },
    en: { one: '{n} day overdue', other: '{n} days overdue' },
  },
  'reminder.soon': {
    ru: {
      one: 'через {n} день',
      few: 'через {n} дня',
      many: 'через {n} дней',
      other: 'через {n} дней',
    },
    en: { one: 'in {n} day', other: 'in {n} days' },
  },
  'task.remindBefore': {
    ru: {
      one: 'За {n} день',
      few: 'За {n} дня',
      many: 'За {n} дней',
      other: 'За {n} дней',
    },
    en: { one: '{n} day before', other: '{n} days before' },
  },
  'gcal.beforeMinutes': {
    ru: {
      one: 'За {n} минуту',
      few: 'За {n} минуты',
      many: 'За {n} минут',
      other: 'За {n} минут',
    },
    en: { one: '{n} minute before', other: '{n} minutes before' },
  },
  'gcal.beforeHours': {
    ru: {
      one: 'За {n} час',
      few: 'За {n} часа',
      many: 'За {n} часов',
      other: 'За {n} часов',
    },
    en: { one: '{n} hour before', other: '{n} hours before' },
  },
} as const satisfies Record<string, Plural>

export type PluralKey = keyof typeof PLURALS
