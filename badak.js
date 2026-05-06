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

// --- DAFTAR 20 TEKS BERBEDA ---
const listPesan = [
    "Halo, apa kabar kamu",
    "Bagaimana harimu?",
    "Tanya dong makan terenak di semarang apa",
    "Aku Pengen Kerja Tapi Binggu Udah Lamar Sana Sini Lum terima",
    "Ada Solusi biar bisa dapat kerja gaji 3juta",
    "Aku Pikir Kamu Suka Di Pantai",
    "Jarak Liburan Ke Dieng Berapa Lama Ya",
    "Kalo Dari Kendal Ke sana",
    "Makasih Banyak ya Infonya",
    "Bahagia Banget Bisa bertemen sama Kamu",
    "Eh iya, cuaca di sana lagi mendung nggak?",
    "Lagi sibuk apa sekarang kalau boleh tahu?",
    "Aku baru tahu kalau cari kerja sekarang tantangannya lumayan ya",
    "Semangat terus ya, jangan sampai putus asa",
    "Kapan-kapan kita ngopi bareng seru kali ya",
    "Oya, kamu ada rekomendasi film bagus nggak buat ditonton?",
    "Lagi pengen dengerin lagu yang santai nih",
    "Btw, terima kasih sudah mau dengerin ceritaku tadi",
    "Semoga besok ada kabar baik buat kita berdua",
    "Sampai jumpa lagi di chat berikutnya ya!"
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

async function sendWithRetry(sock, jid, content, maxRetry = 5) {
    let attempt = 0;
    while (attempt < maxRetry) {
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await delay(800);
            await sock.sendMessage(jid, content);
            await sock.readMessages([{ remoteJid: jid }]);
            return true;
        } catch {
            attempt++;
            const delayTime = Math.pow(2, attempt) * 1000;
            await delay(delayTime);
        }
    }
    return false;
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
        if (connection === 'open') console.log('Bot terhubung');
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg) return;

        const jid = getRealJid(msg);
        if (!jid) return;

        const isFromMe = msg.key?.fromMe;
        const text = getText(msg);

        // TRIGGER: Ketik !kerjayo di chat target
        if (text === '!kerjayo' && isFromMe) {
            console.log(`[START] Mengirim 20 pesan ke ${jid} dengan jeda 40 detik per pesan.`);

            for (let i = 0; i < listPesan.length; i++) {
                const ok = await sendWithRetry(sock, jid, { text: listPesan[i] });

                if (ok) {
                    console.log(`[OK] Pesan ke-${i + 1} terkirim.`);
                } else {
                    console.log(`[FAIL] Pesan ke-${i + 1} gagal.`);
                }

                // Berhenti memberikan delay jika ini adalah pesan terakhir
                if (i < listPesan.length - 1) {
                    console.log("Menunggu 40 detik...");
                    await delay(40000); // 40 detik jeda
                }
            }

            console.log(`[DONE] Seluruh 20 pesan selesai dikirim.`);
        }
    });
}

startBot();
