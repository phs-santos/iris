import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installI18n } from './i18n'
import './styles.css'

const app = createApp(App).use(createPinia())
installI18n(app)
// Erros da interface vão para o log interno em arquivo (RNF-14), além do console.
const report = (where: string, error: unknown): void => {
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error(where, error)
    window.iris.logError(`${where}: ${text}`.slice(0, 8000))
}
app.config.errorHandler = (error, _instance, info) => report(`Vue (${info})`, error)
window.addEventListener('error', (event) => report('Erro não tratado', event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => report('Promessa rejeitada', event.reason))
app.mount('#app')
