import { useApp } from './context/AppContext';

const STRINGS = {
  en: {
    'chat.title': 'Global Chat',
    'chat.empty': 'No messages yet. Start the conversation.',
    'chat.placeholder': 'Type a message…',
    'chat.send': 'Send',
    'login.title': 'Sign in',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.remember': 'Remember me',
    'login.submit': 'Sign in',
    'login.noAccount': "Don't have an account?",
    'login.create': 'Create one',
    'login.invalid': 'Invalid credentials',
    'settings.language': 'Language',
    'settings.language.en': 'English',
    'settings.language.es': 'Español',
    'settings.units': 'Units',
    'settings.theme': 'Theme',
    'settings.restTimer': 'Rest timer default',
  },
  es: {
    'chat.title': 'Chat global',
    'chat.empty': 'Aún no hay mensajes. Comienza la conversación.',
    'chat.placeholder': 'Escribe un mensaje…',
    'chat.send': 'Enviar',
    'login.title': 'Iniciar sesión',
    'login.username': 'Usuario',
    'login.password': 'Contraseña',
    'login.remember': 'Recuérdame',
    'login.submit': 'Entrar',
    'login.noAccount': '¿No tienes cuenta?',
    'login.create': 'Crear una',
    'login.invalid': 'Credenciales inválidas',
    'settings.language': 'Idioma',
    'settings.language.en': 'Inglés',
    'settings.language.es': 'Español',
    'settings.units': 'Unidades',
    'settings.theme': 'Tema',
    'settings.restTimer': 'Descanso predeterminado',
  },
};

export function useT() {
  const { language } = useApp() || {};
  const lang = language || 'en';
  return (key, fallback) => {
    const table = STRINGS[lang] || STRINGS.en;
    return table[key] ?? STRINGS.en[key] ?? fallback ?? key;
  };
}

export const translate = (lang, key, fallback) => {
  const table = STRINGS[lang] || STRINGS.en;
  return table[key] ?? STRINGS.en[key] ?? fallback ?? key;
};
