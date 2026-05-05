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

// --- DAFTAR 15 TEKS BERBEDA ---
const listPesan = [
    "Apa Kabar nih",
    "alhamdulillah baik banget?",
    "Tanya dong makan terenak di surabaya apa",
    "Aku Pengen makan seafood enak di surabaya di mana ya",
    "Ada recomend barang antik biar bisa laku gede",
    "Aku Pikir Kamu Suka Di gunung",
    "Jarak Liburan Ke Dieng Berapa Lama Ya",
    "Kalo Dari semarang Ke sana",
    "Makasih Banyak ya Infonya",
    "aku mau tawarkan barang",
    "ada tamiya original kamu mau tidak",
    "seri magmum saber dari jepang",
    "kalo mau bisa hubungin aku ya",
    "tak kasih harga special",
    "Sampai jumpa di lain waktu ya!"
];

function getRealJid(msg) {
    if (msg.key?.remoteJid?.endsWith('@s.whatsapp.net')) return msg.key.remoteJid;
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

async function sendWithRetry(sock, jid, content, maxRetry = 3) {
    let attempt = 0;
    while (attempt < maxRetry) {
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await delay(1500); // Simulasi mengetik sebentar
            await sock.sendMessage(jid, content);
            return true;
        } catch (e) {
            attempt++;
            await delay(2000);
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
        const nomor = await question('Nomor (Contoh: 62812345678): ');
        const code = await sock.requestPairingCode(nomor);
        console.log(`\nSilahkan masukkan pairing code ini di WhatsApp: ${code}\n`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'close') startBot();
        if (connection === 'open') console.log('✅ Bot terhubung dan siap digunakan.');
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || msg.key.fromMe === false) return; // Hanya merespon jika kita yang ketik !kerjayo

        const jid = getRealJid(msg);
        const text = getText(msg);

        if (text === '!kerjayo') {
            console.log(`\n[PROSES] Mengirim 15 pesan ke ${jid} dengan jeda 30 detik.`);

            for (let i = 0; i < listPesan.length; i++) {
                const ok = await sendWithRetry(sock, jid, { text: listPesan[i] });

                if (ok) {
                    console.log(`[${i + 1}/15] Terkirim: "${listPesan[i]}"`);
                } else {
                    console.log(`[${i + 1}/15] GAGAL mengirim pesan.`);
                }

                // Cek apakah masih ada pesan berikutnya
                if (i < listPesan.length - 1) {
                    console.log("...Menunggu 30 detik...");
                    await delay(30000); // 30 detik jeda
                }
            }

            console.log(`\n[SELESAI] Semua pesan telah diproses.\n`);
        }
    });
}

startBot();
