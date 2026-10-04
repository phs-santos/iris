import { describe, expect, it } from 'vitest'
import { parseBlfList, parseDialogInfo, parseMessageSummary } from '@shared/presence'

const dialogInfo = (dialogs: string): string =>
    `<?xml version="1.0"?>\n<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="3" state="full" entity="sip:1002@pbx">\n${dialogs}\n</dialog-info>`

describe('presença e correio de voz (RF-27)', () => {
    it('lê a lista de ramais da conta, sem repetidos e sem o que não cabe num endereço', () => {
        expect(parseBlfList('1002, 1003;2001  1002')).toEqual(['1002', '1003', '2001'])
        expect(parseBlfList('1002, sip:x@y, a b<c>, *97')).toEqual(['1002', 'a', '*97'])
        expect(parseBlfList(undefined)).toEqual([])
    })

    it('ramal sem diálogo ou com diálogo terminado está livre', () => {
        expect(parseDialogInfo(dialogInfo(''))).toBe('idle')
        expect(parseDialogInfo(dialogInfo('<dialog id="a"><state>terminated</state></dialog>'))).toBe('idle')
    })

    it('diálogo começando é tocando; confirmado é em chamada, e vale mais que outro tocando', () => {
        expect(parseDialogInfo(dialogInfo('<dialog id="a" direction="recipient"><state>early</state></dialog>'))).toBe(
            'ringing'
        )
        expect(parseDialogInfo(dialogInfo('<dialog id="a"><state>proceeding</state></dialog>'))).toBe('ringing')
        expect(parseDialogInfo(dialogInfo('<dialog id="a"><state>confirmed</state></dialog>'))).toBe('busy')
        expect(
            parseDialogInfo(
                dialogInfo(
                    '<dialog id="a"><state>early</state></dialog><dialog id="b"><state>confirmed</state></dialog>'
                )
            )
        ).toBe('busy')
    })

    it('lê o aviso de correio de voz, com e sem a contagem', () => {
        expect(
            parseMessageSummary(
                'Messages-Waiting: yes\r\nMessage-Account: sip:1001@pbx\r\nVoice-Message: 2/8 (0/0)\r\n'
            )
        ).toEqual({
            waiting: true,
            newMessages: 2,
            oldMessages: 8
        })
        expect(parseMessageSummary('messages-waiting: no\r\n')).toEqual({
            waiting: false,
            newMessages: 0,
            oldMessages: 0
        })
        expect(parseMessageSummary('outra coisa')).toBeNull()
    })
})
