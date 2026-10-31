<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { t } from '@renderer/i18n'
import { DEFAULT_CODECS, offerOrder, type AudioCodecName, type CodecPrefs } from '@shared/codecs'
import Icon from '../icons/Icon.vue'

/**
 * Ordem dos codecs do SIP puro (Ajustes → Áudio): arrastar ou ↑/↓ muda a ordem, a caixa liga e desliga.
 * Vale para a oferta no INVITE e no 200 OK de todas as contas UDP, TCP e TLS, já nas próximas chamadas.
 * Pelo menos um fica ligado.
 */
const order = ref<AudioCodecName[]>([...DEFAULT_CODECS])
const disabled = ref<AudioCodecName[]>([])
const note = ref('')

onMounted(async () => {
    const prefs = (await window.iris.settings.load()).codecs
    // offerOrder já limpa repetidos e desconhecidos; os desligados vão para onde estavam na ordem gravada.
    const enabled = offerOrder(prefs ? { order: prefs.order, disabled: [] } : undefined)
    order.value = enabled
    disabled.value = DEFAULT_CODECS.filter((c) => prefs?.disabled?.includes(c))
})

const names = computed<Record<AudioCodecName, { name: string; detail: string }>>(() => ({
    G722: { name: 'G.722', detail: t('codecsList.g722') },
    PCMA: { name: 'PCMA', detail: t('codecsList.pcma') },
    PCMU: { name: 'PCMU', detail: t('codecsList.pcmu') },
    opus: { name: 'Opus', detail: t('codecsList.opus') } // i18n-ok: nome do codec
}))
const isOn = (c: AudioCodecName): boolean => !disabled.value.includes(c)
const onCount = computed(() => order.value.filter(isOn).length)

async function persist(): Promise<void> {
    const codecs: CodecPrefs = { order: [...order.value], disabled: [...disabled.value] }
    await window.iris.settings.update({ codecs })
}

function move(from: number, to: number): void {
    if (to < 0 || to >= order.value.length || from === to) return
    const list = [...order.value]
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item!)
    order.value = list
    note.value = t('codecsList.movido', { name: names.value[item!].name, n: to + 1 })
    void persist()
}

/** ↑/↓ movem e o foco segue o mesmo botão na nova linha, para apertar de novo (RNF-12). */
async function moveByKey(index: number, delta: -1 | 1, event: Event): Promise<void> {
    const codec = order.value[index]!
    move(index, index + delta)
    const kind = (event.currentTarget as HTMLElement).dataset.kind
    await Promise.resolve()
    requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`[data-codec="${codec}"]`)
        const same = row?.querySelector<HTMLButtonElement>(`button[data-kind="${kind}"]:not(:disabled)`)
        ;(same ?? row?.querySelector<HTMLButtonElement>('button[data-kind]:not(:disabled)'))?.focus()
    })
}

function toggle(codec: AudioCodecName, on: boolean): void {
    if (!on && onCount.value <= 1) return
    disabled.value = on ? disabled.value.filter((c) => c !== codec) : [...disabled.value, codec]
    void persist()
}

// ─── Arrastar ───
const dragging = ref<number | null>(null)
const over = ref<number | null>(null)
function onDragStart(index: number, event: DragEvent): void {
    dragging.value = index
    event.dataTransfer?.setData('text/plain', order.value[index]!)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDrop(index: number): void {
    if (dragging.value !== null) move(dragging.value, index)
    dragging.value = null
    over.value = null
}
</script>

<template>
    <div class="codecs">
        <ol class="list" :aria-label="$t('codecsList.ordem')">
            <li
                v-for="(codec, i) in order"
                :key="codec"
                :data-codec="codec"
                class="item"
                :class="{ off: !isOn(codec), dragging: dragging === i, over: over === i && dragging !== i }"
                draggable="true"
                @dragstart="onDragStart(i, $event)"
                @dragover.prevent="over = i"
                @dragleave="over = over === i ? null : over"
                @drop.prevent="onDrop(i)"
                @dragend="((dragging = null), (over = null))"
            >
                <span class="grip" aria-hidden="true"><Icon name="grip" /></span>
                <span class="pos mono tabular" aria-hidden="true">{{ i + 1 }}</span>
                <label class="what">
                    <input
                        type="checkbox"
                        :checked="isOn(codec)"
                        :disabled="isOn(codec) && onCount <= 1"
                        :aria-describedby="isOn(codec) && onCount <= 1 ? 'codec-last' : undefined"
                        @change="toggle(codec, ($event.target as HTMLInputElement).checked)"
                    />
                    <b>{{ names[codec].name }}</b>
                    <small>{{ names[codec].detail }}</small>
                </label>
                <span class="state">{{ isOn(codec) ? '' : $t('codecsList.desligado') }}</span>
                <span class="moves">
                    <button
                        type="button"
                        class="btn small ghost"
                        data-kind="up"
                        :disabled="i === 0"
                        :aria-label="$t('codecsList.subir', { name: names[codec].name })"
                        @click="moveByKey(i, -1, $event)"
                    >
                        <Icon name="up" />
                    </button>
                    <button
                        type="button"
                        class="btn small ghost"
                        data-kind="down"
                        :disabled="i === order.length - 1"
                        :aria-label="$t('codecsList.descer', { name: names[codec].name })"
                        @click="moveByKey(i, 1, $event)"
                    >
                        <Icon name="down" />
                    </button>
                </span>
            </li>
        </ol>
        <p v-if="onCount <= 1" id="codec-last" class="set-hint">{{ $t('codecsList.ultimo') }}</p>
        <p class="set-hint">{{ $t('codecsList.websocket') }}</p>
        <p class="sr-only" role="status">{{ note }}</p>
    </div>
</template>

<style scoped>
.list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
}
.item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 4px 4px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    transition: background 120ms;
}
.item:last-child {
    border-bottom: 0;
}
.item:hover .grip {
    color: var(--fg);
}
.item.dragging {
    opacity: 0.45;
}
/* Onde a linha arrastada vai cair: um filete na cor de destaque. */
.item.over {
    box-shadow: inset 0 2px 0 var(--accent);
    background: var(--selected);
}
.grip {
    display: grid;
    place-items: center;
    width: 18px;
    color: var(--faint);
    cursor: grab;
}
.grip .icon {
    width: 14px;
    height: 14px;
}
.pos {
    width: 16px;
    text-align: center;
    color: var(--muted);
    font-size: 11px;
}
.what {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    cursor: pointer;
}
.what input {
    align-self: center;
    margin: 0;
    accent-color: var(--accent-strong);
}
.what b {
    font-weight: 600;
    min-width: 46px;
}
.what small {
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
/* Desligado: texto riscado e apagado, além da caixa vazia (RNF-12). */
.item.off .what b {
    text-decoration: line-through;
    color: var(--muted);
}
.state {
    font-size: 11px;
    color: var(--muted);
}
.moves {
    display: flex;
    gap: 2px;
}
.moves .btn {
    min-height: 22px;
    width: 24px;
    padding: 0;
}
.moves .icon {
    width: 13px;
    height: 13px;
}
.set-hint {
    margin-top: 6px;
}
</style>
