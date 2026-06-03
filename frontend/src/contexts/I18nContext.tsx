import { createContext, useContext, useState, type ReactNode } from 'react'

type Locale = 'en' | 'pt-BR'

const messages: Record<Locale, Record<string, string>> = {
  'en': {
    'app.name': 'SGLang Commander',
    'nav.dashboard': 'Dashboard',
    'nav.server': 'Server',
    'nav.chat': 'Chat',
    'nav.models': 'Models',
    'nav.deploy': 'Deploy',
    'nav.settings': 'Settings',
    'nav.benchmark': 'Benchmark',
    'server.start': 'Start',
    'server.stop': 'Stop',
    'server.restart': 'Restart',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
  },
  'pt-BR': {
    'app.name': 'SGLang Commander',
    'nav.dashboard': 'Painel',
    'nav.server': 'Servidor',
    'nav.chat': 'Chat',
    'nav.models': 'Modelos',
    'nav.deploy': 'Implantar',
    'nav.settings': 'Configurações',
    'nav.benchmark': 'Benchmark',
    'server.start': 'Iniciar',
    'server.stop': 'Parar',
    'server.restart': 'Reiniciar',
    'common.save': 'Salvar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Excluir',
    'common.loading': 'Carregando...',
    'common.error': 'Erro',
    'common.success': 'Sucesso',
  },
}

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (k: string) => k,
})

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocale] = useState<Locale>('en')
  const t = (key: string) => messages[locale]?.[key] ?? key
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
