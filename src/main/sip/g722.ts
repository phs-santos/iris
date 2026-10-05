// G.722 (ITU-T, 64 kbit/s): o codec de voz em banda larga. O áudio a 16000 Hz é dividido em duas
// faixas por um filtro espelhado (QMF); a de baixo vira 6 bits por amostra e a de cima 2 bits, com
// ADPCM em cada uma. Cada par de amostras de 16 kHz vira 1 byte: 20 ms são 320 amostras e 160 bytes.
// Segue os blocos da recomendação (os nomes QUANTL, LOGSCL, UPPOL… estão nos comentários), com as
// tabelas dela. No RTP o payload é o 9 e o relógio anda a 8000, por um engano antigo da RFC 3551.

const QMF = [3, -11, 12, 32, -210, 951, 3876, -805, 362, -156, 53, -11]

const Q6 = [
    0, 35, 72, 110, 150, 190, 233, 276, 323, 370, 422, 473, 530, 587, 650, 714, 786, 858, 940, 1023, 1121, 1219, 1339,
    1458, 1612, 1765, 1980, 2195, 2557, 2919, 0, 0
]
const ILN = [
    0, 63, 62, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4,
    0
]
const ILP = [
    0, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34,
    33, 32, 0
]
const WL = [-60, -30, 58, 172, 334, 538, 1198, 3042]
const RL42 = [0, 7, 6, 5, 4, 3, 2, 1, 7, 6, 5, 4, 3, 2, 1, 0]
const ILB = [
    2048, 2093, 2139, 2186, 2233, 2282, 2332, 2383, 2435, 2489, 2543, 2599, 2656, 2714, 2774, 2834, 2896, 2960, 3025,
    3091, 3158, 3228, 3298, 3371, 3444, 3520, 3597, 3676, 3756, 3838, 3922, 4008
]
const QM4 = [0, -20456, -12896, -8968, -6288, -4240, -2584, -1200, 20456, 12896, 8968, 6288, 4240, 2584, 1200, 0]
const QM2 = [-7408, -1616, 7408, 1616]
const QM6 = [
    -136, -136, -136, -136, -24808, -21904, -19008, -16704, -14984, -13512, -12280, -11192, -10232, -9360, -8576, -7856,
    -7192, -6576, -6000, -5456, -4944, -4464, -4008, -3576, -3168, -2776, -2400, -2032, -1688, -1360, -1040, -728,
    24808, 21904, 19008, 16704, 14984, 13512, 12280, 11192, 10232, 9360, 8576, 7856, 7192, 6576, 6000, 5456, 4944, 4464,
    4008, 3576, 3168, 2776, 2400, 2032, 1688, 1360, 1040, 728, 432, 136, -432, -136
]
const IHN = [0, 1, 0]
const IHP = [0, 3, 2]
const WH = [0, -214, 798]
const RH2 = [2, 1, 2, 1]

const saturate = (value: number): number => (value > 32767 ? 32767 : value < -32768 ? -32768 : value)

/** Estado do ADPCM de uma faixa: o preditor (dois polos e seis zeros) e o passo do quantizador. */
class Band {
    s = 0
    sp = 0
    sz = 0
    r = [0, 0, 0]
    a = [0, 0, 0]
    ap = [0, 0, 0]
    p = [0, 0, 0]
    d = [0, 0, 0, 0, 0, 0, 0]
    b = [0, 0, 0, 0, 0, 0, 0]
    bp = [0, 0, 0, 0, 0, 0, 0]
    nb = 0

    constructor(public det: number) {}

    /** Bloco 4 da recomendação: reconstrói o sinal e adapta o preditor com a diferença `d`. */
    update(d: number): void {
        // RECONS e PARREC
        this.d[0] = d
        this.r[0] = saturate(this.s + d)
        this.p[0] = saturate(this.sz + d)

        // UPPOL2: segundo coeficiente dos polos
        const sg0 = this.p[0]! >> 15
        const sg1 = this.p[1]! >> 15
        const sg2 = this.p[2]! >> 15
        let wd1 = saturate(this.a[1]! << 2)
        let wd2 = sg0 === sg1 ? -wd1 : wd1
        if (wd2 > 32767) wd2 = 32767
        let wd3 = (sg0 === sg2 ? 128 : -128) + (wd2 >> 7) + ((this.a[2]! * 32512) >> 15)
        if (wd3 > 12288) wd3 = 12288
        else if (wd3 < -12288) wd3 = -12288
        this.ap[2] = wd3

        // UPPOL1: primeiro coeficiente dos polos
        wd1 = sg0 === sg1 ? 192 : -192
        wd2 = (this.a[1]! * 32640) >> 15
        this.ap[1] = saturate(wd1 + wd2)
        wd3 = saturate(15360 - this.ap[2])
        if (this.ap[1] > wd3) this.ap[1] = wd3
        else if (this.ap[1] < -wd3) this.ap[1] = -wd3

        // UPZERO: coeficientes dos zeros
        wd1 = d === 0 ? 0 : 128
        const sgd = d >> 15
        for (let i = 1; i < 7; i++) {
            wd2 = this.d[i]! >> 15 === sgd ? wd1 : -wd1
            wd3 = (this.b[i]! * 32640) >> 15
            this.bp[i] = saturate(wd2 + wd3)
        }

        // DELAYA: o que era "agora" vira "antes"
        for (let i = 6; i > 0; i--) {
            this.d[i] = this.d[i - 1]!
            this.b[i] = this.bp[i]!
        }
        for (let i = 2; i > 0; i--) {
            this.r[i] = this.r[i - 1]!
            this.p[i] = this.p[i - 1]!
            this.a[i] = this.ap[i]!
        }

        // FILTEP, FILTEZ e PREDIC: a previsão da próxima amostra
        wd1 = (this.a[1]! * saturate(this.r[1]! + this.r[1]!)) >> 15
        wd2 = (this.a[2]! * saturate(this.r[2]! + this.r[2]!)) >> 15
        this.sp = saturate(wd1 + wd2)
        let sz = 0
        for (let i = 6; i > 0; i--) sz += (this.b[i]! * saturate(this.d[i]! + this.d[i]!)) >> 15
        this.sz = saturate(sz)
        this.s = saturate(this.sp + this.sz)
    }

