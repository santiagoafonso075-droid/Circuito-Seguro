/**
 * server.js — micro-servidor para guardar resultados do jogo
 *
 * Uso:  node server.js
 *
 * - Serve ficheiros estáticos da pasta actual (index.html, game.js, style.css, assets/)
 * - POST /resultados  → recebe JSON {nome, turma, tempo, tempo_ms, data}
 *                        e guarda em resultados.json (array)
 * - GET  /resultados  → devolve o array de resultados
 *
 * Ficheiro de dados: resultados.json (criado automaticamente)
 */

const http    = require("http");
const fs      = require("fs");
const path    = require("path");
const url     = require("url");

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "resultados.json");

// ── Ler dados existentes ─────────────────────────────────────────────────────
function readResults() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        }
    } catch(e) {}
    return [];
}

// ── Guardar dados ────────────────────────────────────────────────────────────
function writeResults(arr) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// ── Servir ficheiros estáticos ───────────────────────────────────────────────
const MIME = {
    ".html": "text/html",
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".json": "application/json",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".svg":  "image/svg+xml",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".ico":  "image/x-icon"
};

function serveFile(res, filePath) {
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("Not Found"); return; }
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
    });
}

// ── Ler corpo do pedido POST ─────────────────────────────────────────────────
function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

// ── Servidor ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // ── API: resultados ──────────────────────────────────────────────────────
    if (pathname === "/resultados") {
        // CORS headers (permite pedidos da página local)
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

        if (req.method === "GET") {
            const results = readResults();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(results));
            return;
        }

        if (req.method === "POST") {
            try {
                const body = await getBody(req);
                const entry = JSON.parse(body);
                // Validação mínima
                if (!entry.nome || !entry.turma || !entry.tempo) {
                    res.writeHead(400); res.end("Dados incompletos"); return;
                }
                const results = readResults();
                results.push(entry);
                writeResults(results);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
                console.log(`✓ Resultado guardado: ${entry.nome} (${entry.turma}) — ${entry.tempo}`);
            } catch(e) {
                res.writeHead(400); res.end("Erro ao processar"); 
            }
            return;
        }

        res.writeHead(405); res.end("Method Not Allowed");
        return;
    }

    // ── Ficheiros estáticos ──────────────────────────────────────────────────
    let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);
    // Segurança: não sair da pasta actual
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }

    // Se for directoria, tentar index.html dentro
    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    } catch(e) {
        res.writeHead(404); res.end("Not Found"); return;
    }

    serveFile(res, filePath);
});

server.listen(PORT, () => {
    console.log(`\n🚀 Circuito Seguro — servidor iniciado`);
    console.log(`   Abrir no browser: http://localhost:${PORT}\n`);
    console.log(`   Resultados guardados em: ${DATA_FILE}\n`);
});
