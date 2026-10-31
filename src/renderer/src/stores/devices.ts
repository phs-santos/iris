import { defineStore } from 'pinia'
import { ref } from 'vue'
import { audioInput, audioOutput, ringbackTone, ringer } from '@renderer/sip/audio'
import { useCallsStore } from './calls'
import { useLogStore } from './log'
import { DEFAULT_RING_VOLUME } from '@shared/ringtones'

export interface AudioDevice {
    id: string
    label: string
}

/** Escolha de microfone e alto-falante (RF-19), salva nas preferências e aplicada a todas as contas. */
export const useDevicesStore = defineStore('devices', () => {
    const inputs = ref<AudioDevice[]>([])
    const outputs = ref<AudioDevice[]>([])
    const inputId = ref('')
    const outputId = ref('')
    /** Volume do toque de chamada, de 0 a 100 (RF-55). */
    const ringVolume = ref(DEFAULT_RING_VOLUME)
    let watching = false
    let labelsHidden = true
    const missing = { input: false, output: false }

    async function refresh(): Promise<void> {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
        // "default" e "communications" são apelidos do Chromium para outro dispositivo da lista.
        const list = (kind: MediaDeviceKind): AudioDevice[] =>
            devices
                .filter(
                    (d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'
                )
                .map((d, i) => ({
                    id: d.deviceId,
                    label: d.label || `${kind === 'audioinput' ? 'Microfone' : 'Saída'} ${i + 1}`
                }))
        inputs.value = list('audioinput')
        outputs.value = list('audiooutput')
        labelsHidden = devices.some((d) => d.kind === 'audioinput' && !d.label)

        // Avisa uma vez quando o dispositivo escolhido some, não a cada evento de troca.
        const log = useLogStore()
        const inputGone = Boolean(inputId.value) && !inputs.value.some((d) => d.id === inputId.value)
        const outputGone = Boolean(outputId.value) && !outputs.value.some((d) => d.id === outputId.value)
        if (inputGone && !missing.input)
            log.add(null, 'warn', 'event', 'O microfone escolhido foi desconectado; usando o padrão do sistema')
        if (outputGone && !missing.output)
            log.add(null, 'warn', 'event', 'A saída de áudio escolhida foi desconectada; usando o padrão do sistema')
        missing.input = inputGone
        missing.output = outputGone
    }

    async function load(): Promise<void> {
        audioInput.install()
        const settings = await window.iris.settings.load()
        inputId.value = settings.audioInputId ?? ''
        outputId.value = settings.audioOutputId ?? ''
        audioInput.deviceId = inputId.value
        await audioOutput.setDevice(outputId.value)
        ringer.setDevice(outputId.value)
        ringbackTone.setDevice(outputId.value)
        ringVolume.value = settings.ringVolume ?? DEFAULT_RING_VOLUME
        ringer.volume = ringVolume.value
        await refresh()
        if (!watching) {
            watching = true
            navigator.mediaDevices.addEventListener('devicechange', () => void refresh())
        }
    }

    async function save(): Promise<void> {
        await window.iris.settings.update({
            audioInputId: inputId.value || undefined,
            audioOutputId: outputId.value || undefined
        })
    }

    async function setInput(id: string): Promise<void> {
        inputId.value = id
        audioInput.deviceId = id
        await useCallsStore().setInputDevice(id)
        await save()
        useLogStore().add(null, 'info', 'event', `Microfone: ${labelOf(inputs.value, id)}`)
    }

    async function setOutput(id: string): Promise<void> {
        outputId.value = id
        await audioOutput.setDevice(id)
        ringer.setDevice(id)
        ringbackTone.setDevice(id)
        await save()
        useLogStore().add(null, 'info', 'event', `Saída de áudio: ${labelOf(outputs.value, id)}`)
    }

    async function setRingVolume(volume: number): Promise<void> {
        ringVolume.value = volume
        ringer.volume = volume
        await window.iris.settings.update({ ringVolume: volume })
    }

    /** Pede o microfone uma vez: sem essa permissão o Chromium não mostra os nomes dos dispositivos. */
    async function unlockLabels(): Promise<void> {
        if (!labelsHidden) return
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((t) => t.stop())
        } catch {
            // sem microfone ou sem permissão: fica com os nomes genéricos
        }
        await refresh()
    }

    return {
        inputs,
        outputs,
        inputId,
        outputId,
        ringVolume,
        load,
        refresh,
        setInput,
        setOutput,
        setRingVolume,
        unlockLabels
    }
})

function labelOf(list: AudioDevice[], id: string): string {
    return id ? (list.find((d) => d.id === id)?.label ?? id) : 'padrão do sistema'
}