    /** LOGSCL/LOGSCH e SCALEL/SCALEH: o passo do quantizador acompanha o volume do sinal. */
    scale(delta: number, limit: number, shift: number): void {
        let nb = ((this.nb * 127) >> 7) + delta
        if (nb < 0) nb = 0
        else if (nb > limit) nb = limit
        this.nb = nb
        const index = (nb >> 6) & 31
        const by = shift - (nb >> 11)
        this.det = (by < 0 ? ILB[index]! << -by : ILB[index]! >> by) << 2
    }
}

export class G722Encoder {
    private low = new Band(32)
    private high = new Band(8)
    private x = new Array<number>(24).fill(0)

    /** PCM de 16 bits a 16000 Hz, em número par de amostras; devolve 1 byte para cada duas. */
    encode(pcm: Int16Array): Buffer {
        const out = Buffer.alloc(pcm.length >> 1)
        const { x, low, high } = this
        for (let j = 0, n = 0; j + 1 < pcm.length; j += 2, n++) {
            // Filtro de análise: separa a faixa de baixo (até 4 kHz) da de cima.
            x.copyWithin(0, 2)
            x[22] = pcm[j]!
            x[23] = pcm[j + 1]!
            let sumOdd = 0
            let sumEven = 0
            for (let i = 0; i < 12; i++) {
                sumOdd += x[2 * i]! * QMF[i]!
                sumEven += x[2 * i + 1]! * QMF[11 - i]!
            }
            const xLow = (sumEven + sumOdd) >> 14
            const xHigh = (sumEven - sumOdd) >> 14

            // Faixa de baixo: SUBTRA e QUANTL, 6 bits
            const el = saturate(xLow - low.s)
            let wd = el >= 0 ? el : -(el + 1)
            let i = 1
            for (; i < 30; i++) if (wd < (Q6[i]! * low.det) >> 12) break
            const iLow = el < 0 ? ILN[i]! : ILP[i]!
            // INVQAL, LOGSCL e SCALEL com os 4 bits de cima, como o decodificador vai fazer
            const ril = iLow >> 2
            const dLow = (low.det * QM4[ril]!) >> 15
            low.scale(WL[RL42[ril]!]!, 18432, 8)
            low.update(dLow)

            // Faixa de cima: SUBTRA e QUANTH, 2 bits
            const eh = saturate(xHigh - high.s)
            wd = eh >= 0 ? eh : -(eh + 1)
            const mih = wd >= (564 * high.det) >> 12 ? 2 : 1
            const iHigh = eh < 0 ? IHN[mih]! : IHP[mih]!
            const dHigh = (high.det * QM2[iHigh]!) >> 15
            high.scale(WH[RH2[iHigh]!]!, 22528, 10)
            high.update(dHigh)

            out[n] = (iHigh << 6) | iLow
        }
        return out
    }
}

export class G722Decoder {
    private low = new Band(32)
    private high = new Band(8)
    private x = new Array<number>(24).fill(0)

    /** Devolve PCM de 16 bits a 16000 Hz: duas amostras para cada byte. */
    decode(data: Uint8Array): Int16Array {
        const out = new Int16Array(data.length * 2)
        const { x, low, high } = this
        for (let n = 0; n < data.length; n++) {
            const code = data[n]!
            const iLow = code & 0x3f
            const iHigh = (code >> 6) & 0x03

            // Faixa de baixo: INVQBL e RECONS com os 6 bits, e a adaptação com 4
            let rLow = low.s + ((low.det * QM6[iLow]!) >> 15)
            if (rLow > 16383) rLow = 16383
            else if (rLow < -16384) rLow = -16384
            const ril = iLow >> 2
            const dLow = (low.det * QM4[ril]!) >> 15
            low.scale(WL[RL42[ril]!]!, 18432, 8)
            low.update(dLow)

            // Faixa de cima
            const dHigh = (high.det * QM2[iHigh]!) >> 15
            let rHigh = dHigh + high.s
            if (rHigh > 16383) rHigh = 16383
            else if (rHigh < -16384) rHigh = -16384
            high.scale(WH[RH2[iHigh]!]!, 22528, 10)
            high.update(dHigh)

            // Filtro de síntese: junta as duas faixas de volta em 16 kHz
            x.copyWithin(0, 2)
            x[22] = rLow + rHigh
            x[23] = rLow - rHigh
            let out1 = 0
            let out2 = 0
            for (let i = 0; i < 12; i++) {
                out2 += x[2 * i]! * QMF[i]!
                out1 += x[2 * i + 1]! * QMF[11 - i]!
            }
            out[2 * n] = saturate(out1 >> 11)
            out[2 * n + 1] = saturate(out2 >> 11)
        }
        return out
    }
}
