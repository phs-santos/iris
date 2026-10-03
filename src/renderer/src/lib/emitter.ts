type AnyListener = (...args: any[]) => void

/** Emissor de eventos tipado e mínimo, usado pelos motores SIP. */
export class Emitter<Events extends Record<string, unknown[]>> {
    private listeners = new Map<keyof Events, Set<AnyListener>>()

    on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
        let set = this.listeners.get(event)
        if (!set) {
            set = new Set()
            this.listeners.set(event, set)
        }
        set.add(listener)
        return () => set.delete(listener)
    }

    emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
        for (const listener of [...(this.listeners.get(event) ?? [])]) {
            try {
                listener(...args)
            } catch (error) {
                console.error(`listener de "${String(event)}" falhou`, error)
            }
        }
    }

    clear(): void {
        this.listeners.clear()
    }
}
