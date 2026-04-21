console.debug = () => {};
console.info = () => {};
console.warn = () => {};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
    const str = chunk.toString();
    if (str.includes('Closing session')) return;
    if (str.includes('SessionEntry')) return;
    return originalStdoutWrite(chunk, encoding, callback);
};

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const readline = require('readline');

const delay = ms => new Promise(res => setTimeout(res, ms));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise(resolve => rl.question(text, resolve));

// --- DAFTAR 10 TEKS BERBEDA ---
const listPesan = [
    "Halo, ini pesan ke-1",
    "Lagi apa di sana? (2)",
    "Cek ombak dulu ya (3)",
    "Jangan lupa istirahat (4)",
    "Tes koneksi otomatis (5)",
    "Sudah masuk pesannya? (6)",
    "Running on Termux (7)",
    "Hampir selesai bos (8)",
    "Pesan ke-9 terkirim (9)",
    "Selesai! 10 pesan tuntas (10)"
];

const HISTORY_FILE = './nomor_testing.txt';

function loadHistoryTargets() {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return fs.readFileSync(HISTORY_FILE, 'utf-8')
        .split('\n')
        .filter(x => x.trim().endsWith('@s.whatsapp.net'));
}

function getRealJid(msg) {
    if (msg.key?.remoteJid?.endsWith('@s.whatsapp.net')) return msg.key.remoteJid;
    if (msg.key?.remoteJidAlt?.endsWith('@s.whatsapp.net')) return msg.key.remoteJidAlt;
    return null;
}

function getText(msg) {
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.interactiveMessage?.body?.text ||
        ""
    );
}

// Optimasi Fungsi Kirim: Tanpa delay tambahan agar bisa 1 detik per pesan
async function quickSend(sock, jid, content) {
    try {
        // Kita hapus 'composing' agar tidak membuang waktu
        await sock.sendMessage(jid, content);
        return true;
    } catch (e) {
        return false;
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        const nomor = await question('Nomor (628xxx): ');
        const code = await sock.requestPairingCode(nomor);
        console.log(`Pairing code: ${code}`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'close') startBot();
        if (connection === 'open') console.log('Bot terhubung!');
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg) return;

        const jid = getRealJid(msg);
        if (!jid) return;

        const isFromMe = msg.key?.fromMe;
        const text = getText(msg);

        // TRIGGER: Ketik !spam di chat target atau nomor sendiri
        if (text === '!spam' && isFromMe) {
            console.log(`[START] Mengirim 10 pesan ke ${jid}`);

            for (let i = 0; i < listPesan.length; i++) {
                const startTime = Date.now();
                
                const ok = await quickSend(sock, jid, { text: listPesan[i] });
                
                if (ok) console.log(`[${i + 1}] Terkirim: ${listPesan[i]}`);
                else console.log(`[${i + 1}] Gagal mengirim.`);

                // Menghitung sisa waktu agar pas 1 detik (1000ms)
                const endTime = Date.now();
                const executionTime = endTime - startTime;
                const remainingDelay = Math.max(0, 1000 - executionTime);
                
                await delay(remainingDelay);
            }

            console.log(`[DONE] 10 pesan selesai dalam ~10 detik`);
        }
    });
}

startBot();
