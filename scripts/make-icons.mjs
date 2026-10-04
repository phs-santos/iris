// Gera os PNG do ícone a partir dos SVG de build/: o do app (1024 e 512 px) e os da bandeja, um por
// estado (RF-33). Roda dentro do Electron, que é quem desenha o SVG: `npm run icons`.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

/** Cores de tom médio: aparecem tanto na barra clara quanto na escura. */
const TRAY_COLORS = { idle: '#8a94a3', ok: '#3fcf86', ringing: '#f0b13e', call: '#4f8ff7', error: '#f0675e' }

const icon = readFileSync('build/icon.svg', 'utf8')
const tray = readFileSync('build/tray.svg', 'utf8')
const jobs = [
    { svg: icon, size: 1024, out: 'build/icon.png' },
    { svg: icon, size: 512, out: 'resources/icon.png' }
]
for (const [state, color] of Object.entries(TRAY_COLORS)) {
    const svg = tray.replaceAll('COLOR', color)
    jobs.push({ svg, size: 16, out: `resources/tray-${state}.png` })
    jobs.push({ svg, size: 32, out: `resources/tray-${state}@2x.png` })
}

app.dock?.hide()
// Sem await no topo do módulo: o Electron só fica pronto depois que o módulo principal termina de carregar.
void app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false })
    await win.loadURL('data:text/html,<body></body>')
    for (const { svg, size, out } of jobs) {
        const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
        const url = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
            const image = new Image()
            image.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = canvas.height = ${size}
                const ctx = canvas.getContext('2d')
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(image, 0, 0, ${size}, ${size})
                ok(canvas.toDataURL('image/png'))
            }
            image.onerror = () => fail(new Error('SVG inválido'))
            image.src = ${JSON.stringify(src)}
        })`)
        writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
        console.log(`${out} (${size} px)`)
    }
    app.quit()
})
