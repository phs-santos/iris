import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'

// Com opções de linha de comando, a janela fica invisível e só executa os cenários (RF-31).
void window.iris.cli.config().then(async (config) => {
    if (!config) {
        createApp(App).use(createPinia()).mount('#app')
        return
    }
    const { runCli } = await import('./cli')
    const code = await runCli(config).catch((error: Error) => {
        window.iris.cli.print(`iris: erro inesperado: ${error.stack ?? error.message}`, true)
        return 2
    })
    window.iris.cli.finish(code)
})
