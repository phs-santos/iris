// Guia de uso em inglês (RF-56). Mesmas seções, na mesma ordem e com os mesmos blocos de
// guide.pt-BR.ts; tests/i18n.test.ts confere. As capturas de tela são as mesmas, em português.

import type { GuideSection } from './guide.pt-BR'

export const GUIDE_EN: GuideSection[] = [
    {
        id: 'o-que-e',
        title: 'What Íris is',
        summary: 'A test phone for people who set up and maintain phone systems (PBX).',
        blocks: [
            {
                type: 'p',
                text: 'Íris is a softphone: a phone that runs on your computer and talks to the PBX over SIP, either on WebSocket with WebRTC audio or in plain SIP with G.711 audio. It was built to **test** telephony, not to take customer calls all day.'
            },
            { type: 'h', text: 'What to use it for' },
            {
                type: 'list',
                items: [
                    '**Check whether an extension registers** and see the exact reason when it does not.',
                    '**Call from one extension to another** without two devices: several accounts stay registered at the same time in the same window.',
                    '**Test an IVR**: dial, wait for the answer, send the digits and see what came back.',
                    '**Test transfer, hold and mute** and see the SIP signaling of each action.',
                    '**Read the log side by side with the call**, with the raw SIP when you need it.',
                    '**Repeat a test many times** with scenarios, on screen or from the command line.'
                ]
            },
            { type: 'image', name: 'principal', alt: 'Main Íris window with two calls in progress' },
            { type: 'h', text: 'What the PBX needs' },
            {
                type: 'p',
                text: 'Íris talks to the PBX in two ways. The most complete one is **SIP over secure WebSocket (WSS)** with **WebRTC** audio: Asterisk (PJSIP with a WSS `transport`), FreeSWITCH and Kamailio do this. The other is **plain SIP over UDP, TCP or TLS**, for PBXs without WebSocket: the account registers, makes and receives calls with **G.711** or **Opus** audio and DTMF. In plain SIP the audio is only encrypted if the account requires SRTP.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'No PBX at hand? The **simulated PBX** comes ready and works without a network. See "First call in 2 minutes".'
            }
        ]
    },
    {
        id: 'primeira-chamada',
        title: 'First call in 2 minutes',
        summary: 'The shortest path to see the app working, with the simulated PBX and with your own.',
        blocks: [
            {
                type: 'note',
                kind: 'dica',
                text: 'On first use, the **First steps** box at the top of the Phone tab walks you through these three steps and ticks each one on its own when you do it. Closed it and want it back? Ctrl/Cmd+K, "Show the first steps".'
            },
            { type: 'h', text: 'With the simulated PBX (no server)' },
            {
                type: 'p',
                text: 'The first time it opens, Íris creates three sample accounts, marked **SIM**. Two register on their own; the third (Lab 2001) fails on purpose with `403 Forbidden`, so you can see what an error looks like.'
            },
            {
                type: 'steps',
                items: [
                    'Click the **Suporte 1001** account, in the left column.',
                    'In the middle, click the **1002 Vendas 1002** shortcut. Íris calls from 1001 to 1002.',
                    'Account 1002 answers on its own (it has **AA**, auto-answer). Two cards show up: the outgoing call and the incoming one.',
                    'Try **Mute**, **Hold** and **DTMF** on one of the cards and follow the log on the right.',
                    'Click **Hang up**.'
                ]
            },
            { type: 'h', text: 'With your PBX' },
            {
                type: 'steps',
                items: [
                    'Click **+ New**, in the accounts column.',
                    'Fill in **Name**, **Extension**, **SIP domain**, **Password** and **WebSocket (WSS)**. The WSS address of an Asterisk is usually `wss://your-pbx:8089/ws`.',
                    'Untick **Simulated PBX** if it is ticked.',
                    'Click **Test connection**. If it works, click **Save and register**.',
                    'With the account dot green, type a number in the middle and click **Call**.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'If the red strip "The TLS certificate was refused" shows up, the PBX uses a self-signed certificate. See "Certificates".'
            }
        ]
    },
    {
        id: 'janela',
        title: 'The main window',
        summary: 'Three fixed columns: accounts, phone and log. The other screens open on top.',
        blocks: [
            { type: 'image', name: 'principal', alt: 'The three columns of the main window' },
            {
                type: 'table',
                head: ['Where', 'What is there', 'What it is for'],
                rows: [
                    [
                        'Top bar',
                        'Summary (accounts, PBX, registered, calls) and the general buttons',
                        'See the state of everything at a glance and open this Guide and the Settings'
                    ],
                    [
                        'Left: Accounts',
                        'The accounts grouped by domain (one group per PBX)',
                        'Pick which extension you call from and see the state of each one'
                    ],
                    ['Middle: Phone', 'The dialer and the call cards', 'Call, answer and act on each call'],
                    [
                        'Middle: Scenarios',
                        'Test scripts made of steps',
                        'Repeat a test on its own and measure time and success rate'
                    ],
                    ['Right: Log', 'What happened, in order, per account', 'Understand why something worked or failed']
                ]
            },
            { type: 'h', text: 'Buttons on the top bar' },
            {
                type: 'list',
                items: [
                    '**Phone mode**: swaps the window for a simple phone, with just the keypad and the call. See "Phone mode".',
                    '**Update available**: only shows when there is a new version. See "Update".',
                    '**Guide**: opens this screen. The **F1** key opens it too.',
                    '**Settings**: profile, colors, audio, AI, certificates, import and export, and update. The shortcut is **Ctrl+,** (on macOS, **Cmd+,**).'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Closing the window does not quit the app: the extensions stay registered and the calls go on. To really quit, use **Quit** on the tray icon. See "Tray and notifications".'
            }
        ]
    },
    {
        id: 'contas',
        title: 'Accounts',
        summary: 'Each account is an extension on a PBX. You can have several, on several PBXs, at the same time.',
        blocks: [
            { type: 'image', name: 'contas', alt: 'Accounts column with one account selected' },
            { type: 'h', text: 'Reading the state of an account' },
            {
                type: 'table',
                head: ['Symbol', 'State', 'What it means'],
                rows: [
                    ['Empty ring', 'disconnected', 'The account has not tried to register or was unregistered'],
                    ['Pulsing ring', 'connecting', 'Opening the WebSocket or waiting for the REGISTER reply'],
                    ['Solid green circle', 'registered', 'Ready to make and receive calls'],
                    [
                        'Red diamond',
                        'error',
                        'The PBX refused or the connection dropped. The code shows beside it, for example `403 Forbidden`'
                    ]
                ]
            },
            {
                type: 'p',
                text: 'When registration fails for a passing reason (network down, PBX restarting), the account shows **retrying** and Íris registers again on its own, waiting longer between attempts. Wrong password, unknown extension and refused login are not retried. The limit of attempts is in **Settings → Connection**.'
            },
            {
                type: 'p',
                text: 'The tags to the right of the name mean: a **number** is how many active calls the account has; **AA** is auto-answer on; **SIM** is an account on the simulated PBX.'
            },
            { type: 'h', text: 'Lights of other extensions (BLF) and voicemail' },
            {
                type: 'p',
                text: 'On **plain SIP** and **simulated PBX** accounts, the **Extensions to watch (BLF)** field, under Advanced, takes a list such as `1002, 1003`. With the account registered, each extension shows below it as a tag: a green border is **idle**, yellow is **ringing**, red is **on a call** and grey is **no news from the PBX** (the PBX refused to watch the extension, and the log says why). The PBX has to publish the state of the extensions; on Asterisk, that is a `hint` in the dialplan.'
            },
            {
                type: 'p',
                text: 'When the PBX reports messages in the **voicemail** of the extension, the account shows the "voicemail" tag with the number of new messages, and the log records the change.'
            },
            {
                type: 'p',
                text: 'Click the PBX name (the domain above the accounts) to **collapse the group**: it shows only how many accounts are online, such as "2/3 online". The choice is kept on this machine.'
            },
            { type: 'h', text: 'All accounts at once' },
            {
                type: 'list',
                items: [
                    'The **All** button, at the top of the accounts column, opens **Register all** and **Unregister all**.',
                    '**Register all** registers the accounts that are not registered yet. Useful after opening the app or when the network comes back.',
                    '**Unregister all** takes every extension offline at once, for example before changing the PBX.'
                ]
            },
            { type: 'h', text: 'Actions of an account' },
            {
                type: 'p',
                text: 'Click the account to select it. It becomes the source account of the dialer and shows **Register** (or **Unregister**), **Edit** and the **⋯** menu with the rest:'
            },
            {
                type: 'list',
                items: [
                    '**Register / Unregister**: puts the extension online or takes it offline.',
                    '**Edit**: opens the form. If the account was registered, it registers again with the new details.',
                    '**⋯ → Health**: runs the checks of the account. See "Health and diagnostics".',
                    '**⋯ → Duplicate**: creates a copy, to add several similar extensions without retyping everything.',
                    '**⋯ → SIP request…** (registered plain SIP accounts and simulated ones): sends a single request, such as `OPTIONS`, `MESSAGE` or `SUBSCRIBE`, with the headers and body you write, and shows the whole reply from the PBX and how long it took.',
                    '**⋯ → Load test…** (registered plain SIP accounts): places several calls at once through the account, each one playing a tone, to a destination that answers on its own (an echo number, an IVR). At the end it shows how many were answered, how many had audio, the time to answer, the packet loss and the jitter, and lets you save the report. It goes up to 200 calls. They do not show up as cards or in the history, and closing the screen ends them all.',
                    '**⋯ → Export PCAP** (registered plain SIP accounts): saves what went through the network for that account since registration, to open in Wireshark. "SIP only" takes the signaling; "with audio" also takes the RTP packets. The capture keeps the most recent 30 MB.',
                    '**⋯ → Delete**: asks for confirmation and deletes the account and its stored password.'
                ]
            },
            { type: 'h', text: 'When registration fails' },
            {
                type: 'p',
                text: 'The account shows a red box with the problem in plain words and what to check, for example "The PBX refused the login: check the username and password". The original SIP code (such as `403 Forbidden`) stays on the account row. The **Why did it fail?** button asks the AI for an explanation. See "AI help".'
            },
            { type: 'h', text: 'Add or edit' },
            { type: 'image', name: 'conta', alt: 'Account form with the Advanced section open' },
            {
                type: 'table',
                head: ['Field', 'What to enter'],
                rows: [
                    ['Name', 'A nickname so you recognize the account, for example "Support 1001"'],
                    ['Extension', 'The extension number on the PBX'],
                    ['SIP domain', 'The domain or IP of the PBX, as it expects it in the SIP address'],
                    [
                        'Password',
                        'The extension password. When editing, leave it blank to keep the current one; type only to change it'
                    ],
                    [
                        'Transport',
                        '**Secure WebSocket (WebRTC)** is the default and the most complete. **SIP over UDP, TCP or TLS** speaks plain SIP to the PBX, without WebRTC, with G.711 audio'
                    ],
                    [
                        'WebSocket (WSS)',
                        'With the WebSocket transport: the WebSocket address of the PBX, for example `wss://pbx.company.com:8089/ws`'
                    ],
                    [
                        'SIP server (host and port)',
                        'With plain SIP: only if the PBX answers on an address or port different from the domain, for example `10.0.0.5:5080`. Empty uses the domain and the default port (5060; on TLS, 5061)'
                    ]
                ]
            },
            { type: 'h', text: 'Servers: the connection written only once' },
            {
                type: 'p',
                text: 'When several accounts use the same PBX, add the PBX in **Settings → Servers**: name, domain, transport, address, STUN/TURN, preset and SRTP. In the account, pick the server from the **Server** list and fill in just the name, extension and password; the connection fields are locked. **Editing the server changes all of its accounts at once**, and the ones that are online register again with the new details.'
            },
            {
                type: 'list',
                items: [
                    'Already have a working account? In its form, **Save connection as server** adds the server and links the account to it.',
                    'To change the connection of one account only, pick **None** in the Server list: it is released and the fields become editable again.',
                    'Deleting a server neither deletes nor disconnects the accounts: they keep the details they had, they just stop changing along with it.'
                ]
            },
            { type: 'h', text: 'Plain SIP accounts (UDP, TCP or TLS)' },
            {
                type: 'p',
                text: 'They are for PBXs without WebSocket. The account **registers**, renews the registration on its own, **makes and receives calls** with G.722 (HD voice), G.711 (PCMU or PCMA) or Opus audio, sends and receives **DTMF** (over RTP or SIP INFO), has **mute**, **hold** and blind and attended **transfer**, measures **Health** and quality (loss, jitter and round-trip time) and shows the **raw SIP** and the **SIP flow**.'
            },
            {
                type: 'list',
                items: [
                    'On **TLS**, a self-signed certificate is refused and the screen offers **Trust this host**, as with WebSocket.',
                    'On **UDP**, Íris resends the request if the PBX does not reply and gives up after 32 seconds, with the `408` error.',
                    'In the **PCAP** file, the messages always show as UDP, even on TCP or TLS accounts, and on TLS already decrypted: it is the SIP text that matters for diagnosis. The file holds extensions, dialed numbers and, with the audio option, the conversation: treat it as confidential.',
                    'Audio goes over **unencrypted RTP**, unless you tick **Require encrypted audio (SRTP)** in the account. With that option, Íris offers SRTP when calling and refuses (`488`) callers without it; the quality line shows `(SRTP)` next to the codec. An incoming call that already comes with SRTP is answered encrypted even without the option.',
                    'The SRTP key travels inside the signaling (SDES). So that it does not go in the clear, use the **TLS** transport with it.',
                    'With SRTP, the round-trip time (RTT) stays at 0: it comes from RTCP, which Íris only exchanges unencrypted.',
                    'The PBX has to accept **G.722**, **G.711** or **Opus**. Íris offers G.722 first: when the PBX accepts it, voice goes in high definition (16 kHz, up to 7 kHz of treble) and the quality line shows `G722`. Otherwise G.711 applies, and Opus when that is all the PBX has; Opus goes out in narrowband (8 kHz), the same quality as G.711. A PBX that only offers G.729 refuses the call with `488`. Recording and scenario tones stay at 8 kHz, even on a G.722 call.',
                    'The first time, the system firewall may ask whether Íris can use the network. Allow it: without that the audio does not arrive.'
                ]
            },
            { type: 'h', text: 'Options' },
            {
                type: 'list',
                items: [
                    '**Simulated PBX (no network)**: the account uses the built-in fake PBX. Good for practicing and for building scenarios.',
                    '**Register when the app opens**: the account goes online on its own when Íris opens.',
                    '**Auto-answer after … ms**: the account answers on its own after the given time. This is what lets you test a call between two extensions without clicking Answer.',
                    '**Show raw SIP in the log**: turns on the recording of the full SIP messages of this account. Without it, the "Raw SIP" tab stays empty for it.'
                ]
            },
            { type: 'h', text: 'Advanced' },
            {
                type: 'table',
                head: ['Field', 'When to change it'],
                rows: [
                    ['Preset', 'Adjusts details for Asterisk, Kamailio or a generic PBX'],
                    ['SIP library', 'SIP.js is the default. Switch to JsSIP if the PBX behaves better with it'],
                    ['Authentication username', 'Only when the login username differs from the extension'],
                    ['Display name', 'The name shown to whoever receives your call'],
                    [
                        'DTMF mode',
                        'Automatic tries the best one. **SIP INFO** sends the digits through the signaling; **RTP (RFC 4733)** sends them along with the audio. Change it if the IVR does not recognize the digits'
                    ],
                    ['Color', 'The color of the account in the list, on the cards and in the log'],
                    [
                        'Extensions to watch (BLF)',
                        'Only on plain SIP and the simulated PBX. Extensions whose state (idle, ringing, on a call) shows below the account'
                    ],
                    [
                        'STUN / TURN',
                        'Servers to get through NAT, separated by commas. Without TURN, the call may have no audio behind some routers'
                    ],
                    [
                        'Speed dials',
                        'One per line, number and description. They become buttons in the dialer when the account is selected'
                    ]
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: '**Test connection** registers the account without saving and shows the result right away. Use it before saving so you do not keep an account that does not work.'
            }
        ]
    },
    {
        id: 'simulado',
        title: 'Simulated PBX',
        summary: 'A built-in fake PBX, to learn the app and build scenarios without a server or network.',
        blocks: [
            {
                type: 'p',
                text: 'The accounts marked **SIM** talk to a pretend PBX inside the app itself. Registration, calls, DTMF and errors are simulated, but the screen, the log and the scenarios work the same way.'
            },
            {
                type: 'table',
                head: ['Dial', 'What happens'],
                rows: [
                    ['8000', 'An IVR: answers with early media and records the DTMF digits you send'],
                    ['486', 'Busy: the call ends with `486 Busy Here`'],
                    ['408', 'Nobody answers: ends with `408 Request Timeout` after 5 s'],
                    [
                        'Extension of another simulated account',
                        'Rings on that account, as long as it is on the same domain and registered'
                    ],
                    ['Any other number', '`404 Not Found`']
                ]
            },
            {
                type: 'p',
                text: 'With a simulated account selected, the dialer shows **Numbers of the simulated PBX** with this same list.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'The simulated PBX has no real audio or network. The quality shown on the cards is made up and comes marked "(simulado)". To test audio, use a real PBX.'
            }
        ]
    },
    {
        id: 'ligar',
        title: 'Making and receiving calls',
        summary: 'The dialer, the shortcuts, the extra headers and what happens when the extension rings.',
        blocks: [
            { type: 'image', name: 'discador', alt: 'Dialer with the keypad and the SIP headers open' },
            { type: 'h', text: 'Calling' },
            {
                type: 'steps',
                items: [
                    'Under **Dial from**, pick the source account (or click it in the left column).',
                    'Type the number or extension. **Ctrl/Cmd + L** takes the cursor straight to this field.',
                    'Click **Call** or press Enter.'
                ]
            },
            {
                type: 'p',
                text: 'The **Call** button stays greyed out while the source account is not registered; the screen says "Register … to call".'
            },
            { type: 'h', text: 'Dialer features' },
            {
                type: 'list',
                items: [
                    '**Shortcuts**: the buttons with a number and description call with one click. They come from the "Speed dials" of the account and, on the simulated PBX, from the other accounts and the IVR.',
                    '**keypad**: opens a phone keypad to build the number with the mouse, with the call and delete buttons. Holding **0** types **+**.',
                    '**SIP headers**: opens a field to send extra headers in the INVITE, one per line, such as `X-Test-Id: scenario-42`. It is for testing PBX rules that depend on a header.'
                ]
            },
            { type: 'h', text: 'Receiving' },
            {
                type: 'p',
                text: 'When a registered extension rings, Íris plays the ringtone, shows a system notification and creates a card with **Answer** and **Decline**. **Ctrl/Cmd + Enter** answers the call that is ringing. With auto-answer on, the button shows the countdown ("auto in 2 s").'
            },
            {
                type: 'p',
                text: 'On **plain SIP** and simulated accounts, the account can play a WAV file to the caller as soon as the call is answered, such as a welcome message or a recording notice: under Edit → Advanced → **On answering, play to the caller**, pick the file. It plays in place of the microphone and, when it ends, the microphone comes back. It also applies to auto-answer. Use a 16-bit PCM WAV, up to 2 minutes long.'
            },
            { type: 'h', text: 'Several calls at the same time' },
            {
                type: 'p',
                text: 'Each call is a card. A call between two of your extensions shows as two cards: the caller (→ arrow) and the callee (← arrow). Click a card to select it; the keyboard shortcuts act on the selected card.'
            },
            { type: 'h', text: 'Video calls' },
            {
                type: 'p',
                text: 'On **WebRTC** accounts (and on the simulated PBX), the **Video** button, next to Call, places the call with your camera. The callee sees **Answer** (audio only, receiving the picture of the caller) and **Answer with video** (sends the camera too). The card shows the picture of the other side and yours as a thumbnail, and the **Turn camera off** button pauses the picture without dropping the call. The camera is chosen in **Settings › Audio**. Auto-answer never turns the camera on.'
            },
            {
                type: 'list',
                items: [
                    'The PBX has to accept a video codec on the extension. On Asterisk, add `vp8` (or `h264`) to the `allow` of both extensions.',
                    '**Plain SIP** accounts do not do video yet: the button does not show for them.',
                    'On macOS and Windows, the system asks for camera permission on the first video call.',
                    'Phone mode, recording and scenarios do not have video yet.'
                ]
            },
            { type: 'h', text: 'What you hear before they answer' },
            {
                type: 'p',
                text: 'While the other side has not answered, the card says where the sound comes from. **local ringback** is the tone Íris itself plays when the PBX only replies `180 Ringing`. **hearing audio from the PBX** shows with the **early media** state: the PBX replied `183` and is sending its own sound (the carrier ringback, a "number not in service" announcement), and the meter on the card shows that audio arriving. On plain SIP accounts this always applies. On WebRTC accounts you have to turn on **Hear audio from the PBX before answering (early media)** in the account; without the option, the card says the PBX sent audio but the ringback is the local one.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'On WebRTC, leave the early media option off if the PBX forks the call to several destinations (a proxy such as Kamailio ringing several devices): when whoever answers is not the one that sent the audio, the library drops the call. With Asterisk and FreeSWITCH this does not happen.'
            }
        ]
    },
    {
        id: 'chamada',
        title: 'During the call',
        summary: 'Mute, hold, DTMF and the audio quality numbers.',
        blocks: [
            {
                type: 'note',
                kind: 'atenção',
                text: 'On **plain SIP** calls the **Record** button also shows: it records both sides to a WAV file (your side on the left channel, the other on the right) in the `gravacoes` folder of the Íris data, and the log shows the path. The **Recordings** button, next to it, opens that folder; it also opens from **Settings › Audio**. Recording stops on its own when the call ends. Tell the other side before recording: in many places the law requires it.'
            },
            { type: 'image', name: 'dtmf', alt: 'Call card with the DTMF panel open' },
            { type: 'h', text: 'What the card shows' },
            {
                type: 'list',
                items: [
                    '**Top line**: extension of the account, direction, number on the other side, state and time.',
                    '**State**: calling, ringing, early media, in call, on hold, ended or failed.',
                    '**Bottom line**: account name and details such as the last SIP code (`180 Ringing`), mute, transfer in progress, DTMF received and the reason it ended.'
                ]
            },
            { type: 'h', text: 'Buttons' },
            {
                type: 'table',
                head: ['Button', 'What it does', 'Shortcut'],
                rows: [
                    [
                        'Mute / Unmute',
                        'Cuts or restores your microphone. You still hear the other side',
                        'Ctrl/Cmd + M'
                    ],
                    ['Hold / Resume', 'Puts the call on hold on the PBX (re-INVITE) or brings it back', 'Ctrl/Cmd + H'],
                    ['DTMF', 'Opens the panel to send digits', '—'],
                    ['Transfer', 'Opens the transfer panel. See "Transfer"', '—'],
                    ['Hang up', 'Ends the call', 'Ctrl/Cmd + E']
                ]
            },
            { type: 'h', text: 'DTMF: digits and sequences' },
            {
                type: 'p',
                text: 'In the DTMF panel you can click the keypad to send a digit right away, or write a **sequence** and click **Send**. The sequence accepts:'
            },
            {
                type: 'list',
                items: [
                    'Digits `0` to `9`, `*`, `#` and the letters `A` to `D`.',
                    '`w` followed by seconds to wait: `w2` waits 2 s (up to 60).',
                    'Commas and spaces are just separators, for you to organize it.'
                ]
            },
            {
                type: 'p',
                text: 'Example: `1,w2,4321#` sends 1, waits 2 s and sends 4321#. That is how you walk through an IVR: a digit, the pause for the recording, the next digit. **Stop** interrupts a sequence in progress.'
            },
            { type: 'h', text: 'Quality' },
            {
                type: 'p',
                text: 'With the call established, the card shows, updated every 2 s: **quality** (score from 0 to 100), **jitter** (variation of the delay, in ms), **loss** (lost packets, in %), **RTT** (round trip, in ms) and the **codec**. High jitter and loss explain choppy audio; high RTT explains delay in the conversation.'
            }
        ]
    },
    {
        id: 'contatos',
        title: 'Contacts',
        summary: 'The address book: the numbers you use most, with a name, to call with one click.',
        blocks: [
            {
                type: 'p',
                text: 'The **Contacts** tab, next to Phone, keeps the name, number, company, note and, if you want, the account to call from. **+ New contact** adds one; the search finds by name, number, company or note, ignoring accents.'
            },
            {
                type: 'list',
                items: [
                    "**Call** dials from the contact's account; if it is not registered, from the account selected in the dialer. The button is greyed out when neither is online.",
                    'The **star** marks the contact as a favorite: it shows first in the list and becomes a shortcut in the dialer.',
                    'When a contact calls, or when you call them, the call shows the **name** from the address book. So does the history.',
                    'In **History**, **Save contact** creates the contact with the number of the call already filled in.',
                    'While you type in the dialer, the numbers of the address book show up as suggestions.',
                    '**Import CSV** and **Export CSV** take the address book to and from a spreadsheet, with the columns `nome;numero;empresa;observacao;favorito`. Contacts with a number that already exists are not added again.'
                ]
            }
        ]
    },
    {
        id: 'mensagens',
        title: 'Messages',
        summary: 'Text conversation between extensions, through the PBX itself.',
        blocks: [
            {
                type: 'p',
                text: 'The **Messages** tab sends and receives text by SIP MESSAGE, the messaging feature of the protocol itself. It works on WebRTC, plain SIP and simulated accounts, as long as the PBX relays messages between extensions.'
            },
            {
                type: 'steps',
                items: [
                    'Pick the source account in the accounts list.',
                    'On the Messages tab, type the extension under **New conversation** and click the button.',
                    'Write and press **Enter**. Shift+Enter adds a line break.'
                ]
            },
            {
                type: 'list',
                items: [
                    'Each conversation belongs to one account with one extension. The number next to the tab name is the count of unread messages.',
                    'A message that arrives with the conversation closed becomes an on-screen notice and a system notification (you can turn that off in Settings → Notifications).',
                    'If the PBX refuses, the message is marked **not delivered**, with its reply (for example, 404 Not Found).',
                    '**Call** rings the extension of the conversation; **Delete conversation** removes the messages from this machine.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'On WebRTC accounts Íris does not get the confirmation from the PBX: with no error, the message went out, but it may not have arrived. On plain SIP, "not delivered" is what the PBX replied. Messages are kept in messages.json in the data folder, unencrypted, and the text shows in the event log.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'On the simulated PBX, send a message to **8000**: the IVR replies on its own, so you can see the conversation working with a single account. On Asterisk, the extension needs `message_context` pointing to a context with `MessageSend`.'
            }
        ]
    },
    {
        id: 'historico',
        title: 'Call history',
        summary: 'What happened to each call, after its card left the screen.',
        blocks: [
            {
                type: 'p',
                text: 'The **History** tab, next to Phone and Scenarios, lists the ended calls, newest first: the number, the account, the time, how long the conversation lasted and how it ended, with the SIP code when there was a failure (for example `486 Busy Here`).'
            },
            {
                type: 'list',
                items: [
                    '**Call again** dials the same number from the same account and goes back to the Phone tab. It is greyed out if the account is not registered.',
                    '**SIP flow** opens the diagram of the calls of that account. The diagram comes from the log, which only exists while the app is open: for calls from before the app was closed, the list stays, but the diagram does not.',
                    '**Clear history** deletes everything, after confirming.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'The history keeps the 500 most recent calls in `history.json`, in the data folder. Calls made by scenarios are included too.'
            }
        ]
    },
    {
        id: 'transferencia',
        title: 'Transfer',
        summary: 'Blind, to pass the call on right away; attended, to talk to the destination first.',
        blocks: [
            { type: 'image', name: 'transferencia', alt: 'Call card with the transfer panel open' },
            { type: 'h', text: 'Blind' },
            {
                type: 'steps',
                items: [
                    'With the call established, click **Transfer**.',
                    'Type the destination and click **Blind**.',
                    'The PBX gets the request (REFER) and the card shows the progress. When the PBX confirms, your leg of the call ends.'
                ]
            },
            { type: 'h', text: 'Attended (consult first)' },
            {
                type: 'steps',
                items: [
                    'Click **Transfer**, type the destination and click **Consult first**.',
                    'The original call goes on hold and Íris calls the destination. A second card shows up, the consultation one.',
                    'Talk to the destination. The original card shows the "Consultation before transfer" strip.',
                    'Click **Transfer** on that strip to join the two, or **Cancel and go back** to hang up the consultation and resume the original call.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'The log shows the REFER and the notices (NOTIFY) from the PBX. If the transfer fails, the return code stays on the card and in the log.'
            }
        ]
    },
    {
        id: 'log',
        title: 'Log',
        summary: 'Everything that happened, in order, with a filter per account and the raw SIP when you need it.',
        blocks: [
            { type: 'image', name: 'log', alt: 'Log panel on the All tab, with SIP messages' },
            { type: 'h', text: 'Tabs' },
            {
                type: 'list',
                items: [
                    '**Events**: short sentences about what happened ("Registro: registrada", "Chamada para 1002: 180 Ringing"). It is the everyday tab. These lines are written in Portuguese.',
                    '**Raw SIP**: the full SIP messages. Only shows for accounts with **Show raw SIP in the log** on.',
                    '**All**: both mixed together, in the order they happened.'
                ]
            },
            { type: 'h', text: 'Filters' },
            {
                type: 'list',
                items: [
                    '**Account**: shows only the lines of one account. The color of the name is the color of the account.',
                    '**Level**: `debug+` shows everything, including internal detail of the SIP library; `info+` is the default; `warning+` and `error` leave only the problems.',
                    '**Search**: filters by text, for example `486` or `INVITE`.'
                ]
            },
            { type: 'h', text: 'Footer' },
            {
                type: 'list',
                items: [
                    '**Copy**: copies the filtered lines to the clipboard.',
                    '**Save .txt / Save .json**: writes the filtered lines to a file, to attach to a ticket.',
                    '**Clear**: deletes the log of the filtered account, or everything if the filter is "All accounts".',
                    '**Explain with AI**: sends the current excerpt for the AI to explain. See "AI help".',
                    '**SIP flow**: draws the calls as a ladder diagram. See below.',
                    '**Jump to the end**: shows when you scroll up; goes back to following the new lines.'
                ]
            },
            { type: 'h', text: 'SIP flow (ladder diagram)' },
            {
                type: 'image',
                name: 'fluxo',
                alt: 'SIP flow screen with a refused call: INVITE, 100 Trying, 486 Busy Here in red and ACK'
            },
            {
                type: 'p',
                text: 'Shows the raw SIP of each call as arrows between the account and the PBX, in the order the messages went by, with the time since the first one. It needs **Show raw SIP in the log** on in the account.'
            },
            {
                type: 'list',
                items: [
                    '**List on the left**: one row per call (Call-ID), newest first, with the result. Failures show in red. REGISTER and OPTIONS stay hidden until you tick the option.',
                    '**Arrow colors**: blue is a request, grey is a provisional reply (1xx), green is success (2xx), yellow is the password challenge (401 and 407, normal during registration) and red is an error. A dashed arrow is the same message sent again, a sign that the other side did not reply in time.',
                    '**Click an arrow** (or use Tab and Enter) to see the full message below and copy it.',
                    '**Two legs**: tick the box of two calls, for example the one from 1001 calling and the one from 1002 receiving, to see both with the PBX in the middle.',
                    '**Save .html**: writes the drawing and all the messages to a file that opens in any browser, good to attach to a ticket. The file carries no password, Authorization or nonce.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'The log never shows a password, hash or nonce: authentication data is removed before reaching the screen and the files. You can share the saved file, keeping in mind that it has extensions, numbers and addresses.'
            },
            {
                type: 'p',
                text: 'The app keeps up to 50,000 lines in memory and draws the last 1,500; **Copy** and **Save** take all the ones that pass the filter. The log is gone when the app closes.'
            }
        ]
    },
    {
        id: 'saude',
        title: 'Health and diagnostics',
        summary: 'A checklist of the account and the environment, with what to do about each warning.',
        blocks: [
            { type: 'image', name: 'saude', alt: 'Health window of an account with the list of checks' },
            {
                type: 'p',
                text: 'Select the account and click **⋯ → Health**. Íris checks, in order:'
            },
            {
                type: 'table',
                head: ['Check', 'What it says'],
                rows: [
                    [
                        'Registration',
                        'The current state and, on error, the code. With `401`, it suggests checking the password and username'
                    ],
                    ['WebSocket', 'Whether the connection to the PBX is open'],
                    ['OPTIONS', 'Sends an OPTIONS and measures in how many ms the PBX replied'],
                    ['Microphone', 'Whether the system allowed the microphone for the app'],
                    ['Audio outputs', 'How many speakers or headsets were found'],
                    ['TURN', 'Warns when there is no TURN server: behind a symmetric NAT the call may have no audio'],
                    ['Transport', 'Warns if the address is `ws://` (no TLS), which many PBXs refuse for WebRTC']
                ]
            },
            {
                type: 'p',
                text: '✓ is a pass, ✗ is a fail and ! is a warning. **Check again** repeats everything; **Copy report** takes the result as text, ready to paste into a ticket.'
            },
            { type: 'h', text: 'Network' },
            {
                type: 'list',
                items: [
                    '**DNS**: if the domain of the account has SIP SRV records (`_sip._udp`, `_sip._tcp`, `_sips._tcp`), Health lists where they point, with port, priority and weight. Íris does not follow these records when connecting yet: it uses the name and port of the account. If the two do not match, the list shows where the PBX expects the extension.',
                    '**TLS certificate**: on `wss://` and SIP over TLS accounts, it shows who the certificate was issued to, by whom, until when it is valid and for which names. "Untrusted" with the reason (self-signed, expired, different name) is a warning: if you already accepted the host, the account works anyway.',
                    '**STUN**: if the account has a `stun:` server in the STUN / TURN field, it shows with which address and port your network appears from the outside. Compare it with the address the PBX sees in the SIP messages (`received` and `rport` in the Via) to understand a NAT. Without a server on the account, the test does not run: Íris does not query a server you did not choose.'
                ]
            }
        ]
    },
    {
        id: 'telefone',
        title: 'Phone mode',
        summary: 'A narrow window, like a mobile phone, for when you just want to call and answer.',
        blocks: [
            { type: 'image', name: 'telefone', alt: 'Phone mode during a call' },
            {
                type: 'p',
                text: 'The **Phone mode** button, on the top bar, shrinks the window and shows only the essentials. The **Bench** button goes back to the three columns, at the same size as before. The app always opens in the Bench.'
            },
            {
                type: 'table',
                head: ['Screen', 'What shows'],
                rows: [
                    [
                        'Keypad',
                        'The selected account at the top, the number with the name when it is known, the keypad and the green call button'
                    ],
                    [
                        'In call',
                        'Who is on the other side, the time, the quality as bars and the buttons Mute, Hold, Keypad (DTMF), Transfer, Another call and See the log'
                    ],
                    ['Incoming call', 'Takes the whole screen, with Decline and Answer']
                ]
            },
            {
                type: 'list',
                items: [
                    'Change the account from the menu at the top. The dot beside it shows whether it is registered.',
                    'You can type the number on the computer keyboard and call with **Enter**.',
                    'Hover over the bars to see the quality in numbers (jitter, loss, RTT and codec).',
                    '**Another call** goes back to the keypad without hanging up; the calls in progress are listed below and come back with one click.',
                    'Transfer in Phone mode is the blind one. For the attended one, use the Bench.'
                ]
            }
        ]
    },
    {
        id: 'configuracoes',
        title: 'Settings',
        summary: 'Your profile, the colors of Íris and the general preferences, on a single screen.',
        blocks: [
            { type: 'image', name: 'configuracoes', alt: 'Settings screen open on Appearance' },
            {
                type: 'p',
                text: 'Open it with the **Settings** button on the top bar or with **Ctrl+,** (on macOS, **Cmd+,**). The sections are on the left; the up and down arrows change section. Everything is saved right away.'
            },
            {
                type: 'table',
                head: ['Section', 'What is there'],
                rows: [
                    [
                        'Profile',
                        'Your name, which comes as the display name of new accounts, and the main account, which stays selected in the dialer on opening'
                    ],
                    [
                        'Appearance',
                        'The theme (dark, light or the system one), the accent color (six ready-made palettes or your own color), the language (Portuguese or English), compact lists and the interface size'
                    ],
                    ['Audio', 'Microphone and speaker. See "Audio"'],
                    [
                        'Notifications',
                        'Which system notifications show and the button to test them. See "Tray and notifications"'
                    ],
                    ['Servers', 'The registered PBXs, for accounts to reuse the connection. See "Accounts"'],
                    [
                        'Connection',
                        'How many times Íris tries to register again after a drop, with growing waits (2 s, 4 s, 8 s, up to 1 minute). The default is 10; with 0 it never gives up'
                    ],
                    ['AI help', 'The OpenRouter key, the default model and masking. See "AI help"'],
                    [
                        'Certificates',
                        'The PBXs with a self-signed certificate that you accepted, with the option to remove them'
                    ],
                    [
                        'Import and export',
                        'Take the accounts to another machine. See "Importing and exporting accounts"'
                    ],
                    ['Update', 'The installed version and the check for a new one. See "Update"']
                ]
            },
            { type: 'h', text: 'Theme and density' },
            {
                type: 'p',
                text: "In **Appearance**, the **Theme** can be Dark (the default), Light or **System**, which follows your computer's light or dark mode and switches on its own. **Compact lists** makes the rows of accounts, history and contacts shorter, to fit more on screen."
            },
            { type: 'h', text: 'Accent color' },
            {
                type: 'p',
                text: 'The color shows on the main buttons, the tabs and the keyboard focus outline. Click one of the dots to use a ready-made palette, or the **+** to pick any color. The buttons darken the color as much as needed for the white text to stay readable.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'The ready-made palettes avoid green, yellow and red, because those colors already tell the state of accounts and calls. If the color you pick looks faded against the dark background, the screen warns you.'
            }
        ]
    },
    {
        id: 'audio',
        title: 'Audio',
        summary: 'Pick the microphone and the speaker and check that both work.',
        blocks: [
            { type: 'p', text: 'It is in **Settings › Audio**.' },
            { type: 'image', name: 'audio', alt: 'Audio section with microphone, meter and speaker' },
            {
                type: 'list',
                items: [
                    '**Microphone**: pick the device. The bar below moves when you speak; if it does not, the microphone is muted or lacks permission.',
                    '**Speaker**: pick where the call audio and the ringtone come out.',
                    '**Play test sound**: plays a beep on the selected speaker.',
                    '**Ringtone volume**: how loud an incoming call rings. "Listen" plays it once. The sound itself belongs to each account: under Edit → **Ringtone for incoming calls**, pick Classic, Digital, Soft, Bell or None, so you know which line is ringing without looking at the screen.'
                ]
            },
            {
                type: 'p',
                text: 'The change applies right away, including to calls in progress, and is kept for next time. Use it to test a Bluetooth headset, a USB headset and speakers without dropping the call.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'On macOS and Windows, the system asks for microphone permission the first time. If you denied it, allow it in the system privacy settings and open Settings › Audio again.'
            }
        ]
    },
    {
        id: 'cenarios',
        title: 'Scenarios',
        summary: 'Test scripts that Íris runs on its own, step by step, as many times as you want.',
        blocks: [
            { type: 'image', name: 'cenarios', alt: 'Scenarios tab with the IVR example run' },
            {
                type: 'p',
                text: 'A scenario is a list of steps. Íris runs them one by one, marks each as passed (✓) or failed (✗) and shows how long it took. Use it to repeat the same test after every change on the PBX.'
            },
            { type: 'h', text: 'Start with the example' },
            {
                type: 'steps',
                items: [
                    'Open the **Scenarios** tab, next to **Phone**.',
                    'Click **+ IVR example**. It creates: register, dial 8000, wait for "in call", wait 2 s, send 1234 and hang up.',
                    'Pick the **Source account** and click **Run**.'
                ]
            },
            { type: 'h', text: 'Step types' },
            {
                type: 'table',
                head: ['Step', 'What it does'],
                rows: [
                    ['Register', 'Registers the account (the source one or another) and waits until it is registered'],
                    ['Dial', 'Calls a number and gives the call an alias, such as `c1`'],
                    ['Answer', 'Answers a call that is ringing on an account and gives it an alias'],
                    ['Wait', 'Waits a fixed time, in seconds'],
                    [
                        'Wait for state',
                        'Waits for the call to reach a state (calling, early media, in call, on hold, ended) up to a limit. Fails if the call ends first, showing the code'
                    ],
                    ['DTMF', 'Sends a sequence of digits, with the same syntax as the call card'],
                    ['Transfer', 'Transfers the call to a destination'],
                    ['Hang up', 'Ends the call'],
                    ['Verify', 'Checks a SIP code, the DTMF received or a text in the log'],
                    ['Play tone', 'Plays a tone (frequency and length) on the call, in place of the microphone'],
                    ['Play WAV file', 'Plays a 16-bit PCM WAV file, up to 2 minutes long'],
                    [
                        'Wait for audio',
                        'Passes when audio arrives on the call; fails if it stays silent until the timeout'
                    ],
                    ['Wait for silence', 'Passes when the audio stops; fails if it keeps arriving until the timeout']
                ]
            },
            { type: 'h', text: 'Monitor: leave a scenario on watch' },
            {
                type: 'p',
                text: 'Tick **Monitor** at the top of the scenario and give the interval in minutes: Íris starts running it on its own, with the app open or in the tray. It only notifies when the result **changes**: a system notification and a log line when the scenario starts failing, and another when it passes again. While it keeps failing, it does not repeat the notice.'
            },
            {
                type: 'list',
                items: [
                    'In the **webhook** field you can put an `http://` or `https://` address. On each change, Íris sends a `POST` with JSON: `event` (`failed` or `recovered`), `scenario`, `failedStep`, `message`, `durationMs` and `at`. Use it to post to a chat channel or open a ticket.',
                    'Beside it you see the time of the last run and of the next one.',
                    'If you are running another scenario at that moment, the monitor waits for it to finish.',
                    'The monitor only runs with Íris open. To keep watch with nobody logged in, use the command line in a scheduler (cron).'
                ]
            },
            { type: 'h', text: 'The same script for several accounts' },
            {
                type: 'p',
                text: 'In the number, digits and expected value fields you can write `{ramal}`, `{dominio}` and `{nome}`: at run time they become the extension, domain and name of the **source account** of the scenario. That way a script like "dial `*97`, send `{ramal}#`" works for any extension: change the source account at the top of the scenario or, on the command line, use `--conta`.'
            },
            { type: 'h', text: 'Checking the audio' },
            {
                type: 'p',
                text: 'The right SIP code does not guarantee there is sound: a silent call, or one with audio on one side only, completes just the same. The audio steps catch that. A typical script against an echo number: **Dial**, **Wait for state** in call, **Play tone** for 1 s and **Wait for audio**. If the tone does not come back, the step fails and shows the measured level.'
            },
            {
                type: 'list',
                items: [
                    '**Wait for audio** and **Wait for silence** work on any account. The line between the two is −50 dBFS, and the step requires three readings in a row, so that a click does not count as audio.',
                    '**Play tone** and **Play file** only work on **plain SIP** accounts and on the **simulated PBX**: on WebRTC Íris does not replace what the microphone sends, and the step fails saying so.',
                    'While a tone or file plays, the microphone does not go into the call.',
                    'The WAV file stays where it is on disk; the scenario keeps only the path. When you take the scenario to another machine, take the file along.'
                ]
            },
            {
                type: 'p',
                text: 'The **aliases** connect the steps: "Dial … as c1" creates the call c1, and the following steps pick c1 to act on it. With two aliases you test a call between two of your extensions: one step dials, another answers.'
            },
            { type: 'h', text: 'Editing' },
            {
                type: 'list',
                items: [
                    '**+ Step** adds a step of the type selected beside it.',
                    'The **↑ ↓** arrows change the order and the **✕** removes the step.',
                    'Each step can use the source account or another account.',
                    '**+ New**, **Duplicate** and **Delete** manage the scenarios. Everything is saved on its own at each edit.'
                ]
            },
            { type: 'h', text: 'Repeat and measure' },
            {
                type: 'p',
                text: 'Type a number next to **Run** and click **Repeat N×**. At the end the report shows: success rate, how many passed, average time and p95 (the time that 95% of the runs did not exceed). **Report .txt** and **Report .json** save the result. **Stop** interrupts.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'A scenario that passes 20 times in a row is a good criterion to say an IVR or a route is stable.'
            }
        ]
    },
    {
        id: 'linha-de-comando',
        title: 'Command line',
        summary: 'Run scenarios without opening the window, for automated tests and CI.',
        blocks: [
            {
                type: 'p',
                text: 'The same app runs scenarios from the terminal. It writes the result of each step, saves the report if you ask and exits with a code your script can check.'
            },
            {
                type: 'code',
                text: 'iris --scenario "URA 8000" --runs 20 --report result.json'
            },
            {
                type: 'table',
                head: ['Option', 'What it does'],
                rows: [
                    ['--scenario <name|id>', 'Scenario to run. You can repeat the option to run several'],
                    ['--all', 'Runs all scenarios'],
                    ['--runs <n>', 'Repeats each scenario n times (default 1)'],
                    [
                        '--report <file>',
                        'Saves the report as `.json`, `.txt` or `.xml`. The `.xml` comes in the JUnit format, which CI systems show as a list of tests'
                    ],
                    [
                        '--account <account>',
                        'Runs the scenario with this source account (id, name or `extension@domain`) instead of the one in it. Repeat the option to run once with each account'
                    ],
                    [
                        '--accounts <file>',
                        'Uses accounts from a file exported by Íris, with passwords. It neither reads nor changes your data'
                    ],
                    ['--scenarios <file>', 'Uses a scenarios file instead of the ones saved in the app'],
                    ['--trust-host <host>', 'Accepts the self-signed certificate of that host. Can be repeated'],
                    ['--fake-media', 'Uses a fake microphone, for machines without a sound card'],
                    ['--help', 'Shows the help']
                ]
            },
            {
                type: 'p',
                text: 'Exit codes: **0** everything passed, **1** some step failed, **2** usage or configuration error. The Portuguese names work too (`--cenario`, `--todos`, `--vezes`, `--relatorio`, `--conta`, `--contas`, `--cenarios`, `--confiar-host`, `--midia-falsa`, `--ajuda`). The output of the command line is written in Portuguese.'
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'On Linux without a display, run it with `xvfb-run -a`. The command-line mode can run with the app open and does not check for updates.'
            }
        ]
    },
    {
        id: 'importar',
        title: 'Importing and exporting accounts',
        summary: 'Take the accounts to another machine or hand them to a colleague.',
        blocks: [
            { type: 'p', text: 'It is in **Settings › Import and export**.' },
            { type: 'image', name: 'importar', alt: 'Import and export accounts section' },
            { type: 'h', text: 'Export' },
            {
                type: 'p',
                text: 'Saves all accounts to a JSON file. By default the **passwords do not go** in the file: whoever imports it types the password of each account. Tick **Include passwords in plain text in the file** only when you need to, for example to use with `--accounts` on the command line.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'A file with passwords lets someone register your extensions. Keep and share it with the same care as a password.'
            },
            { type: 'h', text: 'Import' },
            {
                type: 'p',
                text: 'Reads a file exported by Íris. Accounts with the same id are replaced; the others are added. After importing, use **All → Register all** to put the new accounts online.'
            },
            { type: 'h', text: 'Import spreadsheet (CSV)' },
            {
                type: 'p',
                text: 'To add many extensions at once, build a spreadsheet, save it as CSV and use **Choose spreadsheet**. The first row names the columns (in Portuguese, as below); the accounts come in the following rows:'
            },
            {
                type: 'code',
                text: 'nome;ramal;dominio;senha;transporte;endereco\nSupport 1001;1001;pbx.company.com;secret;ws;wss://pbx.company.com:8089/ws\nQueue 2001;2001;10.0.0.5;secret;udp;10.0.0.5:5060'
            },
            {
                type: 'list',
                items: [
                    '**transporte** (transport): `ws` (WebSocket, the default), `udp`, `tcp` or `tls`.',
                    '**endereco** (address): the WebSocket (`wss://…`) or, for plain SIP, the host and port. For plain SIP it can be empty.',
                    'Optional columns: **usuario** (authentication username), **auto-atender** (auto-answer) and **srtp** (`sim` turns it on).',
                    'The separator can be a semicolon, a comma or a tab. Up to 1000 accounts at a time.',
                    'If one row is wrong, **no account is created** and the screen says which row and why.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'The spreadsheet has the passwords in plain text. Delete the file after importing.'
            }
        ]
    },
    {
        id: 'certificados',
        title: 'Certificates',
        summary: 'What to do when the PBX uses a self-signed certificate.',
        blocks: [
            {
                type: 'p',
                text: 'Íris refuses any invalid TLS certificate. Lab PBXs often use a self-signed certificate, so the first registration attempt fails and a red strip shows at the top: "The TLS certificate of … was refused".'
            },
            {
                type: 'list',
                items: [
                    '**Trust this host**: accepts the certificate **of that host only** and registers again the accounts that use it. The choice is kept.',
                    '**Ignore**: closes the strip without accepting. The account stays unregistered.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Only trust a host that is yours. Accepting the certificate of an unknown server lets someone in the middle read the signaling and the extension password.'
            }
        ]
    },
    {
        id: 'ia',
        title: 'AI help',
        summary: 'Ask an AI model to explain the log, a call or a registration failure.',
        blocks: [
            { type: 'image', name: 'ia', alt: 'AI help window with the text preview and the reply' },
            {
                type: 'p',
                text: 'It is optional and uses **your OpenRouter key** (create it at openrouter.ai/keys). Usage is charged to your account there. Without a key, nothing is sent.'
            },
            { type: 'h', text: 'Where to ask' },
            {
                type: 'list',
                items: [
                    '**Explain with AI**, in the log footer: uses the lines of the current filter.',
                    '**Explain with AI**, on the card of an ended call: uses the log of that account during the call.',
                    '**Why did it fail?**, on an account in error: uses the last lines of the account.'
                ]
            },
            { type: 'h', text: 'How to use it' },
            {
                type: 'steps',
                items: [
                    'The first time, paste the key and click **Save key**.',
                    'Pick the **Model**. The list comes from OpenRouter; the initial suggestion is a Claude Sonnet.',
                    'Read the **Text that will be sent**. That is exactly what leaves your machine, plus a fixed instruction on how to answer.',
                    'Click **Send to OpenRouter** and wait for the reply, which comes in three parts: what happened, likely cause and what to do. The reply is written in Portuguese.'
                ]
            },
            { type: 'h', text: 'What leaves your machine' },
            {
                type: 'list',
                items: [
                    '**Masking on (default)**: extensions, numbers, IPs, domains and account names become placeholders such as `[NÚMERO-1]` and `[HOST-1]`. The SIP conversation stays readable, but without your data.',
                    '**Masking off**: the text goes as it shows in the preview. Useful when the explanation depends on a specific number or address.',
                    '**Passwords and authentication data are never sent**, with or without masking.',
                    'At most the 400 newest lines of the excerpt go.'
                ]
            },
            {
                type: 'note',
                kind: 'atenção',
                text: 'Masking covers what the app recognizes. Free text inside a SIP header may get through; that is why the preview exists. And the AI can be wrong: check the explanation against the log before changing the PBX.'
            },
            {
                type: 'p',
                text: 'The key is kept in the Íris passwords file, encrypted, is never shown again and is left out of exports. **Remove key** deletes it.'
            }
        ]
    },
    {
        id: 'atualizacao',
        title: 'Update',
        summary: 'How Íris looks for, downloads and installs new versions.',
        blocks: [
            { type: 'p', text: 'It is in **Settings › Update**.' },
            { type: 'image', name: 'atualizacao', alt: 'Update section' },
            {
                type: 'list',
                items: [
                    'The installed app checks for a new version shortly after opening and when you open **Settings › Update**.',
                    '**Nothing is downloaded on its own.** When there is a new version, the "Update available" button shows on the bar and you decide to click **Download**.',
                    'Once downloaded, the version takes effect when the app restarts. **Restart and install** does it right away and stays off while there is an active call.'
                ]
            },
            { type: 'h', text: 'Channels' },
            {
                type: 'list',
                items: [
                    '**Stable**: only the final versions.',
                    '**Beta**: also the test versions (such as `1.2.0-beta.1`), for those who want to try them early.'
                ]
            },
            { type: 'h', text: 'Where it works' },
            {
                type: 'table',
                head: ['System', 'Automatic update'],
                rows: [
                    ['Windows', 'Yes'],
                    ['Linux, AppImage', 'Yes'],
                    ['Linux, .deb', 'No: download and install the `.deb` of the new version'],
                    [
                        'macOS',
                        'Yes. Since the app has no Apple signature, Íris itself downloads the file, checks it (SHA-512) and swaps itself on restart, without the Apple warning. If it fails, the screen shows a command to paste into the Terminal'
                    ]
                ]
            }
        ]
    },
    {
        id: 'bandeja',
        title: 'Tray and notifications',
        summary: 'The app keeps working with the window closed.',
        blocks: [
            {
                type: 'list',
                items: [
                    '**Closing the window only hides it.** The extensions stay registered and the calls go on.',
                    'The **tray icon** (notification area) brings the window back with one click and has the **Mostrar Íris** (show) and **Sair** (quit) menu.',
                    'The **icon color** tells the overall state: grey with no account registered, green with registered accounts, yellow with a call ringing, blue in a call and red when some account is in error. Hovering over it shows the numbers.',
                    '**Sair** (quit) really closes the app: the extensions go offline and the calls drop.',
                    'An **incoming call** raises a system notification, with **Atender** (answer) and **Recusar** (decline) on the notification itself (on macOS); clicking it opens the window. In the Bench, it also shows on a colored strip at the top of the middle column.',
                    'These also notify: **missed call**, **account dropped**, new **voicemail**, **text message** and a **monitored scenario** that failed or passed again. In **Settings → Notifications** you choose which ones you want, can make an incoming call bring the window to the front and have the **Test notification** button.',
                    'Nothing shows? On macOS, check in **System Settings → Notifications → Iris** whether notifications are allowed and **Do Not Disturb** is off. Auto-answer accounts do not notify of incoming calls.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Some Linux environments have no notification area. In that case, closing the window quits the app.'
            }
        ]
    },
    {
        id: 'atalhos',
        title: 'Keyboard shortcuts',
        summary: 'The most common actions without taking your hands off the keyboard.',
        blocks: [
            {
                type: 'table',
                head: ['Shortcut', 'What it does'],
                rows: [
                    ['Ctrl/Cmd + L', 'Goes to the Phone tab and puts the cursor in the number field'],
                    ['Ctrl/Cmd + Enter', 'Answers the call that is ringing'],
                    ['Ctrl/Cmd + E', 'Hangs up the selected call'],
                    ['Ctrl/Cmd + M', 'Mutes or unmutes the selected call'],
                    ['Ctrl/Cmd + H', 'Puts the selected call on hold or resumes it'],
                    ['Ctrl/Cmd + 1 to 9', 'Selects the account at that position in the list'],
                    [
                        'Ctrl/Cmd + K',
                        'Opens the command palette: type a number, a contact, an account, a scenario or an action and press Enter'
                    ],
                    ['F1', 'Opens this guide'],
                    ['Esc', 'Closes whatever window is open on top']
                ]
            },
            {
                type: 'p',
                text: '"Selected call" is the card you clicked last. On macOS use Cmd; on Windows and Linux, Ctrl.'
            },
            { type: 'h', text: 'Global shortcuts' },
            {
                type: 'p',
                text: 'The shortcuts above only work with the Íris window in focus. To **answer, hang up and mute with another program in front**, set global shortcuts in **Settings → Shortcuts and links**: click "Set shortcut" and press the combination. It needs Ctrl, Alt, Cmd or Win, or has to be a function key. If the system refuses it (another program already uses it), the screen tells you.'
            },
            { type: 'h', text: 'Headset button' },
            {
                type: 'p',
                text: 'Turn on **Headset button** on the same screen to answer and hang up with the button on your headset. It sends the Play/Pause key, which Íris only uses while a call is ringing or in progress; outside that the key keeps pausing your music. On macOS, the system only hands this key to programs allowed in System Settings → Privacy & Security → Accessibility.'
            },
            { type: 'h', text: 'Phone links' },
            {
                type: 'p',
                text: 'On the same screen, turn on **Open tel: links with Íris** (and, if you want, the sip: links). From then on, clicking a number on a web page or in your CRM opens Íris with the number in the dialer of the selected account; press Enter to call.'
            },
            {
                type: 'note',
                kind: 'atenção',
                text: '"Call right away, without confirming" places the call as soon as the link arrives. Any web page can carry one of these links, including to premium-rate numbers: leave it off if you browse outside your company systems.'
            }
        ]
    },
    {
        id: 'dados',
        title: 'Your data and security',
        summary: 'Where Íris keeps things and what it never does.',
        blocks: [
            {
                type: 'table',
                head: ['What', 'Where it is'],
                rows: [
                    ['Accounts (without password)', '`accounts.json`, in the data folder'],
                    [
                        'Extension passwords and AI key',
                        '`senhas.json`, encrypted with its own key (`chave-local.bin`); both can only be read by your system account'
                    ],
                    ['Scenarios', '`scenarios.json`'],
                    ['Call history', '`history.json`, with the 500 most recent'],
                    ['Contacts and servers', '`contacts.json` and `servers.json`'],
                    [
                        'Call recordings',
                        '`gravacoes` folder: one WAV file per recording, unencrypted. They only exist if you click Record'
                    ],
                    ['Preferences', '`settings.json`: audio, update channel, trusted hosts, AI options'],
                    ['Account log (events and SIP)', 'Only in memory, until the app closes or you save it'],
                    [
                        'Internal app log',
                        '`logs` folder: `iris.log` and up to four older ones, 10 MB each. It keeps only the failures of the app itself (errors, channels that failed), to investigate a defect. It has no SIP or password'
                    ]
                ]
            },
            {
                type: 'p',
                text: 'The data folder is `~/Library/Application Support/Iris` on macOS, `%APPDATA%\\Iris` on Windows and `~/.config/Iris` on Linux.'
            },
            { type: 'h', text: 'What Íris does not do' },
            {
                type: 'list',
                items: [
                    'It does not store passwords in plain text: the passwords file is encrypted. Whoever has the whole data folder, though, can read the passwords; treat that folder as confidential.',
                    'It does not delete a damaged file. Passwords, accounts, scenarios or preferences that cannot be read are set aside, with the date in the name, and the screen tells you. The app opens anyway.',
                    'It does not put a password, hash or nonce in the log, on screen or in saved files.',
                    'It sends nothing out beyond what you ask for: registration and calls with your PBX, the update check on GitHub and, if you use it, the preview text to OpenRouter.',
                    'It does not accept an invalid certificate unless you say so, and only for the chosen host.'
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'Íris does not use the system password vault (the macOS Keychain), so the system does not ask for your login password on opening. If that prompt shows on an old version, update to 1.6.1 or newer.'
            }
        ]
    },
    {
        id: 'problemas',
        title: 'Common problems',
        summary: 'The symptom, the most likely cause and what to do.',
        blocks: [
            {
                type: 'table',
                head: ['Symptom', 'Likely cause', 'What to do'],
                rows: [
                    [
                        'Account in error `401` or `403`',
                        'Wrong password, extension or authentication username; or the extension does not accept WebRTC',
                        'Check the details under Edit. On the PBX, see whether the extension has WebRTC on'
                    ],
                    [
                        '"TLS certificate refused" strip',
                        'Self-signed or expired certificate',
                        'If the PBX is yours, click Trust this host'
                    ],
                    [
                        'Account in error "WebSocket closed" or `1006`',
                        'Wrong WSS address, closed port, or the PBX took too long to reply',
                        'Check the address and port; run Health; click Register again'
                    ],
                    [
                        'Stuck on "connecting"',
                        'The PBX does not reply at the given address',
                        'Test the WSS address; check the firewall and whether the WebSocket service is on at the PBX'
                    ],
                    [
                        'The call connects but has no audio',
                        'NAT without TURN, or microphone without permission',
                        'Run Health. Add a TURN server under Advanced. Check Settings › Audio'
                    ],
                    [
                        'The IVR does not recognize the digits',
                        'DTMF mode different from what the PBX expects',
                        'Switch the DTMF mode of the account between SIP INFO and RTP'
                    ],
                    [
                        'The "Raw SIP" tab is empty',
                        'The option is not on in the account',
                        'Edit the account and tick Show raw SIP in the log'
                    ],
                    [
                        'Call button greyed out',
                        'The source account is not registered',
                        'Register the account or pick another one under Dial from'
                    ],
                    [
                        'macOS asks for the Keychain password on opening',
                        'A version older than 1.6.1, which still used the system password vault',
                        'Update Íris. Since 1.6.1 it does not use the Keychain'
                    ],
                    [
                        'The PBX only has SIP over UDP or TCP',
                        'The account was created with the WebSocket transport',
                        'Edit the account and pick the SIP over UDP, TCP or TLS transport'
                    ]
                ]
            },
            {
                type: 'note',
                kind: 'dica',
                text: 'When the reason is not clear, turn on **Show raw SIP in the log** in the account, repeat the test and read the **All** tab. If you want, ask for the explanation with **Explain with AI**.'
            }
        ]
    }
]
