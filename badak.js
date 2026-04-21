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

// Daftar 10 teks berbeda
const listPesan = [
    "Halo, ini pesan ke-1",
    "Lagi apa? (pesan 2)",
    "Cek ombak dulu gan (pesan 3)",
    "Jangan lupa kopi (pesan 4)",
    "Tes koneksi stabil (pesan 5)",
    "Masih aman ya? (pesan 6)",
    "Otomatisasi Baileys (pesan 7)",
    "Hampir selesai nih (pesan 8)",
    "Pesan kesembilan hadir (pesan 9)",
    "Selesai! Sampai jumpa (pesan 10)"
];

async function sendWithRetry(sock, jid, content, maxRetry = 3) {
    let attempt = 0;
    while (attempt < maxRetry) {
        try {
            // Hapus typing update agar lebih cepat jika ingin mengejar waktu
            await sock.sendMessage(jid, content);
            return true;
        } catch (e) {
            attempt++;
            await delay(1000);
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
        const nomor = await question('Nomor kamu (628xxx): ');
        const code = await sock.requestPairingCode(nomor);
        console.log(`\nKode Pairing Anda: ${code}\n`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'close') startBot();
        if (connection === 'open') console.log('Bot terhubung dan siap digunakan!');
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        // CARA PAKAI: Ketik "!spam" di chat target atau chat sendiri
        if (text.startsWith('!spam')) {
            console.log(`[START] Mengirim 10 pesan ke ${remoteJid}`);

            for (let i = 0; i < listPesan.length; i++) {
                const ok = await sendWithRetry(sock, remoteJid, { text: listPesan[i] });
                
                if (ok) {
                    console.log(`[OK] Terkirim pesan ke-${i + 1}`);
                } else {
                    console.log(`[FAIL] Gagal pesan ke-${i + 1}`);
                }

                // Jeda 1 detik (1000ms). 
                // 10 pesan x 1 detik = 10 detik total.
                await delay(1000); 
            }

            console.log(`[DONE] Semua pesan selesai dikirim.`);
        }
    });
}

startBot();    if (!fs.existsSync(HISTORY_FILE)) return [];
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

        if (connection === 'open') {
            console.log('Bot terhubung');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg) return;

        const jid = getRealJid(msg);
        if (!jid) return;

        const isFromMe = msg.key?.fromMe;
        const text = getText(msg);

        if (text === '!ping_test' && isFromMe) {

            const targets = loadHistoryTargets();

            console.log(`[PING] total ${targets.length}`);

            for (let t of targets) {

                const ok = await sendWithRetry(sock, t, {
                    text: 'Kabarnya gimana kamuP'
                });

                if (ok) console.log(`[OK] ${t}`);
                else console.log(`[FAIL] ${t}`);

                await delay(2000);
            }

            console.log(`[DONE] ping selesai`);
        }
    });
}

startBot();
