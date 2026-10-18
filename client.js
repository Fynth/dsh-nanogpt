/**
 * Browser half of the NanoGPT bundle.
 *
 * One DSH Client plugin registers the Settings → NanoGPT console and a small
 * quick-configuration card on the native Models page. All provider I/O happens
 * on the Host; this file only calls the authenticated `/nanogpt` channel and
 * never stores or displays an API key.
 */
window.__ModuleLoader__.load({
  id: 'dsh-nanogpt',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const RPC_CHANNEL = '/nanogpt'
    const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    const PROTOCOLS = ['chat', 'responses', 'messages']
    const ROUTING_MODES = ['auto', 'speed', 'throughput', 'latency', 'price', 'provider']
    const SERVICE_TIERS = ['auto', 'default', 'standard', 'flex', 'fast', 'priority', 'ultrafast', 'batch']
    const BILLING_MODES = ['default', 'paygo']
    const WEB_SEARCH = [
      'off', 'online', 'online/native', 'online/linkup', 'online/linkup-deep',
      'online/tavily', 'online/tavily-deep', 'online/brave', 'online/brave-deep',
      'online/sofya', 'online/exa-fast', 'online/exa-auto', 'online/exa-neural', 'online/exa-deep',
      'online/exa-deep-reasoning', 'online/exa-instant', 'online/kagi',
      'online/kagi-web', 'online/kagi-news', 'online/kagi-search', 'online/perplexity',
      'online/perplexity-deep', 'online/valyu', 'online/valyu-deep',
      'online/valyu-web', 'online/valyu-web-deep', 'online/firecrawl', 'online/firecrawl-deep',
    ]

    const EN = {
      title: 'NanoGPT',
      overview: 'Overview', connection: 'Connection', models: 'Models', reasoning: 'Reasoning',
      routing: 'Routing & billing', usage: 'Usage', diagnostics: 'Diagnostics', advanced: 'Advanced',
      refresh: 'Refresh catalog', refreshing: 'Refreshing…', loading: 'Loading NanoGPT…',
      retry: 'Retry', save: 'Save', saving: 'Saving…', remove: 'Remove', test: 'Test connection',
      testing: 'Testing…', cancel: 'Cancel', close: 'Close', confirm: 'Confirm', saved: 'Saved.',
      apiKey: 'API key', apiKeyHint: 'Write-only. The saved value is never returned to the browser.',
      keyConfigured: 'Configured', keyMissing: 'Not configured', keySource: 'Source', managedStore: 'managed store',
      environment: 'environment', baseUrl: 'Base URL', providerRoute: 'Provider route', protocol: 'Protocol',
      catalog: 'Model catalog', discovered: 'discovered', activeModels: 'visible', hidden: 'hidden',
      favorites: 'favorites', pinned: 'pinned', defaultModel: 'Default model', defaultEffort: 'Default effort',
      auto: 'Auto (provider default)', visibility: 'Reasoning output', show: 'Show', hide: 'Hide',
      search: 'Search models by id, name or description…', filters: 'Filters', allProviders: 'All providers',
      allTiers: 'All service tiers', reasoningOnly: 'Reasoning', toolsOnly: 'Tool calling', visionOnly: 'Vision',
      favoritesOnly: 'Favorites only', showHidden: 'Show hidden', sort: 'Sort', name: 'Name', context: 'Context',
      inputPrice: 'Input price', outputPrice: 'Output price', provider: 'Provider', previous: 'Previous', next: 'Next',
      page: 'Page', of: 'of', noModels: 'No models match these filters.', modelDetail: 'Model detail',
      upstreamProviders: 'Upstream providers', capabilities: 'Capabilities', pricing: 'Pricing',
      unknown: 'Unknown', notAdvertised: 'Not advertised', useAsDefault: 'Use as default',
      favorite: 'Favorite', unfavorite: 'Unfavorite', pin: 'Pin first', unpin: 'Unpin',
      conflict: 'Preferences changed concurrently; the latest state was reloaded. Try again.',
      error: 'The operation failed.', requestPreview: 'Request preview', endpoint: 'Endpoint',
      wireEffort: 'Wire effort', headers: 'Headers', body: 'Body', warnings: 'Warnings',
      balance: 'Balance', subscription: 'Subscription', quota: 'Quota', used: 'Used', remaining: 'Remaining',
      limit: 'Limit', resetAt: 'Resets', noCredential: 'Add a NanoGPT API key to read account data.',
      connected: 'Connected', invalidKey: 'Invalid API key', timeout: 'Timeout', network: 'Network failure',
      rateLimited: 'Rate limited', unavailable: 'Provider unavailable', invalidEndpoint: 'Invalid endpoint',
      insufficientFunds: 'Insufficient balance or quota', catalogReachable: 'Public catalog reachable',
      catalogNotReachable: 'Public catalog unreachable',
      catalogRefreshed: 'Catalog refreshed.', exportPrefs: 'Export preferences',
      importPrefs: 'Import preferences', importInvalid: 'That file is not a valid preferences document.',
      importConfirm: 'Import these preferences over the current ones?', deploymentFacts: 'Deployment facts',
      advancedOverrides: 'Advanced overrides', reset: 'Reset', inherit: 'Inherit', disableReasoning: 'Disable reasoning',
      reasoningLadder: 'Effort ladder override', global: 'Global', perModel: 'This model', routingMode: 'Routing mode',
      allowFallbacks: 'Allow fallbacks', caching: 'Cache-capable routing', stickyProvider: 'Disable fallback (sticky)',
      billingMode: 'Billing mode', serviceTier: 'Service tier', webSearch: 'Web search', promptCaching: 'Prompt caching',
      ttl: 'Cache TTL', loadProviders: 'Load upstream providers', noProviders: 'No public upstream providers are available.',
      conflictRouting: 'An explicit provider cannot be combined with cache-capable routing.',
      conflictRoutingGoal: 'Cache-capable routing cannot be combined with a routing goal.',
      conflictSticky: 'Sticky routing requires cache-capable routing.', conflictProvider: 'Choose a provider id.',
      saveRouting: 'Save routing', diagnosticsEmpty: 'No request diagnostics yet.', clearDiagnostics: 'Clear diagnostics',
      requestId: 'Request ID', duration: 'Duration', tokens: 'Tokens', failure: 'Failure', scope: 'Scope',
      mode: 'Mode', effort: 'Effort', contextWindow: 'Context window', maxOutput: 'Max output',
      inputModalities: 'Input modalities', source: 'Capability source', notes: 'Notes', verifiedAt: 'Verified at',
      alwaysThinking: 'Always reasons', supportsDisable: 'Can disable reasoning', experimental: 'Experimental ladder',
      visibilityHint: 'Hiding reasoning output does not disable reasoning computation. The Anthropic Messages transport has no documented hide control; it records a warning and keeps reasoning visible.',
      defaultModelHint: 'Saved through DSH’s default-model service for new sessions.',
      unsupportedOption: 'This option is not supported for the selected model or transport.',
      noChannel: 'The NanoGPT settings channel is unavailable.', closeConfirm: 'Close',
      routingHint: 'Chat uses documented routing body fields and allows caching with a routing goal. Responses/Messages use model suffixes, where caching cannot be combined with a routing goal.',
      deploymentHint: 'These values are owned by the deployment configuration (cordis.patch.yml).',
      importHelp: 'Imports are validated and never contain credentials.', keyRemoved: 'API key removed.',
      defaultSaved: 'Default model selection saved.', defaultNotPersisted: 'The deployment kept its previous default selection.',
      previewHint: 'The preview is produced by the same serializer the adapter uses; authorization is redacted by the Host.',
      noSelection: 'Select a model first.', keyRequired: 'Enter a key first.', loadingModels: 'Loading models…',
      loadingUsage: 'Loading account data…', loadingDiagnostics: 'Loading diagnostics…', loadingPreview: 'Building preview…',
      allEfforts: 'All efforts', inheritHint: 'Leave empty to inherit the deployment/catalog value.',
      providerCardTitle: 'NanoGPT quick configuration', configure: 'Open Settings → NanoGPT for models and routing.',
    }
    const RU = {
      title: 'NanoGPT', overview: 'Обзор', connection: 'Подключение', models: 'Модели', reasoning: 'Рассуждения',
      routing: 'Маршрутизация и оплата', usage: 'Расходы', diagnostics: 'Диагностика', advanced: 'Дополнительно',
      refresh: 'Обновить каталог', refreshing: 'Обновление…', loading: 'Загрузка NanoGPT…', retry: 'Повторить',
      save: 'Сохранить', saving: 'Сохранение…', remove: 'Удалить', test: 'Проверить подключение',
      testing: 'Проверка…', cancel: 'Отмена', close: 'Закрыть', confirm: 'Подтвердить', saved: 'Сохранено.',
      apiKey: 'API-ключ', apiKeyHint: 'Только запись. Сохранённое значение не возвращается в браузер.',
      keyConfigured: 'Настроен', keyMissing: 'Не настроен', keySource: 'Источник', managedStore: 'хранилище',
      environment: 'переменная окружения', baseUrl: 'Базовый URL', providerRoute: 'Маршрут провайдера', protocol: 'Протокол',
      catalog: 'Каталог моделей', discovered: 'обнаружено', activeModels: 'видимых', hidden: 'скрытых',
      favorites: 'избранных', pinned: 'закреплённых', defaultModel: 'Модель по умолчанию', defaultEffort: 'Уровень по умолчанию',
      auto: 'Авто (по умолчанию у провайдера)', visibility: 'Вывод рассуждений', show: 'Показывать', hide: 'Скрывать',
      search: 'Поиск по id, названию или описанию…', filters: 'Фильтры', allProviders: 'Все провайдеры',
      allTiers: 'Все уровни обслуживания', reasoningOnly: 'Рассуждения', toolsOnly: 'Вызов инструментов', visionOnly: 'Изображения',
      favoritesOnly: 'Только избранные', showHidden: 'Показывать скрытые', sort: 'Сортировка', name: 'Название', context: 'Контекст',
      inputPrice: 'Цена входа', outputPrice: 'Цена выхода', provider: 'Провайдер', previous: 'Назад', next: 'Вперёд',
      page: 'Страница', of: 'из', noModels: 'Нет моделей по этим фильтрам.', modelDetail: 'Детали модели',
      upstreamProviders: 'Провайдеры апстрима', capabilities: 'Возможности', pricing: 'Цены', unknown: 'Неизвестно',
      notAdvertised: 'Не указано', useAsDefault: 'Сделать моделью по умолчанию', favorite: 'В избранное',
      unfavorite: 'Убрать из избранного', pin: 'Закрепить', unpin: 'Открепить',
      conflict: 'Настройки изменились параллельно; загружено актуальное состояние. Повторите.',
      error: 'Операция не выполнена.', requestPreview: 'Предпросмотр запроса', endpoint: 'Эндпоинт',
      wireEffort: 'Уровень в запросе', headers: 'Заголовки', body: 'Тело', warnings: 'Предупреждения',
      balance: 'Баланс', subscription: 'Подписка', quota: 'Квота', used: 'Использовано', remaining: 'Осталось',
      limit: 'Лимит', resetAt: 'Сброс', noCredential: 'Добавьте API-ключ NanoGPT для чтения данных аккаунта.',
      connected: 'Подключено', invalidKey: 'Неверный API-ключ', timeout: 'Тайм-аут', network: 'Сетевая ошибка',
      rateLimited: 'Ограничение запросов', unavailable: 'Провайдер недоступен', invalidEndpoint: 'Неверный эндпоинт',
      insufficientFunds: 'Недостаточно средств или квоты', catalogReachable: 'Публичный каталог доступен',
      catalogNotReachable: 'Публичный каталог недоступен',
      catalogRefreshed: 'Каталог обновлён.', exportPrefs: 'Экспорт настроек',
      importPrefs: 'Импорт настроек', importInvalid: 'Файл не является корректным документом настроек.',
      importConfirm: 'Заменить текущие настройки импортированными?', deploymentFacts: 'Параметры развёртывания',
      advancedOverrides: 'Расширенные переопределения', reset: 'Сбросить', inherit: 'Наследовать',
      disableReasoning: 'Отключить рассуждения', reasoningLadder: 'Переопределение уровней', global: 'Глобально',
      perModel: 'Для модели', routingMode: 'Режим маршрутизации', allowFallbacks: 'Разрешить fallback',
      caching: 'Маршрутизация с кешем', stickyProvider: 'Запретить fallback (sticky)', billingMode: 'Режим оплаты',
      serviceTier: 'Уровень обслуживания', webSearch: 'Веб-поиск', promptCaching: 'Кеширование промпта',
      ttl: 'Время жизни кеша', loadProviders: 'Загрузить провайдеров', noProviders: 'Публичные провайдеры недоступны.',
      conflictRouting: 'Явный провайдер нельзя сочетать с маршрутизацией через кеш.',
      conflictRoutingGoal: 'Маршрутизацию через кеш нельзя сочетать с целью маршрутизации.',
      conflictSticky: 'Sticky-маршрутизация требует кеширования.', conflictProvider: 'Укажите id провайдера.',
      saveRouting: 'Сохранить маршрутизацию', diagnosticsEmpty: 'Диагностики запросов пока нет.',
      clearDiagnostics: 'Очистить диагностику', requestId: 'ID запроса', duration: 'Длительность', tokens: 'Токены',
      failure: 'Ошибка', scope: 'Область', mode: 'Режим', effort: 'Уровень', contextWindow: 'Контекстное окно',
      maxOutput: 'Макс. вывод', inputModalities: 'Входные модальности', source: 'Источник возможностей',
      notes: 'Примечания', verifiedAt: 'Проверено', alwaysThinking: 'Всегда рассуждает',
      supportsDisable: 'Можно отключить рассуждения', experimental: 'Экспериментальные уровни',
      visibilityHint: 'Скрытие вывода не отключает рассуждения. В Anthropic Messages документированного управления скрытием нет: выводится предупреждение, рассуждения остаются видимыми.',
      defaultModelHint: 'Сохраняется через сервис модели по умолчанию DSH для новых сессий.',
      unsupportedOption: 'Опция не поддерживается выбранной моделью или транспортом.',
      noChannel: 'Канал настроек NanoGPT недоступен.', closeConfirm: 'Закрыть',
      routingHint: 'Chat использует поля тела и допускает кеш вместе с целью. В Responses/Messages суффиксы кеша и цели несовместимы.',
      deploymentHint: 'Эти значения задаются конфигурацией развёртывания (cordis.patch.yml).',
      importHelp: 'Импорт проверяется и не содержит учетных данных.', keyRemoved: 'API-ключ удалён.',
      defaultSaved: 'Модель по умолчанию сохранена.', defaultNotPersisted: 'Развёртывание оставило прежнюю модель.',
      previewHint: 'Предпросмотр строит тот же сериализатор, что и адаптер; авторизация скрыта хостом.',
      noSelection: 'Сначала выберите модель.', keyRequired: 'Сначала введите ключ.', loadingModels: 'Загрузка моделей…',
      loadingUsage: 'Загрузка данных аккаунта…', loadingDiagnostics: 'Загрузка диагностики…',
      loadingPreview: 'Построение предпросмотра…', allEfforts: 'Все уровни',
      inheritHint: 'Оставьте пустым, чтобы наследовать значение каталога/развёртывания.',
      providerCardTitle: 'Быстрая настройка NanoGPT', configure: 'Модели и маршрутизация — в Settings → NanoGPT.',
    }

    function dictFor(locale) {
      return String(locale || '').toLowerCase().startsWith('ru') ? RU : EN
    }

    function makeT(getLocale) {
      return (key) => {
        const dict = dictFor(getLocale())
        return dict[key] !== undefined ? dict[key] : (EN[key] !== undefined ? EN[key] : key)
      }
    }

    function createApi(ctx, t) {
      return {
        async call(endpoint, payload, signal) {
          const connection = ctx.get('connection') || ctx.connection
          if (connection === undefined || connection.rpc === undefined) {
            return { ok: false, error: { code: 'NO_CONNECTION', message: t('noChannel') } }
          }
          try {
            return await connection.rpc.call(RPC_CHANNEL, endpoint, payload || {}, signal)
          } catch (error) {
            return { ok: false, error: { code: 'TRANSPORT', message: error instanceof Error ? error.message : String(error) } }
          }
        },
      }
    }

    function errorText(result, t) {
      return result && result.error && result.error.message ? result.error.message : t('error')
    }

    function fmtNumber(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
    }

    function fmtPrice(pricing, currency, key) {
      if (pricing === undefined || typeof pricing[key] !== 'number') return '—'
      return `${currency || 'USD'} ${pricing[key].toFixed(4)} / 1M`
    }

    function fmtTime(value) {
      if (typeof value !== 'string' || value.length === 0) return '—'
      const at = Date.parse(value)
      return Number.isFinite(at) ? new Date(at).toLocaleString() : value
    }

    const CSS = `
      .ng-page{display:flex;flex-direction:column;gap:16px;min-width:0;color:var(--dsw-alias-fg-primary,inherit);font-size:13px}
      .ng-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .ng-title{font-size:18px;font-weight:650;margin:0}
      .ng-sub{font-size:12px;opacity:.65;margin:0}
      .ng-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.25));padding-bottom:2px}
      .ng-tab{border:0;background:transparent;color:inherit;padding:8px 10px;border-radius:8px 8px 0 0;cursor:pointer;white-space:nowrap;font:inherit;opacity:.72}
      .ng-tab:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.09));opacity:1}
      .ng-tab[aria-selected=true]{opacity:1;box-shadow:inset 0 -2px 0 var(--dsw-alias-accent,#5eead4);font-weight:600}
      .ng-card{border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.28));border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-elevated,transparent);display:grid;gap:12px;min-width:0}
      .ng-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .ng-card-title{font-size:13px;font-weight:650;margin:0}
      .ng-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
      .ng-row{display:grid;grid-template-columns:minmax(120px,170px) minmax(0,1fr);gap:10px;align-items:baseline;min-width:0}
      .ng-label{font-size:12px;opacity:.68}
      .ng-value{font-size:13px;font-weight:550;overflow-wrap:anywhere}
      .ng-muted{opacity:.6}
      .ng-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
      .ng-field{display:flex;flex-direction:column;gap:5px;min-width:0}
      .ng-input,.ng-select,.ng-textarea{border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.35));border-radius:8px;background:var(--dsw-alias-bg-primary,transparent);color:inherit;padding:7px 9px;font:inherit;min-width:0}
      .ng-input:focus,.ng-select:focus,.ng-textarea:focus{outline:2px solid var(--dsw-alias-accent,#5eead4);outline-offset:1px}
      .ng-textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;min-height:120px;resize:vertical}
      .ng-btn{border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.4));border-radius:8px;padding:6px 11px;background:var(--dsw-alias-bg-elevated,transparent);color:inherit;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
      .ng-btn:hover:not(:disabled){background:var(--dsw-alias-bg-hover,rgba(127,127,127,.1))}
      .ng-btn:disabled{opacity:.5;cursor:not-allowed}
      .ng-btn-primary{background:var(--dsw-alias-accent,#2563eb);border-color:transparent;color:var(--dsw-alias-fg-on-accent,#fff);font-weight:600}
      .ng-btn-danger{color:var(--dsw-alias-fg-danger,#d9534f);border-color:var(--dsw-alias-border-danger,rgba(217,83,79,.5))}
      .ng-chip{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.3));border-radius:999px;padding:1px 7px;font-size:11px;opacity:.85;white-space:nowrap}
      .ng-chips{display:flex;gap:5px;flex-wrap:wrap}
      .ng-list{display:grid;gap:6px;min-width:0}
      .ng-model-row{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(120px,1fr) minmax(110px,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.22));border-radius:10px;min-width:0}
      .ng-model-row:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.07))}
      .ng-model-name{display:grid;gap:2px;min-width:0}
      .ng-model-name strong{font-size:13px;font-weight:600;overflow-wrap:anywhere}
      .ng-actions{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .ng-icon-btn{border:1px solid transparent;background:transparent;color:inherit;border-radius:7px;padding:3px 6px;cursor:pointer;opacity:.72}
      .ng-icon-btn:hover{opacity:1;background:var(--dsw-alias-bg-hover,rgba(127,127,127,.12))}
      .ng-banner{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;border-radius:9px;padding:9px 11px;font-size:12px;border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.3))}
      .ng-banner-error{color:var(--dsw-alias-fg-danger,#d9534f);border-color:var(--dsw-alias-border-danger,rgba(217,83,79,.5))}
      .ng-banner-ok{color:var(--dsw-alias-fg-success,#2e7d32);border-color:var(--dsw-alias-border-success,rgba(46,125,50,.5))}
      .ng-empty{opacity:.65;text-align:center;padding:26px 8px}
      .ng-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;font-size:12px}
      .ng-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:80;display:flex;align-items:center;justify-content:center;padding:18px}
      .ng-modal{background:var(--dsw-alias-bg-elevated,#181818);color:var(--dsw-alias-fg-primary,inherit);border:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.4));border-radius:14px;width:min(880px,96vw);max-height:88vh;overflow:auto;padding:16px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      .ng-modal h3{margin:0;font-size:16px}
      .ng-pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.45;background:var(--dsw-alias-bg-muted,rgba(127,127,127,.08));border-radius:8px;padding:10px;max-height:320px;overflow:auto;margin:0}
      .ng-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
      .ng-switch-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--dsw-alias-border-weak,rgba(127,127,127,.18));padding:6px 0}
      .ng-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
      .ng-kv div{display:grid;gap:2px}
      .ng-kv b{font-size:12px;font-weight:600}
      @media(max-width:720px){.ng-model-row{grid-template-columns:1fr;gap:6px}.ng-actions{justify-content:flex-start}.ng-split{grid-template-columns:1fr}.ng-row{grid-template-columns:1fr}}
    `

    function Button(props) {
      const classes = ['ng-btn']
      if (props.variant === 'primary') classes.push('ng-btn-primary')
      if (props.variant === 'danger') classes.push('ng-btn-danger')
      return h('button', {
        type: 'button', className: classes.join(' '), onClick: props.onClick,
        disabled: props.disabled === true || props.busy === true, title: props.title,
        'aria-busy': props.busy === true ? 'true' : undefined,
      }, props.busy ? (props.busyLabel || '…') : props.children)
    }

    function Card(props) {
      return h('section', { className: 'ng-card' },
        props.title === undefined ? null : h('div', { className: 'ng-card-head' },
          h('h3', { className: 'ng-card-title' }, props.title),
          props.actions || null,
        ),
        props.children,
      )
    }

    function Row(props) {
      return h('div', { className: 'ng-row' },
        h('span', { className: 'ng-label' }, props.label),
        h('span', { className: `ng-value${props.muted ? ' ng-muted' : ''}` }, props.value),
      )
    }

    function Field(props) {
      return h('label', { className: 'ng-field' },
        h('span', { className: 'ng-label' }, props.label),
        props.children,
        props.hint === undefined ? null : h('span', { className: 'ng-label ng-muted' }, props.hint),
      )
    }

    function Banner(props) {
      const classes = ['ng-banner']
      if (props.kind === 'error') classes.push('ng-banner-error')
      if (props.kind === 'ok') classes.push('ng-banner-ok')
      return h('div', { className: classes.join(' '), role: props.kind === 'error' ? 'alert' : 'status' },
        h('span', null, props.children),
        props.onClose === undefined ? null : h('button', { type: 'button', className: 'ng-icon-btn', onClick: props.onClose, 'aria-label': 'Dismiss' }, '×'),
      )
    }

    function Modal(props) {
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); props.onClose() } }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [props.onClose])
      return h('div', { className: 'ng-modal-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose() } },
        h('div', { className: 'ng-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title },
          h('div', { className: 'ng-card-head' },
            h('h3', null, props.title),
            h('button', { type: 'button', className: 'ng-icon-btn', onClick: props.onClose, 'aria-label': props.closeLabel || 'Close' }, '×'),
          ),
          props.children,
        ),
      )
    }

    function Chips(props) {
      const items = props.items.filter((item) => item !== undefined && item !== null && item !== false)
      return h('div', { className: 'ng-chips' }, items.map((item, index) => h('span', { className: 'ng-chip', key: `${item}-${index}` }, item)))
    }

    function useLocale(locale) {
      const read = () => {
        try { return locale === undefined ? 'en' : (locale.getSnapshot() || {}).active || 'en' } catch { return 'en' }
      }
      const [active, setActive] = useState(read)
      useEffect(() => {
        if (locale === undefined || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setActive(read()))
      }, [locale])
      return active
    }

    function useRpcEffect(api, endpoint, payload, deps, onResult) {
      useEffect(() => {
        const controller = new AbortController()
        let stale = false
        api.call(endpoint, payload, controller.signal).then((result) => {
          if (!stale) onResult(result)
        })
        return () => { stale = true; controller.abort() }
      }, deps)
    }

    function Page(props) {
      const { api, locale, t } = props
      useLocale(locale)
      const [status, setStatus] = useState(null)
      const [prefs, setPrefs] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [tab, setTab] = useState('overview')
      const [detail, setDetail] = useState(null)

      const loadAll = useCallback(async () => {
        setLoading(true)
        const [s, p] = await Promise.all([api.call('status', {}), api.call('preferences/get', {})])
        if (!s.ok) { setError(errorText(s, t)); setLoading(false); return }
        setStatus(s.value)
        if (p.ok) {
          setPrefs(p.value.preferences)
          const savedTab = p.value.preferences.ui && p.value.preferences.ui.tab
          if (savedTab && ['overview', 'connection', 'models', 'reasoning', 'routing', 'usage', 'diagnostics', 'advanced'].includes(savedTab)) setTab(savedTab)
        }
        setError(null)
        setLoading(false)
      }, [api, t])

      useEffect(() => { void loadAll() }, [loadAll])

      const reloadStatus = useCallback(async () => {
        const s = await api.call('status', {})
        if (s.ok) setStatus(s.value)
        return s
      }, [api])

      const applyPreferences = useCallback(async (patch) => {
        if (prefs === null) return { ok: false, error: t('error') }
        const result = await api.call('preferences/update', { revision: prefs.revision, patch })
        if (!result.ok) {
          if (result.error && result.error.code === 'STALE_REVISION') {
            await loadAll()
            setNotice({ kind: 'error', text: t('conflict') })
          } else {
            setNotice({ kind: 'error', text: errorText(result, t) })
          }
          return { ok: false, error: errorText(result, t) }
        }
        setPrefs(result.value.preferences)
        const s = await api.call('status', {})
        if (s.ok) setStatus(s.value)
        return { ok: true, preferences: result.value.preferences }
      }, [api, prefs, loadAll, t])

      const switchTab = (next) => {
        setTab(next)
        if (prefs !== null && (!prefs.ui || prefs.ui.tab !== next)) {
          void api.call('preferences/update', {
            revision: prefs.revision,
            patch: { ui: { ...(prefs.ui || {}), tab: next } },
          }).then((result) => { if (result.ok) setPrefs(result.value.preferences) })
        }
      }

      const refreshCatalog = async () => {
        const result = await api.call('catalog/refresh', {})
        if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
        await reloadStatus()
        setNotice({ kind: 'ok', text: t('catalogRefreshed') })
      }

      if (loading) return h('div', { className: 'ng-page' }, h('style', null, CSS), h('div', { className: 'ng-empty' }, t('loading')))
      if (error !== null && status === null) {
        return h('div', { className: 'ng-page' },
          h('style', null, CSS),
          h(Banner, { kind: 'error', children: error }),
          h(Button, { onClick: loadAll }, t('retry')),
        )
      }

      const tabs = [
        ['overview', t('overview')], ['connection', t('connection')], ['models', t('models')],
        ['reasoning', t('reasoning')], ['routing', t('routing')], ['usage', t('usage')],
        ['diagnostics', t('diagnostics')], ['advanced', t('advanced')],
      ]
      const common = { api, t, status, prefs, applyPreferences, reloadStatus, reloadAll: loadAll, setNotice, locale }

      return h('div', { className: 'ng-page' },
        h('style', null, CSS),
        h('div', { className: 'ng-head' },
          h('div', null,
            h('h2', { className: 'ng-title' }, t('title')),
            h('p', { className: 'ng-sub' }, status ? `${status.baseURL} · ${status.protocol}` : ''),
          ),
          h(Button, { onClick: refreshCatalog, busy: status && status.catalog && status.catalog.refreshing, busyLabel: t('refreshing') }, t('refresh')),
        ),
        notice === null ? null : h(Banner, { kind: notice.kind, onClose: () => setNotice(null), children: notice.text }),
        h('div', { className: 'ng-tabs', role: 'tablist' },
          tabs.map(([id, label]) => h('button', {
            key: id, type: 'button', role: 'tab', className: 'ng-tab', 'aria-selected': tab === id ? 'true' : 'false',
            onClick: () => switchTab(id),
          }, label)),
        ),
        tab === 'overview' ? h(Overview, { ...common, onTab: switchTab, onRefresh: refreshCatalog }) : null,
        tab === 'connection' ? h(ConnectionTab, common) : null,
        tab === 'models' ? h(ModelsTab, { ...common, onOpen: (id) => setDetail(id) }) : null,
        tab === 'reasoning' ? h(ReasoningTab, common) : null,
        tab === 'routing' ? h(RoutingTab, common) : null,
        tab === 'usage' ? h(UsageTab, common) : null,
        tab === 'diagnostics' ? h(DiagnosticsTab, common) : null,
        tab === 'advanced' ? h(AdvancedTab, common) : null,
        detail === null ? null : h(ModelDetail, { ...common, id: detail, onClose: () => setDetail(null) }),
      )
    }

    function Overview(props) {
      const { status, t, onTab, onRefresh } = props
      const catalog = status.catalog || {}
      const counts = status.counts || {}
      const credential = status.credential || {}
      const agentDefault = status.agentDefault || {}
      return h('div', { className: 'ng-list' },
        h('div', { className: 'ng-grid' },
          h(Card, { title: t('connection') },
            h(Row, { label: t('credential'), value: credential.configured ? t('keyConfigured') : t('keyMissing'), muted: !credential.configured }),
            h(Row, { label: t('baseUrl'), value: status.baseURL || '—' }),
            h(Row, { label: t('protocol'), value: status.protocol || '—' }),
            h(Row, { label: t('defaultModel'), value: agentDefault.model || status.defaultModel || '—', muted: !(agentDefault.model || status.defaultModel) }),
            h(Button, { onClick: () => onTab('connection') }, t('connection')),
          ),
          h(Card, { title: t('catalog') },
            h(Row, { label: t('discovered'), value: `${fmtNumber(counts.total)} (${fmtNumber(catalog.chatModels || 0)} ${t('discovered')})` }),
            h(Row, { label: t('activeModels'), value: fmtNumber(counts.visible) }),
            h(Row, { label: t('favorites'), value: fmtNumber(counts.favorites) }),
            h(Row, { label: t('hidden'), value: fmtNumber(counts.hidden) }),
            h(Row, { label: 'Status', value: catalog.status || '—' }),
            h(Button, { onClick: onRefresh }, t('refresh')),
          ),
          h(Card, { title: t('reasoning') },
            h(Row, { label: t('defaultEffort'), value: (status.preferences && status.preferences.defaultReasoningEffort) || status.defaultReasoningEffort || t('auto') }),
            h(Row, { label: t('visibility'), value: ((status.preferences && status.preferences.reasoningVisibility) || status.reasoningVisibility || 'show') === 'hide' ? t('hide') : t('show') }),
            h(Row, { label: t('experimental'), value: status.experimentalEfforts ? 'on' : 'off' }),
            h(Button, { onClick: () => onTab('reasoning') }, t('reasoning')),
          ),
        ),
        catalog.error === undefined ? null : h(Banner, { kind: 'error', children: `${catalog.error.code}: ${catalog.error.message}` }),
        catalog.fetchedAt === undefined ? null : h(Row, { label: t('verifiedAt'), value: fmtTime(catalog.fetchedAt) }),
        agentDefault.available === false ? h(Banner, { kind: 'error', children: 'Default-model service is unavailable in this deployment.' }) : null,
        h(Card, { title: t('models'), actions: h(Button, { onClick: () => onTab('models') }, t('models')) },
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('providerCardTitle') + ' — ' + t('configure')),
        ),
      )
    }

    const TEST_LABELS = {
      connected: 'connected', 'invalid-key': 'invalidKey', timeout: 'timeout', network: 'network',
      'rate-limited': 'rateLimited', 'provider-unavailable': 'unavailable', 'invalid-endpoint': 'invalidEndpoint',
      'insufficient-funds': 'insufficientFunds', unsupported: 'unavailable',
    }

    function ConnectionTab(props) {
      const { api, t, status, reloadStatus, setNotice } = props
      const [key, setKey] = useState('')
      const [busy, setBusy] = useState(false)
      const [testing, setTesting] = useState(false)
      const [testResult, setTestResult] = useState(null)
      const credential = (status && status.credential) || {}

      const save = async () => {
        if (key.trim().length === 0) { setNotice({ kind: 'error', text: t('keyRequired') }); return }
        setBusy(true)
        try {
          const result = await api.call('credential/set', { value: key.trim() })
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          setKey('')
          await reloadStatus()
          setNotice({ kind: 'ok', text: t('saved') })
        } finally { setBusy(false) }
      }

      const remove = async () => {
        if (!window.confirm(t('remove') + '?')) return
        setBusy(true)
        try {
          const result = await api.call('credential/remove', {})
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          await reloadStatus()
          setNotice({ kind: 'ok', text: t('keyRemoved') })
        } finally { setBusy(false) }
      }

      const test = async () => {
        setTesting(true)
        setTestResult(null)
        try {
          const result = await api.call('connection/test', key.trim().length === 0 ? {} : { apiKey: key.trim() })
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          setTestResult(result.value)
        } finally { setTesting(false) }
      }

      const resultLabel = testResult === null ? null : t(TEST_LABELS[testResult.status] || 'unavailable')
      return h('div', { className: 'ng-list' },
        h(Card, { title: t('connection') },
          h(Row, { label: t('credential'), value: credential.configured ? t('keyConfigured') : t('keyMissing'), muted: !credential.configured }),
          h(Row, { label: t('apiKey') + ' ref', value: credential.reference || '—' }),
          h(Row, { label: t('keySource'), value: credential.source === 'store' ? t('managedStore') : credential.source === 'environment' ? t('environment') : (credential.source || '—') }),
          h(Field, { label: t('apiKey'), hint: t('apiKeyHint') },
            h('input', {
              className: 'ng-input', type: 'password', autoComplete: 'new-password', value: key,
              placeholder: credential.configured ? '•••••••• (replace)' : 'NanoGPT API key',
              onChange: (event) => setKey(event.target.value),
            }),
          ),
          h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } },
            h(Button, { variant: 'primary', onClick: save, busy, busyLabel: t('saving') }, t('save')),
            h(Button, { onClick: test, busy: testing, busyLabel: t('testing') }, t('test')),
            h(Button, { variant: 'danger', onClick: remove, disabled: busy || !credential.configured, title: credential.writable === false ? 'Credential is read-only' : undefined }, t('remove')),
          ),
          testResult === null ? null : h('div', { className: 'ng-list' },
            h(Banner, { kind: testResult.authenticated ? 'ok' : 'error', children: `${resultLabel} — ${testResult.message || ''}` }),
            h(Row, { label: 'Latency', value: `${fmtNumber(testResult.latencyMs)} ms` }),
            h(Row, { label: t('catalog'), value: testResult.catalogReachable ? `${t('catalogReachable')}${testResult.catalogModels === undefined ? '' : ` (${testResult.catalogModels})`}` : t('catalogNotReachable') }),
            h(Row, { label: t('endpoint'), value: testResult.endpoint || '—' }),
          ),
        ),
        h(Card, { title: t('apiKeyHint') },
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('apiKeyHint')),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('providerCardTitle') + ': ' + t('configure')),
        ),
      )
    }

    function ModelsTab(props) {
      const { api, t, prefs, applyPreferences, onOpen, setNotice } = props
      const [query, setQuery] = useState('')
      const [provider, setProvider] = useState('')
      const [tier, setTier] = useState('')
      const [sort, setSort] = useState((prefs && prefs.ui && prefs.ui.sort) || 'name')
      const [reasoningOnly, setReasoningOnly] = useState(false)
      const [toolsOnly, setToolsOnly] = useState(false)
      const [visionOnly, setVisionOnly] = useState(false)
      const [favoritesOnly, setFavoritesOnly] = useState(false)
      const [showHidden, setShowHidden] = useState(Boolean(prefs && prefs.ui && prefs.ui.showHidden))
      const [page, setPage] = useState(0)
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const limit = 50

      useEffect(() => {
        const timer = setTimeout(() => setPage(0), 250)
        return () => clearTimeout(timer)
      }, [query, provider, tier, sort, reasoningOnly, toolsOnly, visionOnly, favoritesOnly, showHidden])

      useEffect(() => {
        const controller = new AbortController()
        let stale = false
        setLoading(true)
        api.call('models/query', {
          query: query.trim().length === 0 ? undefined : query.trim(),
          provider: provider || undefined, tier: tier || undefined, sort,
          reasoning: reasoningOnly, tools: toolsOnly, vision: visionOnly,
          favoritesOnly, showHidden, offset: page * limit, limit,
        }, controller.signal).then((result) => {
          if (stale) return
          if (result.ok) { setData(result.value); setError(null) }
          else setError(errorText(result, t))
          setLoading(false)
        })
        return () => { stale = true; controller.abort() }
      }, [api, query, provider, tier, sort, reasoningOnly, toolsOnly, visionOnly, favoritesOnly, showHidden, page, prefs && prefs.revision])

      const toggle = async (kind, id) => {
        const current = (prefs && prefs[kind]) || []
        const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
        await applyPreferences({ [kind]: next })
      }

      const items = data && data.items ? data.items : []
      const providers = data && data.providers ? data.providers : []
      const total = data && typeof data.total === 'number' ? data.total : 0
      const pages = Math.max(1, Math.ceil(total / limit))

      return h('div', { className: 'ng-list' },
        h(Card, { title: t('models'), actions: h('span', { className: 'ng-label' }, `${fmtNumber(total)} ${t('discovered')}`) },
          h('div', { className: 'ng-grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' } },
            h(Field, { label: t('search') }, h('input', { className: 'ng-input', value: query, placeholder: t('search'), onChange: (event) => setQuery(event.target.value) })),
            h(Field, { label: t('provider') }, h('select', { className: 'ng-select', value: provider, onChange: (event) => setProvider(event.target.value) },
              h('option', { value: '' }, t('allProviders')),
              providers.map((entry) => h('option', { key: entry, value: entry }, entry)),
            )),
            h(Field, { label: t('serviceTier') }, h('select', { className: 'ng-select', value: tier, onChange: (event) => setTier(event.target.value) },
              h('option', { value: '' }, t('allTiers')),
              SERVICE_TIERS.filter((entry) => entry !== 'auto' && entry !== 'default').map((entry) => h('option', { key: entry, value: entry }, entry)),
            )),
            h(Field, { label: t('sort') }, h('select', { className: 'ng-select', value: sort, onChange: (event) => { setSort(event.target.value); if (prefs) void applyPreferences({ ui: { ...(prefs.ui || {}), sort: event.target.value } }) } },
              h('option', { value: 'name' }, t('name')), h('option', { value: 'context' }, t('context')),
              h('option', { value: 'input-price' }, t('inputPrice')), h('option', { value: 'output-price' }, t('outputPrice')),
              h('option', { value: 'provider' }, t('provider')),
            )),
          ),
          h('div', { className: 'ng-chips' },
            [['reasoningOnly', t('reasoningOnly')], ['toolsOnly', t('toolsOnly')], ['visionOnly', t('visionOnly')], ['favoritesOnly', t('favoritesOnly')], ['showHidden', t('showHidden')]].map(([key, label]) => {
              const value = { reasoningOnly, toolsOnly, visionOnly, favoritesOnly, showHidden }[key]
              const setValue = { reasoningOnly: setReasoningOnly, toolsOnly: setToolsOnly, visionOnly: setVisionOnly, favoritesOnly: setFavoritesOnly, showHidden: setShowHidden }[key]
              return h('button', {
                key, type: 'button', className: 'ng-btn', 'aria-pressed': value ? 'true' : 'false',
                onClick: () => { setValue(!value); if (key === 'showHidden' && prefs) void applyPreferences({ ui: { ...(prefs.ui || {}), showHidden: !value } }) }, style: value ? { borderColor: 'var(--dsw-alias-accent,#5eead4)' } : undefined,
              }, label)
            }),
          ),
          error === null ? null : h(Banner, { kind: 'error', children: error }),
          loading ? h('div', { className: 'ng-empty' }, t('loadingModels')) : items.length === 0 ? h('div', { className: 'ng-empty' }, t('noModels')) : h('div', { className: 'ng-list' },
            items.map((model) => h('div', { className: 'ng-model-row', key: model.id },
              h('div', { className: 'ng-model-name' },
                h('strong', null, model.name),
                h('span', { className: 'ng-mono ng-muted' }, model.id),
                h(Chips, { items: [
                  model.provider,
                  model.capabilities && model.capabilities.reasoning ? 'reasoning' : undefined,
                  model.capabilities && model.capabilities.toolCalling ? 'tools' : undefined,
                  model.capabilities && model.capabilities.vision ? 'vision' : undefined,
                  model.capabilities && model.capabilities.structuredOutput ? 'json' : undefined,
                  model.category,
                ] }),
              ),
              h('div', { className: 'ng-list' },
                h('span', { className: 'ng-label' }, t('contextWindow')),
                h('span', null, fmtNumber(model.contextWindow)),
                h('span', { className: 'ng-label' }, t('maxOutput')),
                h('span', null, fmtNumber(model.maxOutputTokens)),
              ),
              h('div', { className: 'ng-list' },
                h('span', { className: 'ng-label' }, t('pricing')),
                h('span', { className: 'ng-mono' }, `${fmtPrice(model.pricing, model.currency, 'input')} → ${fmtPrice(model.pricing, model.currency, 'output')}`),
                h('span', { className: 'ng-label' }, model.reasoning ? (model.reasoning.unknown ? t('unknown') : (model.reasoning.efforts || []).map((entry) => entry.id).join(' / ')) : t('notAdvertised')),
              ),
              h('div', { className: 'ng-actions' },
                h('button', { type: 'button', className: 'ng-icon-btn', title: model.favorite ? t('unfavorite') : t('favorite'), 'aria-pressed': model.favorite ? 'true' : 'false', onClick: () => void toggle('favorites', model.id) }, model.favorite ? '★' : '☆'),
                h('button', { type: 'button', className: 'ng-icon-btn', title: model.pinned ? t('unpin') : t('pin'), 'aria-pressed': model.pinned ? 'true' : 'false', onClick: () => void toggle('pinned', model.id) }, model.pinned ? '⤒' : '⇧'),
                h('button', { type: 'button', className: 'ng-icon-btn', title: model.hidden ? t('show') : t('hide'), onClick: () => void toggle('hidden', model.id) }, model.hidden ? '◌' : '◍'),
                h(Button, { onClick: () => onOpen(model.id) }, t('modelDetail')),
              ),
            )),
          ),
          h('div', { className: 'ng-pager' },
            h(Button, { disabled: page <= 0, onClick: () => setPage(page - 1) }, t('previous')),
            h('span', null, `${t('page')} ${page + 1} ${t('of')} ${pages}`),
            h(Button, { disabled: page + 1 >= pages, onClick: () => setPage(page + 1) }, t('next')),
          ),
        ),
      )
    }

    function effortOptions(policy) {
      const efforts = policy && Array.isArray(policy.efforts) ? policy.efforts.map((entry) => entry.id) : []
      return efforts.length === 0 ? [] : efforts
    }

    function ModelDetail(props) {
      const { api, t, id, prefs, applyPreferences, onClose, setNotice, status } = props
      const [detail, setDetail] = useState(null)
      const [providers, setProviders] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [effort, setEffort] = useState('')
      const [ladder, setLadder] = useState([])
      const [protocol, setProtocol] = useState('')

      useEffect(() => {
        let stale = false
        setLoading(true)
        Promise.all([api.call('models/get', { id }), api.call('models/providers', { id })]).then(([model, provider]) => {
          if (stale) return
          if (model.ok) { setDetail(model.value); setError(null) } else setError(errorText(model, t))
          setProviders(provider.ok ? provider.value : { status: 'error', message: errorText(provider, t) })
          setLoading(false)
        })
        return () => { stale = true }
      }, [api, id, t])

      const summary = detail && detail.summary ? detail.summary : null
      const policy = detail && detail.reasoning ? detail.reasoning : summary && summary.reasoning ? summary.reasoning : null
      const effectiveEfforts = effortOptions(policy)

      useEffect(() => {
        if (policy && policy.source !== undefined) setLadder(effectiveEfforts)
      }, [detail])

      const toggleFavorite = async (kind) => {
        const current = (prefs && prefs[kind]) || []
        const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
        await applyPreferences({ [kind]: next })
      }

      const saveDefault = async () => {
        setBusy(true)
        try {
          const result = await api.call('default/set', { model: id, ...(effort.length === 0 ? {} : { reasoningEffort: effort }) })
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          await applyPreferences({ defaultModel: id, ...(effort.length === 0 ? {} : { defaultReasoningEffort: effort }) })
          setNotice({ kind: result.value.persisted === false ? 'error' : 'ok', text: result.value.persisted === false ? t('defaultNotPersisted') : t('defaultSaved') })
        } finally { setBusy(false) }
      }

      const saveOverride = async (patch) => {
        setBusy(true)
        try {
          const result = await applyPreferences({ models: { [id]: patch } })
          if (!result.ok) return
          setNotice({ kind: 'ok', text: t('saved') })
        } finally { setBusy(false) }
      }

      const setLadderOverride = async () => {
        const currentDefault = policy && policy.defaultEffort ? String(policy.defaultEffort) : ''
        await saveOverride({
          reasoningEfforts: ladder.length === 0 ? null : ladder,
          defaultEffort: ladder.includes(currentDefault) ? currentDefault : null,
        })
      }

      return h(Modal, { title: t('modelDetail'), onClose, closeLabel: t('close') },
        loading ? h('div', { className: 'ng-empty' }, t('loading')) : error !== null ? h(Banner, { kind: 'error', children: error }) : h('div', { className: 'ng-list' },
          h('div', { className: 'ng-card-head' },
            h('div', null,
              h('div', { style: { fontSize: 16, fontWeight: 650 } }, summary ? summary.name : id),
              h('div', { className: 'ng-mono ng-muted' }, id),
            ),
            h('div', { className: 'ng-actions' },
              h(Button, { onClick: () => void toggleFavorite('favorites') }, (prefs && prefs.favorites || []).includes(id) ? t('unfavorite') : t('favorite')),
              h(Button, { onClick: () => void toggleFavorite('pinned') }, (prefs && prefs.pinned || []).includes(id) ? t('unpin') : t('pin')),
              h(Button, { variant: 'primary', onClick: saveDefault, busy }, t('useAsDefault')),
            ),
          ),
          summary && summary.description ? h('p', { className: 'ng-muted', style: { margin: 0 } }, summary.description) : null,
          h(Card, { title: t('capabilities') },
            h('div', { className: 'ng-kv' },
              h('div', null, h('b', null, t('provider')), h('span', null, summary && summary.provider || '—')),
              h('div', null, h('b', null, t('contextWindow')), h('span', null, fmtNumber(summary && summary.contextWindow))),
              h('div', null, h('b', null, t('maxOutput')), h('span', null, fmtNumber(summary && summary.maxOutputTokens))),
              h('div', null, h('b', null, t('inputModalities')), h('span', null, (summary && summary.inputModalities || []).join(', ') || '—')),
            ),
            h(Chips, { items: summary && summary.capabilities ? Object.entries(summary.capabilities).filter(([, value]) => value === true).map(([key]) => key) : [] }),
          ),
          h(Card, { title: t('reasoning') },
            h(Row, { label: t('source'), value: policy ? String(policy.source) : t('notAdvertised') }),
            h('p', { className: 'ng-muted', style: { margin: 0 } }, 'The native selector advertises the model-wide ladder. When an upstream provider is pinned, the request re-resolves that route and enforces its narrower ladder before HTTP.'),
            h(Row, { label: t('effort'), value: policy ? (effectiveEfforts.length === 0 ? t('auto') : effectiveEfforts.join(' / ')) : '—' }),
            h(Row, { label: t('defaultEffort'), value: policy && policy.defaultEffort ? policy.defaultEffort : t('auto') }),
            h(Row, { label: t('alwaysThinking'), value: policy && policy.alwaysThinking ? 'yes' : 'no' }),
            h(Row, { label: t('supportsDisable'), value: policy && policy.supportsDisable ? 'yes' : 'no' }),
            policy && policy.notes && policy.notes.length > 0 ? h('div', { className: 'ng-list' }, policy.notes.map((note, index) => h('p', { key: index, className: 'ng-muted', style: { margin: 0 } }, note))) : null,
            h('div', { className: 'ng-grid' },
              h(Field, { label: t('defaultEffort') },
                h('select', { className: 'ng-select', value: effort, onChange: (event) => setEffort(event.target.value) },
                  h('option', { value: '' }, t('inherit')),
                  h('option', { value: 'auto' }, t('auto')),
                  effectiveEfforts.map((entry) => h('option', { key: entry, value: entry }, entry)),
                ),
              ),
              h(Field, { label: t('protocol') },
                h('select', { className: 'ng-select', value: protocol, onChange: (event) => setProtocol(event.target.value) },
                  h('option', { value: '' }, t('inherit')),
                  PROTOCOLS.map((entry) => h('option', { key: entry, value: entry }, entry)),
                ),
              ),
            ),
            h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } },
              h(Button, { onClick: () => void saveOverride({ defaultEffort: effort.length === 0 ? null : effort, protocol: protocol.length === 0 ? null : protocol }) }, t('save')),
              h(Button, { onClick: () => void saveOverride({ reasoningDisabled: true, defaultEffort: null, reasoningEfforts: null }), disabled: Boolean(policy && policy.alwaysThinking), title: policy && policy.alwaysThinking ? t('alwaysThinking') : undefined }, t('disableReasoning')),
              h(Button, { onClick: () => void saveOverride({ reasoningDisabled: null, reasoningEfforts: null, defaultEffort: null, protocol: null }) }, t('reset')),
            ),
            h(Field, { label: t('reasoningLadder') },
              h('div', { className: 'ng-chips' }, EFFORTS.map((entry) => h('button', {
                key: entry, type: 'button', className: 'ng-btn', 'aria-pressed': ladder.includes(entry) ? 'true' : 'false', disabled: Boolean(policy && policy.alwaysThinking && entry === 'none'),
                onClick: () => setLadder((current) => current.includes(entry) ? current.filter((value) => value !== entry) : [...current, entry]),
                style: ladder.includes(entry) ? { borderColor: 'var(--dsw-alias-accent,#5eead4)' } : undefined,
              }, entry))),
              h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } }, h(Button, { onClick: () => void setLadderOverride() }, t('save'))),
            ),
          ),
          h(Card, { title: t('pricing') },
            h(Row, { label: t('inputPrice'), value: fmtPrice(summary && summary.pricing, summary && summary.currency, 'input') }),
            h(Row, { label: t('outputPrice'), value: fmtPrice(summary && summary.pricing, summary && summary.currency, 'output') }),
            h(Row, { label: t('serviceTier'), value: (summary && summary.serviceTiers || []).join(', ') || t('notAdvertised') }),
            summary && summary.aliases && summary.aliases.length > 0 ? h(Row, { label: 'Aliases', value: summary.aliases.join(', ') }) : null,
            summary && summary.providers && summary.providers.length > 0 ? h(Row, { label: t('upstreamProviders'), value: summary.providers.join(', ') }) : null,
          ),
          h(Card, { title: t('upstreamProviders') },
            providers === null ? h('div', { className: 'ng-empty' }, t('loading')) : providers.status === 'ok' ? h('div', { className: 'ng-list' },
              (providers.catalog && providers.catalog.providers || []).map((row) => h('div', { className: 'ng-switch-row', key: row.id },
                h('span', { className: 'ng-mono' }, row.id),
                h(Chips, { items: [row.reasoningEfforts ? row.reasoningEfforts.join(' / ') : undefined, row.reasoningAlwaysOn ? t('alwaysThinking') : undefined] }),
              )),
            ) : h('p', { className: 'ng-muted', style: { margin: 0 } }, providers.message || t('noProviders')),
          ),
          h('div', { className: 'ng-actions', style: { justifyContent: 'flex-end' } }, h(Button, { onClick: onClose }, t('close'))),
        ),
      )
    }

    function ReasoningTab(props) {
      const { api, t, status, prefs, applyPreferences } = props
      const [model, setModel] = useState((status && status.agentDefault && status.agentDefault.model) || (status && status.defaultModel) || '')
      const [effort, setEffort] = useState('')
      const [preview, setPreview] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const currentDefault = (prefs && prefs.defaultReasoningEffort) || 'auto'
      const currentVisibility = (prefs && prefs.reasoningVisibility) || (status && status.reasoningVisibility) || 'show'
      const experimental = Boolean(prefs && prefs.ui && prefs.ui.experimental)

      const buildPreview = async () => {
        if (model.trim().length === 0) { setError(t('noSelection')); return }
        setBusy(true)
        setError(null)
        try {
          const result = await api.call('request/preview', { model: model.trim(), ...(effort.length === 0 ? {} : { reasoningEffort: effort }) })
          if (result.ok) setPreview(result.value)
          else setError(errorText(result, t))
        } finally { setBusy(false) }
      }

      return h('div', { className: 'ng-list' },
        h(Card, { title: t('reasoning') },
          h('div', { className: 'ng-grid' },
            h(Field, { label: t('defaultEffort') },
              h('select', { className: 'ng-select', value: currentDefault, disabled: prefs === null, onChange: (event) => void applyPreferences({ defaultReasoningEffort: event.target.value }) },
                h('option', { value: 'auto' }, t('auto')),
                EFFORTS.map((entry) => h('option', { key: entry, value: entry }, entry)),
              ),
            ),
            h(Field, { label: t('visibility') }, h('select', { className: 'ng-select', value: currentVisibility, disabled: prefs === null, onChange: (event) => void applyPreferences({ reasoningVisibility: event.target.value }) }, h('option', { value: 'show' }, t('show')), h('option', { value: 'hide' }, t('hide')))),
          ),
          h('label', { className: 'ng-switch-row' },
            h('span', null, t('experimental')),
            h('input', {
              type: 'checkbox', checked: experimental, disabled: prefs === null,
              onChange: () => {
                if (prefs === null) return
                void applyPreferences({ ui: { ...(prefs.ui || {}), experimental: !experimental } })
              },
            }),
          ),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('visibilityHint')),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('deploymentHint')),
        ),
        h(Card, { title: t('requestPreview') },
          h('div', { className: 'ng-grid' },
            h(Field, { label: t('models') }, h('input', { className: 'ng-input', value: model, placeholder: 'provider/model-id', onChange: (event) => setModel(event.target.value) })),
            h(Field, { label: t('effort') }, h('select', { className: 'ng-select', value: effort, onChange: (event) => setEffort(event.target.value) },
              h('option', { value: '' }, t('auto')), EFFORTS.map((entry) => h('option', { key: entry, value: entry }, entry)),
            )),
          ),
          h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } }, h(Button, { variant: 'primary', onClick: buildPreview, busy, busyLabel: t('loadingPreview') }, t('requestPreview'))),
          error === null ? null : h(Banner, { kind: 'error', children: error }),
          preview === null ? null : h(PreviewView, { preview, t }),
        ),
      )
    }

    function PreviewView(props) {
      const { preview, t } = props
      return h('div', { className: 'ng-list' },
        h(Row, { label: t('endpoint'), value: preview.endpoint }),
        h(Row, { label: t('protocol'), value: preview.protocol }),
        h(Row, { label: t('wireEffort'), value: preview.wireEffort || t('auto') }),
        preview.warnings && preview.warnings.length > 0 ? h(Banner, { kind: 'ok', children: preview.warnings.join(' · ') }) : null,
        h('details', null, h('summary', { className: 'ng-label' }, t('headers')), h('pre', { className: 'ng-pre' }, JSON.stringify(preview.headers, null, 2))),
        h('details', { open: true }, h('summary', { className: 'ng-label' }, t('body')), h('pre', { className: 'ng-pre' }, JSON.stringify(preview.body, null, 2))),
        h('p', { className: 'ng-muted', style: { margin: 0 } }, t('previewHint')),
      )
    }

    function RoutingTab(props) {
      const { api, t, prefs, applyPreferences, setNotice } = props
      const initial = (prefs && prefs.routing) || { mode: 'auto' }
      const initialAdvanced = (prefs && prefs.advanced) || {}
      const [scope, setScope] = useState('global')
      const [model, setModel] = useState('')
      const [form, setForm] = useState({ ...initial, mode: initial.mode || 'auto' })
      const [advanced, setAdvanced] = useState({
        ...initialAdvanced,
        promptCachingEnabled: Boolean(initialAdvanced.promptCaching && initialAdvanced.promptCaching.enabled),
        ttl: (initialAdvanced.promptCaching && initialAdvanced.promptCaching.ttl) || '',
      })
      const [providers, setProviders] = useState([])
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)

      const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
      const setAdv = (key, value) => setAdvanced((current) => ({ ...current, [key]: value }))
      const loadProviders = async () => {
        if (model.trim().length === 0) { setError(t('noSelection')); return }
        const result = await api.call('models/providers', { id: model.trim() })
        if (result.ok && result.value.status === 'ok') setProviders(result.value.catalog.providers || [])
        else { setProviders([]); setError(result.ok ? (result.value.message || t('noProviders')) : errorText(result, t)) }
      }
      const save = async () => {
        setError(null)
        if (scope === 'model' && model.trim().length === 0) { setError(t('noSelection')); return }
        if (form.mode === 'provider' && !form.provider) { setError(t('conflictProvider')); return }
        if (form.mode === 'provider' && form.caching === true) { setError(t('conflictRouting')); return }
        if (form.stickyProvider === true && form.caching !== true) { setError(t('conflictSticky')); return }
        setBusy(true)
        try {
          const routing = {
            mode: form.mode,
            ...(form.mode === 'provider' && form.provider ? { provider: form.provider } : {}),
            ...(form.allowFallbacks === false ? { allowFallbacks: false } : {}),
            ...(form.caching === true ? { caching: true } : {}),
            ...(form.stickyProvider === true ? { stickyProvider: true } : {}),
            ...(form.billingMode ? { billingMode: form.billingMode } : {}),
            ...(form.serviceTier && form.serviceTier !== 'auto' ? { serviceTier: form.serviceTier } : {}),
          }
          const modelBase = scope === 'model' && prefs && prefs.models && prefs.models[model.trim()]
            ? (prefs.models[model.trim()].advanced || {})
            : {}
          const baseAdvanced = scope === 'global' ? ((prefs && prefs.advanced) || {}) : modelBase
          const merged = { ...baseAdvanced }
          if (advanced.webSearch && advanced.webSearch !== 'off') merged.webSearch = advanced.webSearch
          else delete merged.webSearch
          if (advanced.promptCachingEnabled === true) merged.promptCaching = { enabled: true, ...(advanced.ttl ? { ttl: advanced.ttl } : {}) }
          else delete merged.promptCaching
          const adv = Object.keys(merged).length > 0 ? merged : null
          const result = scope === 'global'
            ? await applyPreferences({ routing, advanced: adv })
            : await applyPreferences({ models: { [model.trim()]: { routing, advanced: adv } } })
          if (!result.ok) setError(result.error)
          else setNotice({ kind: 'ok', text: t('saved') })
        } finally { setBusy(false) }
      }

      return h('div', { className: 'ng-list' },
        h(Card, { title: t('routing'), actions: h(Button, { onClick: save, busy, busyLabel: t('saving'), variant: 'primary' }, t('saveRouting')) },
          h('div', { className: 'ng-grid' },
            h(Field, { label: t('scope') }, h('select', { className: 'ng-select', value: scope, onChange: (event) => setScope(event.target.value) },
              h('option', { value: 'global' }, t('global')), h('option', { value: 'model' }, t('perModel')),
            )),
            scope === 'model' ? h(Field, { label: t('models') }, h('input', { className: 'ng-input', value: model, placeholder: 'provider/model-id', onChange: (event) => setModel(event.target.value) })) : null,
            h(Field, { label: t('routingMode') }, h('select', { className: 'ng-select', value: form.mode, onChange: (event) => set('mode', event.target.value) },
              ROUTING_MODES.map((mode) => h('option', { key: mode, value: mode }, mode)),
            )),
            form.mode === 'provider' ? h(Field, { label: t('provider') }, h('div', { className: 'ng-list' },
              h('div', { className: 'ng-actions' }, h(Button, { onClick: loadProviders }, t('loadProviders'))),
              h('select', { className: 'ng-select', value: form.provider || '', onChange: (event) => set('provider', event.target.value) },
                h('option', { value: '' }, '—'),
                providers.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.id)),
              ),
            )) : null,
            h(Field, { label: t('serviceTier') }, h('select', { className: 'ng-select', value: form.serviceTier || 'auto', onChange: (event) => set('serviceTier', event.target.value) },
              SERVICE_TIERS.map((tier) => h('option', { key: tier, value: tier }, tier)),
            )),
            h(Field, { label: t('billingMode') }, h('select', { className: 'ng-select', value: form.billingMode || 'default', onChange: (event) => set('billingMode', event.target.value === 'default' ? '' : event.target.value) },
              BILLING_MODES.map((mode) => h('option', { key: mode, value: mode }, mode)),
            )),
            h(Field, { label: t('webSearch') }, h('select', { className: 'ng-select', value: advanced.webSearch || 'off', onChange: (event) => setAdv('webSearch', event.target.value) },
              WEB_SEARCH.map((mode) => h('option', { key: mode, value: mode }, mode)),
            )),
            h(Field, { label: t('ttl') }, h('select', { className: 'ng-select', value: advanced.ttl || '', onChange: (event) => setAdv('ttl', event.target.value), disabled: advanced.promptCachingEnabled !== true },
              h('option', { value: '' }, '5m'), h('option', { value: '1h' }, '1h'),
            )),
          ),
          h('label', { className: 'ng-switch-row' }, h('span', null, t('allowFallbacks')), h('input', { type: 'checkbox', checked: form.allowFallbacks !== false, onChange: () => set('allowFallbacks', form.allowFallbacks === false) })),
          h('label', { className: 'ng-switch-row' }, h('span', null, t('caching')), h('input', { type: 'checkbox', checked: form.caching === true, onChange: () => set('caching', form.caching !== true) })),
          h('label', { className: 'ng-switch-row' }, h('span', null, t('stickyProvider')), h('input', { type: 'checkbox', checked: form.stickyProvider === true, onChange: () => set('stickyProvider', form.stickyProvider !== true) })),
          h('label', { className: 'ng-switch-row' }, h('span', null, t('promptCaching')), h('input', { type: 'checkbox', checked: advanced.promptCachingEnabled === true, onChange: () => setAdv('promptCachingEnabled', advanced.promptCachingEnabled !== true) })),
          error === null ? null : h(Banner, { kind: 'error', children: error }),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('routingHint')),
        ),
      )
    }

    function UsageTab(props) {
      const { api, t } = props
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const load = useCallback(async () => {
        setLoading(true)
        const result = await api.call('usage/read', {})
        if (result.ok) { setData(result.value); setError(null) } else setError(errorText(result, t))
        setLoading(false)
      }, [api, t])
      useEffect(() => { void load() }, [load])

      const section = (title, read, render) => h(Card, { title },
        read === undefined || read === null ? h('div', { className: 'ng-empty' }, '—') : read.failure !== undefined ? h(Banner, { kind: 'error', children: `${read.failure.code}: ${read.failure.message}` }) : read.value === undefined ? h('div', { className: 'ng-empty' }, '—') : render(read.value),
      )

      return h('div', { className: 'ng-list' },
        h('div', { className: 'ng-actions', style: { justifyContent: 'flex-end' } }, h(Button, { onClick: load, busy: loading, busyLabel: t('loadingUsage') }, t('refresh'))),
        error === null ? null : h(Banner, { kind: 'error', children: error }),
        loading ? h('div', { className: 'ng-empty' }, t('loadingUsage')) : data === null ? null : h('div', { className: 'ng-grid' },
          section(t('balance'), data.balance, (value) => h('div', { className: 'ng-list' },
            h(Row, { label: 'USD', value: value.usd === undefined ? t('notAdvertised') : fmtNumber(value.usd), muted: value.usd === undefined }),
            h(Row, { label: 'XNO', value: value.xno === undefined ? t('notAdvertised') : fmtNumber(value.xno), muted: value.xno === undefined }),
            value.unknownUnit ? h('p', { className: 'ng-muted', style: { margin: 0 } }, 'The endpoint returned a balance without a currency unit; it is not labelled as USD.') : null,
            value.depositAddress ? h(Row, { label: 'Nano address', value: value.depositAddress }) : null,
          )),
          section(t('usage'), data.usage, (value) => h('div', { className: 'ng-list' },
            h(Row, { label: 'Requests', value: fmtNumber(value.requests) }),
            h(Row, { label: 'Net cost USD', value: fmtNumber(value.netCostUsd) }),
            h(Row, { label: 'Input tokens', value: fmtNumber(value.inputTokens) }),
            h(Row, { label: 'Output tokens', value: fmtNumber(value.outputTokens) }),
            h(Row, { label: 'Total tokens', value: fmtNumber(value.totalTokens) }),
            value.from ? h(Row, { label: 'From', value: value.from }) : null,
            value.to ? h(Row, { label: 'To', value: value.to }) : null,
          )),
          section(t('subscription'), data.subscription, (value) => h('div', { className: 'ng-list' },
            h(Row, { label: 'Active', value: value.active === undefined ? t('unknown') : value.active ? 'yes' : 'no' }),
            h(Row, { label: 'State', value: value.state || '—' }),
            h(Row, { label: 'Recommended', value: value.recommendedMode || '—' }),
            value.periodEnd ? h(Row, { label: 'Period end', value: value.periodEnd }) : null,
            (value.quotas || []).map((quota) => h('div', { className: 'ng-switch-row', key: quota.id },
              h('span', null, quota.id),
              h('span', { className: 'ng-mono' }, `${fmtNumber(quota.used)} / ${fmtNumber(quota.limit)} · ${fmtNumber(quota.remaining)} ${t('remaining')}`),
            )),
          )),
        ),
      )
    }

    function DiagnosticsTab(props) {
      const { api, t, status, prefs } = props
      const [entries, setEntries] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [model, setModel] = useState((status && status.agentDefault && status.agentDefault.model) || (status && status.defaultModel) || '')
      const [effort, setEffort] = useState('')
      const [preview, setPreview] = useState(null)
      const [previewBusy, setPreviewBusy] = useState(false)

      const load = useCallback(async () => {
        setLoading(true)
        const result = await api.call('diagnostics/list', {})
        if (result.ok) { setEntries(result.value.entries || []); setError(null) } else setError(errorText(result, t))
        setLoading(false)
      }, [api, t])
      useEffect(() => { void load() }, [load])

      const clear = async () => {
        if (!window.confirm(t('clearDiagnostics') + '?')) return
        const result = await api.call('diagnostics/clear', {})
        if (result.ok) { setEntries([]); setError(null) } else setError(errorText(result, t))
      }

      const buildPreview = async () => {
        if (model.trim().length === 0) { setError(t('noSelection')); return }
        setPreviewBusy(true)
        try {
          const result = await api.call('request/preview', { model: model.trim(), ...(effort.length === 0 ? {} : { reasoningEffort: effort }) })
          if (result.ok) { setPreview(result.value); setError(null) } else setError(errorText(result, t))
        } finally { setPreviewBusy(false) }
      }

      return h('div', { className: 'ng-list' },
        h(Card, { title: t('diagnostics'), actions: h('div', { className: 'ng-actions' }, h(Button, { onClick: load, busy: loading }, t('refresh')), h(Button, { variant: 'danger', onClick: clear }, t('clearDiagnostics'))) },
          error === null ? null : h(Banner, { kind: 'error', children: error }),
          loading ? h('div', { className: 'ng-empty' }, t('loadingDiagnostics')) : entries.length === 0 ? h('div', { className: 'ng-empty' }, t('diagnosticsEmpty')) : h('div', { className: 'ng-list' },
            entries.map((entry, index) => h('div', { className: 'ng-switch-row', key: `${entry.at}-${index}` },
              h('span', { className: 'ng-mono' }, `${entry.model} · ${entry.protocol} · ${entry.wireEffort || entry.requestedEffort || 'auto'}`),
              h('span', { className: 'ng-label' }, `${entry.status === undefined ? '—' : entry.status} · ${fmtNumber(entry.durationMs)} ms · ${entry.usage ? `${fmtNumber(entry.usage.inputTokens)}→${fmtNumber(entry.usage.outputTokens)}` : ''}${entry.failure ? ` · ${entry.failure.code}` : ''}`),
            )),
          ),
        ),
        h(Card, { title: t('requestPreview') },
          h('div', { className: 'ng-grid' },
            h(Field, { label: t('models') }, h('input', { className: 'ng-input', value: model, placeholder: 'provider/model-id', onChange: (event) => setModel(event.target.value) })),
            h(Field, { label: t('effort') }, h('select', { className: 'ng-select', value: effort, onChange: (event) => setEffort(event.target.value) },
              h('option', { value: '' }, t('auto')), EFFORTS.map((entry) => h('option', { key: entry, value: entry }, entry)),
            )),
          ),
          h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } }, h(Button, { variant: 'primary', onClick: buildPreview, busy: previewBusy, busyLabel: t('loadingPreview') }, t('requestPreview'))),
          preview === null ? null : h(PreviewView, { preview, t }),
        ),
      )
    }

    function AdvancedTab(props) {
      const { api, t, status, prefs, setNotice, reloadAll } = props
      const [exporting, setExporting] = useState(false)
      const [importing, setImporting] = useState(false)
      const fileRef = useRef(null)
      const deployment = status || {}
      const download = async () => {
        setExporting(true)
        try {
          const result = await api.call('preferences/export', {})
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          const blob = new Blob([result.value.document], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = 'dsh-nanogpt-preferences.json'
          anchor.click()
          URL.revokeObjectURL(url)
        } finally { setExporting(false) }
      }
      const importFile = async (event) => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (file === undefined) return
        setImporting(true)
        try {
          const text = await file.text()
          let document
          try { document = JSON.parse(text) } catch { setNotice({ kind: 'error', text: t('importInvalid') }); return }
          if (!window.confirm(t('importConfirm'))) return
          const result = await api.call('preferences/import', { document, ...(prefs === null ? {} : { revision: prefs.revision }) })
          if (!result.ok) { setNotice({ kind: 'error', text: errorText(result, t) }); return }
          await reloadAll()
          setNotice({ kind: 'ok', text: t('saved') })
        } finally { setImporting(false) }
      }
      const rows = [
        [t('baseUrl'), deployment.baseURL],
        [t('protocol'), deployment.protocol],
        [t('defaultEffort'), deployment.defaultReasoningEffort || t('auto')],
        [t('visibility'), deployment.reasoningVisibility],
        ['Auto refresh', deployment.autoRefresh ? `yes (${deployment.refreshMinutes} min)` : 'no'],
        ['Header timeout', `${fmtNumber(deployment.requestTimeoutMs)} ms`],
        ['Stream idle timeout', `${fmtNumber(deployment.streamIdleTimeoutMs)} ms`],
        ['Default max tokens', deployment.defaultMaxTokens === undefined ? t('notAdvertised') : fmtNumber(deployment.defaultMaxTokens)],
      ]
      return h('div', { className: 'ng-list' },
        h(Card, { title: t('deploymentFacts') },
          rows.map(([label, value]) => h(Row, { key: label, label, value: value === undefined ? '—' : String(value) })),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('deploymentHint')),
        ),
        h(Card, { title: t('advancedOverrides') },
          h('div', { className: 'ng-actions', style: { justifyContent: 'flex-start' } },
            h(Button, { onClick: download, busy: exporting }, t('exportPrefs')),
            h(Button, { onClick: () => fileRef.current && fileRef.current.click(), busy: importing }, t('importPrefs')),
            h('input', { ref: fileRef, type: 'file', accept: 'application/json', style: { display: 'none' }, onChange: importFile }),
          ),
          h('p', { className: 'ng-muted', style: { margin: 0 } }, t('importHelp')),
        ),
      )
    }

    function ProviderCardExtras(props) {
      const { api, t, keyConfigured } = props
      const [key, setKey] = useState('')
      const [busy, setBusy] = useState(false)
      const [testResult, setTestResult] = useState(null)
      const save = async () => {
        if (key.trim().length === 0) return
        setBusy(true)
        try {
          const result = await api.call('credential/set', { value: key.trim() })
          if (result.ok) { setKey(''); setTestResult({ status: 'connected', message: t('saved') }) }
          else setTestResult({ status: 'invalid-key', message: errorText(result, t) })
        } finally { setBusy(false) }
      }
      const test = async () => {
        setBusy(true)
        try {
          const result = await api.call('connection/test', key.trim().length === 0 ? {} : { apiKey: key.trim() })
          setTestResult(result.ok ? result.value : { status: 'invalid-key', message: errorText(result, t) })
        } finally { setBusy(false) }
      }
      return h('div', { className: 'ng-list', style: { marginTop: 8 } },
        h('style', null, CSS),
        h('div', { className: 'ng-card-head' },
          h('strong', { style: { fontSize: 12 } }, t('providerCardTitle')),
          h('span', { className: 'ng-label' }, keyConfigured ? t('keyConfigured') : t('keyMissing')),
        ),
        h('p', { className: 'ng-muted', style: { margin: 0 } }, t('configure')),
        h('div', { className: 'ng-grid' },
          h(Field, { label: t('apiKey') }, h('input', { className: 'ng-input', type: 'password', autoComplete: 'new-password', value: key, onChange: (event) => setKey(event.target.value), placeholder: t('apiKeyHint') })),
          h('div', { className: 'ng-actions', style: { alignItems: 'flex-end' } },
            h(Button, { variant: 'primary', onClick: save, busy, busyLabel: t('saving') }, t('save')),
            h(Button, { onClick: test, busy, busyLabel: t('testing') }, t('test')),
          ),
        ),
        testResult === null ? null : h(Banner, { kind: testResult.authenticated || testResult.status === 'connected' ? 'ok' : 'error', children: `${t(TEST_LABELS[testResult.status] || 'unavailable')} — ${testResult.message || ''}` }),
      )
    }

    const inject = ['slots', 'connection', 'locale']

    function apply(ctx) {
      const locale = ctx.get('locale')
      const t = makeT(() => {
        try {
          const snapshot = locale === undefined ? undefined : locale.getSnapshot()
          return snapshot === undefined ? 'en' : snapshot.active
        } catch { return 'en' }
      })
      const api = createApi(ctx, t)
      ctx.effect(() => {
        if (locale === undefined || typeof locale.register !== 'function') return () => undefined
        let removeLanguage = () => undefined
        try {
          if (typeof locale.addLanguage === 'function') {
            removeLanguage = locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })
          }
        } catch {
          // A deployment that already ships Russian keeps its own language pack.
        }
        const removeDictionary = locale.register('nanogpt', { en: EN, ru: RU })
        return () => {
          try { removeDictionary() } finally { removeLanguage() }
        }
      }, 'llm-nanogpt: locale dictionaries')

      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'nanogpt', order: 14, label: () => t('title') },
        (props) => h(Page, { api, locale, t }),
      ))
      ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register(
        { name: 'settings.models.provider-card', key: 'llm-nanogpt' },
        (props) => h(ProviderCardExtras, {
          api, t,
          keyConfigured: Boolean(props && props.keyConfigured),
        }),
      ))
    }

    return { inject, apply }
  },
})
