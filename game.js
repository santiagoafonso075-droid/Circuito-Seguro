// ═══════════════════════════════════════════════════════════════════════════
// CIRCUITO SEGURO — game.js
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIGURAÇÕES ───────────────────────────────────────────────────────────
const WIDTH = 800, HEIGHT = 600;
const GRID_COLS = 8, GRID_ROWS = 6;
const TITLE_CHANGE_MS = 1500;
const TITLE_FILES = ["title_off1.png", "title_off2.png", "title_shock.png"];

// ─── ESTADO GLOBAL ───────────────────────────────────────────────────────────
let state = "menu";
let current_title_index = Math.floor(Math.random() * TITLE_FILES.length);

// Dados do jogador
let player_nome = "";
let player_turma = "";
let inserir_active_field = "nome";

// Jogo
let all_questions = [];
let session_questions = [];
let current_q_session_idx = 0;
let lives = 3;
let game_timer_start = 0;
let final_game_time = 0;
let game_grid = [];
let robot_cell = [0, 0];
let robot_grid_dir = "front";
let CELL_SIZE = 48;
let GRID_X = 40, GRID_Y = 95;
let cell_rects = [];
let answer_panel_x = 0, answer_panel_height = 0;

// Créditos
let credits_title_on = false;
let credits_title_switch_time = 0;

// Recursos
const images = {};
const sounds = {};

// Canvas
let canvas, ctx;

// Títulos pré-escalados
let titleImagesScaled = [null, null, null];
let titleScaleW = 0, titleScaleH = 0;

// Áudio — bloqueado até ao primeiro toque (política dos browsers)
let audioUnlocked = false;
let pendingSounds = []; // sons que tentámos tocar antes do unlock

// ─── D-PAD VIRTUAL (telemóvel) ───────────────────────────────────────────────
// Desenhado no canto inferior esquerdo quando o ecrã é pequeno
let showDpad = false;
let dpadButtons = {}; // calculado em calcDpad()
let dpadPressed = { up: false, down: false, left: false, right: false, action: false };

function calcDpad() {
    // Tamanho do dpad relativo ao canvas lógico
    const btnSz = 60;
    const gap = 6;
    const margin = 8;
    const bx = margin;
    // Grid termina em Y=95 + (6*48) = 383. Colocar d-pad em 480 (bem mais abaixo)
    const by = 480;

    dpadButtons = {
        up:     { x: bx + btnSz + gap, y: by,                          w: btnSz, h: btnSz },
        left:   { x: bx,               y: by + btnSz + gap,            w: btnSz, h: btnSz },
        down:   { x: bx + btnSz + gap, y: by + btnSz + gap,            w: btnSz, h: btnSz },
        right:  { x: bx + btnSz*2 + gap*2, y: by + btnSz + gap,        w: btnSz, h: btnSz },
        action: { x: bx + btnSz*2 + gap*2 + btnSz + gap*2,             y: by + btnSz + gap, w: btnSz, h: btnSz }
    };
}

function drawDpad() {
    if (!showDpad || state !== "jogo") return;
    const labels = { up: "▲", down: "▼", left: "◀", right: "▶", action: "OK" };
    for (const [key, r] of Object.entries(dpadButtons)) {
        const pressed = dpadPressed[key];
        ctx.fillStyle = pressed ? "#5a5a5a" : "#3a3a3a";
        roundRect(ctx, r.x, r.y, r.w, r.h, 12);
        ctx.strokeStyle = "#707070";
        roundRectStroke(ctx, r.x, r.y, r.w, r.h, 12, 2);
        ctx.fillStyle = "#e0e0e0";
        ctx.font = key === "action" ? "bold 20px sans-serif" : "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labels[key], r.x + r.w/2, r.y + r.h/2);
    }
}

// ─── CARREGAR RECURSOS ───────────────────────────────────────────────────────
function loadImage(name) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => { images[name] = img; resolve(img); };
        img.onerror = () => { images[name] = null; resolve(null); };
        img.src = "assets/" + name;
    });
}

function loadSound(name) {
    return new Promise((resolve) => {
        const audio = new Audio("assets/" + name);
        audio.oncanplaythrough = () => { sounds[name] = audio; resolve(audio); };
        audio.onerror           = () => { sounds[name] = null; resolve(null); };
        audio.load();
    });
}

function playSound(name) {
    const s = sounds[name];
    if (!s) return;
    if (!audioUnlocked) { pendingSounds.push(name); return; }
    try { s.currentTime = 0; s.play(); } catch(e) {}
}

function stopSound(name) {
    const s = sounds[name];
    if (!s) return;
    try { s.pause(); s.currentTime = 0; } catch(e) {}
}

function tryPlayMusic() {
    const m = sounds["bg_music"];
    if (!m || !audioUnlocked) return;
    if (m.paused) m.play().catch(() => {});
}

// Desbloquear áudio no primeiro gesto do utilizador
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    
    // Forçar música a tocar imediatamente
    const m = sounds["bg_music"];
    if (m) {
        m.play().then(() => {
            console.log("Música iniciada com sucesso");
        }).catch((err) => {
            console.log("Erro ao iniciar música:", err);
            // Tentar novamente após pequeno delay
            setTimeout(() => m.play().catch(() => {}), 100);
        });
    }
    
    pendingSounds.forEach(n => playSound(n));
    pendingSounds = [];
    if (current_title_index === 2) playSound("shock.wav");
}

function prescaleTitles() {
    const TITLE_MAX_W = Math.floor(WIDTH * 0.6);
    const TITLE_MAX_H = 140;
    let maxW = 0, maxH = 0;
    TITLE_FILES.forEach((fname) => {
        const img = images[fname];
        if (!img) return;
        const s = Math.min(TITLE_MAX_W / img.width, TITLE_MAX_H / img.height, 1.0);
        maxW = Math.max(maxW, Math.floor(img.width * s));
        maxH = Math.max(maxH, Math.floor(img.height * s));
    });
    titleScaleW = maxW;
    titleScaleH = maxH;
    TITLE_FILES.forEach((fname, i) => {
        const img = images[fname];
        if (!img) { titleImagesScaled[i] = null; return; }
        const off = document.createElement("canvas");
        off.width = maxW; off.height = maxH;
        off.getContext("2d").drawImage(img, 0, 0, maxW, maxH);
        titleImagesScaled[i] = off;
    });
}

async function loadAllAssets() {
    const imgNames = [
        "background.png",
        "title_off1.png","title_off2.png","title_shock.png",
        "game_over_battery.png","victory_congratulations.png",
        "credits_title_off.png","credits_title_on.png",
        "robot_front.png","robot_left.png","robot_right.png",
        "life_full.png","life_half.png","life_empty.png",
        "obstacle.png","socket_A.png","socket_B.png","socket_C.png"
    ];
    const sndNames = ["shock.wav","correct.wav","wrong.wav","victory.wav"];

    await Promise.all([
        ...imgNames.map(n => loadImage(n)),
        ...sndNames.map(n => loadSound(n))
    ]);

    // Carregar música separadamente e garantir que está pronta
    const bgMusic = new Audio("assets/bg_music.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.70;
    bgMusic.preload = "auto";
    
    // Esperar carregar
    await new Promise((resolve) => {
        bgMusic.addEventListener("canplaythrough", () => {
            sounds["bg_music"] = bgMusic;
            console.log("Música carregada");
            resolve();
        }, { once: true });
        bgMusic.addEventListener("error", () => {
            console.log("Erro ao carregar música");
            sounds["bg_music"] = null;
            resolve();
        }, { once: true });
        bgMusic.load();
    });
    
    if (sounds["shock.wav"]) sounds["shock.wav"].volume = 0.50;

    prescaleTitles();
    await loadQuestions();

    requestAnimationFrame(gameLoop);
}

// ─── PERGUNTAS ───────────────────────────────────────────────────────────────
async function loadQuestions() {
    try {
        const resp = await fetch("assets/questions.json");
        const data = await resp.json();
        if (Array.isArray(data) && data.length >= 10) { all_questions = data; return; }
    } catch(e) {}
    all_questions = [];
    for (let i = 0; i < 10; i++) {
        const grid = [];
        for (let r = 0; r < GRID_ROWS; r++) grid.push(".".repeat(GRID_COLS));
        const row = Math.floor(Math.random() * GRID_ROWS);
        const col = Math.floor(Math.random() * GRID_COLS);
        const letter = ["A","B","C"][Math.floor(Math.random()*3)];
        const rowArr = grid[row].split(""); rowArr[col] = letter; grid[row] = rowArr.join("");
        all_questions.push({
            id: i+1,
            texto: `Pergunta ${i+1}: Qual socket é o correto?`,
            respostas: {A:"Opção A", B:"Opção B", C:"Opção C"},
            correta: ["A","B","C"][Math.floor(Math.random()*3)],
            grid
        });
    }
}

// ─── GUARDAR RESULTADOS ──────────────────────────────────────────────────────
// Envia dados para um Google Apps Script que guarda num Google Sheet.
// Para configurar: ver o ficheiro COMO_GUARDAR_DADOS.txt na pasta do projecto.
//
// ⬇️  COLA AQUI A URL DO GOOGLE APPS SCRIPT (ver instruções no ficheiro):
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzUeLCzCHrBQc1i-fUeCUxoU6761nOLflfe23HZMrfbTauqIMZmxxti2c1bK_aABLk2mA/exec";
// ──────────────────────────────────────────────────────────────────────────────

async function saveResult(nome, turma, tempo_ms) {
    const secs = Math.floor(tempo_ms / 1000);
    const mins = Math.floor(secs / 60);
    const s    = secs % 60;
    const tempoStr = String(mins).padStart(2,"0") + ":" + String(s).padStart(2,"0");

    const entry = {
        nome: nome,
        turma: turma,
        tempo: tempoStr,
        tempo_ms: tempo_ms,
        data: new Date().toLocaleString("pt-PT")
    };

    // Tentar enviar para o Google Sheet
    if (SHEETS_URL) {
        try {
            await fetch(SHEETS_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(entry)
            });
        } catch(e) {}
    }

    // Sempre guardar também em localStorage (backup local)
    try {
        let arr = JSON.parse(localStorage.getItem("circuito_seguro_resultados") || "[]");
        arr.push(entry);
        localStorage.setItem("circuito_seguro_resultados", JSON.stringify(arr));
    } catch(e) {}
}

// ─── LÓGICA DO JOGO ──────────────────────────────────────────────────────────
function startGameSession() {
    const indices = [];
    while (indices.length < 5) {
        const r = Math.floor(Math.random() * all_questions.length);
        if (!indices.includes(r)) indices.push(r);
    }
    session_questions = indices;
    current_q_session_idx = 0;
    lives = 3;
    game_timer_start = performance.now();
    final_game_time = 0;
    startQuestion();
}

function startQuestion() {
    buildGrid(all_questions[session_questions[current_q_session_idx]]);
}

function buildGrid(question) {
    const raw = question.grid || [];
    game_grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        let line = r < raw.length ? raw[r] : ".".repeat(GRID_COLS);
        if (line.length < GRID_COLS) line += ".".repeat(GRID_COLS - line.length);
        else line = line.slice(0, GRID_COLS);
        game_grid.push(line.split(""));
    }
    const ANSWER_PANEL_WIDTH = showDpad ? 200 : 260;
    const SPACING = 15;
    const max_grid_w = WIDTH - ANSWER_PANEL_WIDTH - SPACING - 40;
    const max_grid_h = HEIGHT - 160;
    CELL_SIZE = Math.min(Math.floor(max_grid_w / GRID_COLS), Math.floor(max_grid_h / GRID_ROWS), 55);
    const total_w = CELL_SIZE * GRID_COLS;
    const total_h = CELL_SIZE * GRID_ROWS;
    GRID_X = Math.floor((WIDTH - total_w - SPACING - ANSWER_PANEL_WIDTH) / 2);
    GRID_Y = 95;
    cell_rects = [];
    for (let y = 0; y < GRID_ROWS; y++) {
        const row = [];
        for (let x = 0; x < GRID_COLS; x++)
            row.push({ x: GRID_X + x*CELL_SIZE, y: GRID_Y + y*CELL_SIZE, w: CELL_SIZE, h: CELL_SIZE });
        cell_rects.push(row);
    }
    answer_panel_x = GRID_X + total_w + SPACING;
    answer_panel_height = total_h;
    for (let y = 0; y < GRID_ROWS; y++)
        for (let x = 0; x < GRID_COLS; x++)
            if (game_grid[y][x] === ".") { robot_cell = [x,y]; robot_grid_dir = "front"; return; }
    robot_cell = [0,0]; robot_grid_dir = "front";
}

function restartCurrentPhase() {
    for (let y = 0; y < GRID_ROWS; y++)
        for (let x = 0; x < GRID_COLS; x++)
            if (game_grid[y][x] === ".") { robot_cell = [x,y]; robot_grid_dir = "front"; return; }
    robot_cell = [0,0]; robot_grid_dir = "front";
}

function handleSocketInteraction(socketId) {
    const q = all_questions[session_questions[current_q_session_idx]];
    if (socketId === q.correta) {
        playSound("correct.wav");
        current_q_session_idx++;
        if (current_q_session_idx >= session_questions.length) {
            final_game_time = performance.now() - game_timer_start;
            playSound("victory.wav");
            // Guardar resultado (só vitória)
            saveResult(player_nome, player_turma, final_game_time);
            state = "vitoria";
        } else { startQuestion(); }
    } else {
        playSound("wrong.wav");
        lives--;
        if (lives <= 0) state = "game_over";
        else restartCurrentPhase();
    }
}

function moveRobot(dir) {
    if (state !== "jogo") return;
    let [rx, ry] = robot_cell;
    if (dir === "left") {
        const nx = Math.max(0, rx-1);
        if (game_grid[ry][nx] !== "#") { robot_cell = [nx, ry]; robot_grid_dir = "left"; }
    } else if (dir === "right") {
        const nx = Math.min(GRID_COLS-1, rx+1);
        if (game_grid[ry][nx] !== "#") { robot_cell = [nx, ry]; robot_grid_dir = "right"; }
    } else if (dir === "up") {
        const ny = Math.max(0, ry-1);
        if (game_grid[ny][rx] !== "#") { robot_cell = [rx, ny]; robot_grid_dir = "front"; }
    } else if (dir === "down") {
        const ny = Math.min(GRID_ROWS-1, ry+1);
        if (game_grid[ny][rx] !== "#") { robot_cell = [rx, ny]; robot_grid_dir = "front"; }
    } else if (dir === "action") {
        const [cx, cy] = robot_cell;
        const cell = game_grid[cy][cx];
        if (["A","B","C"].includes(cell)) handleSocketInteraction(cell);
    }
}

// ─── DESENHO ─────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath(); ctx.fill();
}
function roundRectStroke(ctx, x, y, w, h, r, lw) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath(); ctx.lineWidth = lw; ctx.stroke();
}

function drawButton(rect, text, hover) {
    ctx.fillStyle = hover ? "#e6e6e6" : "#c8c8c8";
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.strokeStyle = "#323232";
    roundRectStroke(ctx, rect.x, rect.y, rect.w, rect.h, 8, 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w/2, rect.y + rect.h/2);
}

function drawBackground() {
    if (images["background.png"]) ctx.drawImage(images["background.png"], 0, 0, WIDTH, HEIGHT);
    else { ctx.fillStyle = "#1e1e1e"; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
}

function blitScaledCenter(img, midX, topY, maxW, maxH, allowUp) {
    if (!img) return;
    let s = Math.min(maxW / img.width, maxH / img.height);
    if (!allowUp) s = Math.min(s, 1.0);
    const nw = Math.max(1, Math.floor(img.width * s));
    const nh = Math.max(1, Math.floor(img.height * s));
    ctx.drawImage(img, midX - nw/2, topY, nw, nh);
}

// ── MENU ─────────────────────────────────────────────────────────────────────
const menuButtons = {
    jogar:    { x: WIDTH/2-110, y: 300, w: 220, h: 60 },
    creditos: { x: WIDTH/2-110, y: 380, w: 220, h: 60 }
};

function drawMenu() {
    drawBackground();
    const ti = titleImagesScaled[current_title_index];
    if (ti) { ctx.drawImage(ti, WIDTH/2 - titleScaleW/2, 60); }
    else {
        const labels = ["CIRCUITO SEGURO - LIGADO","CIRCUITO SEGURO - OFF B","CIRCUITO SEGURO - CHOQUE"];
        const colors = ["#b4b4b4","#a0a0a0","#ffb43c"];
        const tw = Math.floor(WIDTH*0.6);
        ctx.fillStyle = colors[current_title_index];
        roundRect(ctx, WIDTH/2-tw/2, 10, tw, 80, 6);
        ctx.fillStyle = "#0a0a0a"; ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(labels[current_title_index], WIDTH/2, 50);
    }
    for (const key of ["jogar","creditos"]) {
        const r = menuButtons[key];
        drawButton(r, key === "jogar" ? "Jogar" : "Créditos", hitTest(r));
    }
}

// ── INSERIR DADOS ────────────────────────────────────────────────────────────
const ID_CAMPO_W = 320, ID_CAMPO_H = 50;
const ID_CAMPO_NOME  = { x: WIDTH/2-ID_CAMPO_W/2, y: 290, w: ID_CAMPO_W, h: ID_CAMPO_H };
const ID_CAMPO_TURMA = { x: WIDTH/2-ID_CAMPO_W/2, y: 380, w: ID_CAMPO_W, h: ID_CAMPO_H };
const ID_BTN_COMECAR = { x: WIDTH/2-110, y: 480, w: 220, h: 50 };
const ID_BTN_VOLTAR  = { x: WIDTH/2-110, y: 545, w: 220, h: 40 };

function drawCampo(rect, label, value, isActive) {
    const hovered = hitTest(rect);
    ctx.fillStyle = "#c8c864"; ctx.font = "18px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(label, rect.x, rect.y - 6);

    let bc = isActive ? "#64b4ff" : hovered ? "#a0a0a0" : "#646464";
    ctx.fillStyle = "#282828";
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.strokeStyle = bc;
    roundRectStroke(ctx, rect.x, rect.y, rect.w, rect.h, 8, 2);

    ctx.fillStyle = "#e6e6e6"; ctx.font = "18px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(value, rect.x + 14, rect.y + rect.h/2);

    if (isActive) {
        const tw = ctx.measureText(value).width;
        const cx = rect.x + 14 + tw;
        if (Math.floor(performance.now()/500) % 2 === 0) {
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, rect.y+10); ctx.lineTo(cx, rect.y+rect.h-10);
            ctx.stroke();
        }
    }
}

function drawInserirDados() {
    drawBackground();
    ctx.fillStyle = "#f0f0f0"; ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Identificação", WIDTH/2, 200);

    drawCampo(ID_CAMPO_NOME,  "Nome",  player_nome,  inserir_active_field === "nome");
    drawCampo(ID_CAMPO_TURMA, "Turma", player_turma, inserir_active_field === "turma");

    const ok = player_nome.trim() !== "" && player_turma.trim() !== "";
    const ch = hitTest(ID_BTN_COMECAR);
    ctx.fillStyle = ok ? (ch ? "#50d350" : "#3cb43c") : "#464646";
    roundRect(ctx, ID_BTN_COMECAR.x, ID_BTN_COMECAR.y, ID_BTN_COMECAR.w, ID_BTN_COMECAR.h, 8);
    ctx.strokeStyle = "#1e1e1e";
    roundRectStroke(ctx, ID_BTN_COMECAR.x, ID_BTN_COMECAR.y, ID_BTN_COMECAR.w, ID_BTN_COMECAR.h, 8, 2);
    ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Começar", ID_BTN_COMECAR.x + ID_BTN_COMECAR.w/2, ID_BTN_COMECAR.y + ID_BTN_COMECAR.h/2);

    const vh = hitTest(ID_BTN_VOLTAR);
    ctx.fillStyle = vh ? "#b4b4b4" : "#8c8c8c";
    roundRect(ctx, ID_BTN_VOLTAR.x, ID_BTN_VOLTAR.y, ID_BTN_VOLTAR.w, ID_BTN_VOLTAR.h, 8);
    ctx.strokeStyle = "#3c3c3c";
    roundRectStroke(ctx, ID_BTN_VOLTAR.x, ID_BTN_VOLTAR.y, ID_BTN_VOLTAR.w, ID_BTN_VOLTAR.h, 8, 2);
    ctx.fillStyle = "#141414"; ctx.font = "18px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Voltar", ID_BTN_VOLTAR.x + ID_BTN_VOLTAR.w/2, ID_BTN_VOLTAR.y + ID_BTN_VOLTAR.h/2);
}

// ── CRÉDITOS ─────────────────────────────────────────────────────────────────
const CREDITS_LINES = [
    "Desenvolvimento: Santiago 11ºB","",
    "Design: Santiago 11ºB","",
    "Música: Eleven Labs","",
    "Perguntas: Afonso Pinto, João Esteves, Lucas Pinheiro","",
    "Prémios: Martim Gomes, Pedro Almeida, Diego Luís","",
    "Obrigado por jogar! :)"
];

function drawCredits() {
    drawBackground();
    const TITLE_MAX_W = Math.floor(WIDTH*0.6), TITLE_MAX_H = 140;
    if (credits_title_on && images["credits_title_on.png"])
        blitScaledCenter(images["credits_title_on.png"], WIDTH/2, 30, TITLE_MAX_W, TITLE_MAX_H, false);
    else if (!credits_title_on && images["credits_title_off.png"])
        blitScaledCenter(images["credits_title_off.png"], WIDTH/2, 30, TITLE_MAX_W, TITLE_MAX_H, false);
    else {
        const tw = Math.floor(WIDTH*0.6);
        ctx.fillStyle = credits_title_on ? "#dcdc50" : "#787878";
        roundRect(ctx, WIDTH/2-tw/2, 10, tw, 80, 6);
        ctx.fillStyle = "#0a0a0a"; ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(credits_title_on ? "CREDITOS" : "CREDITOS (DESLIGADO)", WIDTH/2, 50);
    }
    const pw = Math.floor(WIDTH*0.8), ph = Math.floor(HEIGHT*0.55);
    const px = WIDTH/2-pw/2, py = HEIGHT/2-ph/2-20;
    ctx.fillStyle = "#1e1e1e"; roundRect(ctx, px, py, pw, ph, 8);
    ctx.strokeStyle = "#c8c8c8"; roundRectStroke(ctx, px, py, pw, ph, 8, 2);
    ctx.fillStyle = "#e6e6e6"; ctx.font = "20px arial, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    let ty = py + 20;
    for (const line of CREDITS_LINES) {
        if (line === "") { ty += 10; continue; }
        ctx.fillText(line, px+20, ty); ty += 26;
    }
    const br = { x: WIDTH/2-110, y: HEIGHT-100, w: 220, h: 60 };
    drawButton(br, "VOLTAR", hitTest(br));
}

// ── JOGO ─────────────────────────────────────────────────────────────────────
function drawGameHud(questionText) {
    ctx.fillStyle = "#f0f0f0"; ctx.font = "18px sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    const words = questionText.split(" ");
    let line = "", lines = [], yOff = 10;
    for (const word of words) {
        const test = line + word + " ";
        if (ctx.measureText(test).width > WIDTH - 240) {
            if (line) { lines.push(line.trim()); line = word+" "; }
            else { lines.push(word); line = ""; }
        } else line = test;
    }
    if (line) lines.push(line.trim());
    for (const l of lines) { ctx.fillText(l, 20, yOff); yOff += 25; }

    // Bateria
    const bx=20, by=60, bw=50, bh=20;
    const lifeImg = lives===3 ? images["life_full.png"] : lives===2 ? images["life_half.png"] : images["life_empty.png"];
    if (lifeImg) ctx.drawImage(lifeImg, bx, by, bw, bh);
    else {
        ctx.fillStyle = lives===3?"#32c832":lives===2?"#c8c832":"#c83232";
        roundRect(ctx, bx, by, bw, bh, 4);
    }

    // Timer
    const elapsed = performance.now() - game_timer_start;
    const secs = Math.floor(elapsed/1000), mins = Math.floor(secs/60), s = secs%60;
    const timeStr = String(mins).padStart(2,"0")+":"+String(s).padStart(2,"0");
    const trx=WIDTH-140, try_=60, trw=120, trh=24;
    ctx.fillStyle="#fafafa"; roundRect(ctx, trx, try_, trw, trh, 6);
    ctx.strokeStyle="#141414"; roundRectStroke(ctx, trx, try_, trw, trh, 6, 2);
    ctx.fillStyle="#0a0a0a"; ctx.font="18px sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(timeStr, trx+trw/2, try_+trh/2);

    // Instrução inferior (escondida no telemóvel pois há dpad)
    if (!showDpad) {
        ctx.fillStyle="#c8c864"; ctx.font="16px sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("WASD ou Setas para mover / Leve o robô à resposta correta / Espaço para interagir", WIDTH/2, HEIGHT-20);
    }
}

function drawGridAndRobot() {
    const PAD = 4;
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            const r = cell_rects[y][x];
            ctx.fillStyle="#282828"; ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle="#646464"; ctx.lineWidth=1; ctx.strokeRect(r.x, r.y, r.w, r.h);
            const cell = game_grid[y][x];
            const cx=r.x+r.w/2, cy=r.y+r.h/2, sz=CELL_SIZE-PAD;
            if (cell==="#") {
                if (images["obstacle.png"]) ctx.drawImage(images["obstacle.png"], cx-sz/2, cy-sz/2, sz, sz);
                else { ctx.fillStyle="#783c3c"; roundRect(ctx, r.x+4, r.y+4, r.w-8, r.h-8, 4); }
            } else if ("ABC".includes(cell)) {
                const sk = "socket_"+cell+".png";
                if (images[sk]) ctx.drawImage(images[sk], cx-sz/2, cy-sz/2, sz, sz);
                else {
                    ctx.fillStyle = {A:"#6496c8",B:"#9664c8",C:"#c89664"}[cell];
                    roundRect(ctx, r.x+5, r.y+5, r.w-10, r.h-10, 6);
                    ctx.fillStyle="#f0f0f0"; ctx.font="bold 18px sans-serif";
                    ctx.textAlign="center"; ctx.textBaseline="middle";
                    ctx.fillText(cell, cx, cy);
                }
            }
        }
    }
    // Robô
    const [rx,ry] = robot_cell;
    const rr = cell_rects[ry][rx];
    const rcx=rr.x+rr.w/2, rcy=rr.y+rr.h/2;
    const target = Math.floor((CELL_SIZE-4)*0.95);
    const sk = robot_grid_dir==="left"?"robot_left.png":robot_grid_dir==="right"?"robot_right.png":"robot_front.png";
    const ri = images[sk];
    if (ri) {
        const sc = target / Math.max(ri.width, ri.height);
        ctx.drawImage(ri, rcx-ri.width*sc/2, rcy-ri.height*sc/2, ri.width*sc, ri.height*sc);
    } else {
        ctx.fillStyle="#c8c8c8"; roundRect(ctx, rr.x+5, rr.y+5, rr.w-10, rr.h-10, 6);
    }
}

function drawAnswerPanel(question) {
    const px=answer_panel_x, py=GRID_Y, pw=showDpad?200:260, ph=answer_panel_height;
    ctx.fillStyle="#191919"; roundRect(ctx, px, py, pw, ph, 8);
    ctx.strokeStyle="#969696"; roundRectStroke(ctx, px, py, pw, ph, 8, 2);
    ctx.fillStyle="#f0f0f0"; ctx.font="18px sans-serif";
    ctx.textAlign="left"; ctx.textBaseline="top";
    ctx.fillText("Respostas:", px+15, py+15);
    const res = question.respostas || {};
    let yOff = py+50;
    for (const key of ["A","B","C"]) {
        if (!(key in res)) continue;
        ctx.fillStyle="#c8c864"; ctx.font="18px sans-serif";
        ctx.fillText(key+":", px+20, yOff);
        const ansWords = res[key].split(" ");
        let al="", aly=yOff+30;
        const maxLW = pw-40;
        ctx.font="15px sans-serif"; ctx.fillStyle="#dcdcdc";
        for (const w of ansWords) {
            const test = al+w+" ";
            if (ctx.measureText(test).width > maxLW) {
                if (al) { ctx.fillText(al.trim(), px+20, aly); al=w+" "; aly+=22; }
                else { ctx.fillText(w, px+20, aly); aly+=22; }
            } else al = test;
        }
        if (al) ctx.fillText(al.trim(), px+20, aly);
        yOff += 95;
    }
}

function drawGame() {
    drawBackground();
    const q = all_questions[session_questions[current_q_session_idx]];
    drawGameHud(q.texto);
    drawGridAndRobot();
    drawAnswerPanel(q);
    drawDpad();
}

// ── VITÓRIA ──────────────────────────────────────────────────────────────────
function drawVictoryScreen() {
    drawBackground();
    if (images["victory_congratulations.png"])
        blitScaledCenter(images["victory_congratulations.png"], WIDTH/2, 80, Math.floor(WIDTH*0.8), 300, true);
    else {
        ctx.fillStyle="#f0f064"; ctx.font="bold 36px sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("PARABÉNS", WIDTH/2, 150);
    }
    const secs=Math.floor(final_game_time/1000), mins=Math.floor(secs/60), s=secs%60;
    const tpx=WIDTH/2-200, tpy=380, tpw=400, tph=100;
    ctx.fillStyle="#1e1e1e"; roundRect(ctx, tpx, tpy, tpw, tph, 8);
    ctx.strokeStyle="#c8c8c8"; roundRectStroke(ctx, tpx, tpy, tpw, tph, 8, 2);
    ctx.fillStyle="#e6e6e6"; ctx.font="18px sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("Completaste o jogo em:", WIDTH/2, tpy+25);
    ctx.fillStyle="#f0f064"; ctx.font="bold 28px sans-serif";
    ctx.fillText(String(mins).padStart(2,"0")+":"+String(s).padStart(2,"0"), WIDTH/2, tpy+65);
    const br = { x:WIDTH/2-110, y:HEIGHT-80, w:220, h:60 };
    drawButton(br, "VOLTAR AO MENU", hitTest(br));
}

// ── GAME OVER ────────────────────────────────────────────────────────────────
function drawGameOverScreen() {
    drawBackground();
    if (images["game_over_battery.png"])
        blitScaledCenter(images["game_over_battery.png"], WIDTH/2, 100, Math.floor(WIDTH*0.8), 400, true);
    else {
        ctx.fillStyle="#f05050"; ctx.font="bold 28px sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("O Robô ficou sem Bateria", WIDTH/2, 200);
        ctx.fillStyle="#dcdcdc"; ctx.font="18px sans-serif";
        ctx.fillText("TENTE NOVAMENTE", WIDTH/2, 280);
    }
    const br = { x:WIDTH/2-110, y:HEIGHT-80, w:220, h:60 };
    drawButton(br, "VOLTAR AO MENU", hitTest(br));
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
const mouse = { x: 0, y: 0 };

function hitTest(rect) {
    return mouse.x >= rect.x && mouse.x <= rect.x+rect.w &&
           mouse.y >= rect.y && mouse.y <= rect.y+rect.h;
}

// Converter coordenadas do ecrã → coordenadas lógicas do canvas (800×600)
function screenToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (WIDTH  / rect.width),
        y: (clientY - rect.top)  * (HEIGHT / rect.height)
    };
}

function onMouseMove(e) {
    const p = screenToCanvas(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
}

function handleClick(x, y) {
    mouse.x = x; mouse.y = y;

    if (state === "menu") {
        if (hitTest(menuButtons.jogar)) {
            stopSound("shock.wav");
            state = "inserir_dados"; inserir_active_field = "nome";
            player_nome = ""; player_turma = ""; // Resetar campos
            // Ativar input no telemóvel
            if (showDpad) {
                const inp = document.getElementById("hiddenInputNome");
                inp.value = "";
                setTimeout(() => inp.focus(), 100);
            }
        } else if (hitTest(menuButtons.creditos)) {
            stopSound("shock.wav");
            state = "creditos";
            credits_title_on = false;
            credits_title_switch_time = performance.now() + 1000;
        }
    } else if (state === "inserir_dados") {
        if (hitTest(ID_CAMPO_NOME)) {
            inserir_active_field = "nome";
            if (showDpad) {
                const inp = document.getElementById("hiddenInputNome");
                // Forçar limpeza e resincronização
                inp.blur();
                inp.value = "";
                setTimeout(() => {
                    inp.value = player_nome;
                    inp.setSelectionRange(player_nome.length, player_nome.length);
                    inp.focus();
                }, 50);
            }
        } else if (hitTest(ID_CAMPO_TURMA)) {
            inserir_active_field = "turma";
            if (showDpad) {
                const inp = document.getElementById("hiddenInputTurma");
                // Forçar limpeza e resincronização
                inp.blur();
                inp.value = "";
                setTimeout(() => {
                    inp.value = player_turma;
                    inp.setSelectionRange(player_turma.length, player_turma.length);
                    inp.focus();
                }, 50);
            }
        } else if (hitTest(ID_BTN_COMECAR)) {
            if (player_nome.trim() !== "" && player_turma.trim() !== "") {
                startGameSession(); state = "jogo";
                // Fechar teclado e limpar inputs
                if (showDpad) {
                    document.activeElement.blur();
                    document.getElementById("hiddenInputNome").value = "";
                    document.getElementById("hiddenInputTurma").value = "";
                }
            }
        } else if (hitTest(ID_BTN_VOLTAR)) {
            state = "menu";
            // Fechar teclado e limpar inputs
            if (showDpad) {
                document.activeElement.blur();
                document.getElementById("hiddenInputNome").value = "";
                document.getElementById("hiddenInputTurma").value = "";
            }
        }
    } else if (state === "creditos") {
        const br = { x:WIDTH/2-110, y:HEIGHT-100, w:220, h:60 };
        if (hitTest(br)) state = "menu";
    } else if (state === "vitoria") {
        const br = { x:WIDTH/2-110, y:HEIGHT-80, w:220, h:60 };
        if (hitTest(br)) state = "menu";
    } else if (state === "game_over") {
        const br = { x:WIDTH/2-110, y:HEIGHT-80, w:220, h:60 };
        if (hitTest(br)) state = "menu";
    } else if (state === "jogo" && showDpad) {
        // Verificar se clicar num botão do dpad
        for (const [key, r] of Object.entries(dpadButtons)) {
            if (x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h) {
                moveRobot(key); return;
            }
        }
    }
}

function onMouseClick(e) {
    unlockAudio();
    const p = screenToCanvas(e.clientX, e.clientY);
    handleClick(p.x, p.y);
}

// ── TOUCH ────────────────────────────────────────────────────────────────────
function onTouchStart(e) {
    e.preventDefault();
    unlockAudio();
    for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const p = screenToCanvas(t.clientX, t.clientY);
        // Marcar dpad como premido (sem chamar moveRobot aqui)
        if (state === "jogo" && showDpad) {
            for (const [key, r] of Object.entries(dpadButtons)) {
                if (p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h) {
                    dpadPressed[key] = true;
                }
            }
        }
        handleClick(p.x, p.y); // handleClick já chama moveRobot
    }
}

function onTouchMove(e) {
    e.preventDefault();
    // Permitir arrastar entre botões do dpad
    // Primeiro resetar todos
    for (const k in dpadPressed) dpadPressed[k] = false;
    if (state === "jogo" && showDpad) {
        for (let i = 0; i < e.touches.length; i++) {
            const p = screenToCanvas(e.touches[i].clientX, e.touches[i].clientY);
            for (const [key, r] of Object.entries(dpadButtons)) {
                if (p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h) {
                    if (!dpadPressed[key]) { dpadPressed[key] = true; moveRobot(key); }
                }
            }
        }
    }
}

function onTouchEnd(e) {
    e.preventDefault();
    for (const k in dpadPressed) dpadPressed[k] = false;
}

// ── TECLADO ──────────────────────────────────────────────────────────────────
function onKeyDown(e) {
    unlockAudio();
    if (e.key === "Escape") { state = "menu"; return; }

    if (state === "inserir_dados") {
        if (e.key === "Tab") { e.preventDefault(); inserir_active_field = inserir_active_field==="nome"?"turma":"nome"; }
        else if (e.key === "Enter") {
            if (player_nome.trim()!=="" && player_turma.trim()!=="") { startGameSession(); state="jogo"; }
        } else if (e.key === "Backspace") {
            e.preventDefault();
            if (inserir_active_field==="nome") player_nome = player_nome.slice(0,-1);
            else player_turma = player_turma.slice(0,-1);
        } else if (e.key.length === 1) {
            if (inserir_active_field==="nome" && player_nome.length<25) player_nome += e.key;
            else if (inserir_active_field==="turma" && player_turma.length<15) player_turma += e.key;
        }
        return;
    }

    if (state === "jogo") {
        if (e.key==="a"||e.key==="A"||e.key==="ArrowLeft")  { e.preventDefault(); moveRobot("left"); }
        else if (e.key==="d"||e.key==="D"||e.key==="ArrowRight") { e.preventDefault(); moveRobot("right"); }
        else if (e.key==="w"||e.key==="W"||e.key==="ArrowUp")    { e.preventDefault(); moveRobot("up"); }
        else if (e.key==="s"||e.key==="S"||e.key==="ArrowDown")  { e.preventDefault(); moveRobot("down"); }
        else if (e.key===" ") { e.preventDefault(); moveRobot("action"); }
    }
}

// ─── TIMER DO TÍTULO ─────────────────────────────────────────────────────────
setInterval(() => {
    if (state !== "menu") return;
    let next = Math.floor(Math.random() * TITLE_FILES.length);
    if (next === current_title_index && Math.random() < 0.5) {
        const choices = TITLE_FILES.map((_,i)=>i).filter(i => i !== current_title_index);
        next = choices[Math.floor(Math.random()*choices.length)];
    }
    current_title_index = next;
    if (current_title_index === 2) playSound("shock.wav");
    else stopSound("shock.wav");
}, TITLE_CHANGE_MS);

// ─── GAME LOOP ───────────────────────────────────────────────────────────────
function gameLoop() {
    if (state === "creditos" && !credits_title_on && credits_title_switch_time && performance.now() >= credits_title_switch_time)
        credits_title_on = true;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    switch(state) {
        case "menu":          drawMenu();            break;
        case "inserir_dados": drawInserirDados();    break;
        case "jogo":          drawGame();            break;
        case "creditos":      drawCredits();         break;
        case "vitoria":       drawVictoryScreen();   break;
        case "game_over":     drawGameOverScreen();  break;
    }
    requestAnimationFrame(gameLoop);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    // Detectar telemóvel/tablet → mostrar dpad
    showDpad = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    if (showDpad) calcDpad();

    // Mouse
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onMouseClick);

    // Touch (passivo: false para poder dar preventDefault)
    canvas.addEventListener("touchstart", onTouchStart,  { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,   { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,    { passive: false });

    // Teclado
    document.addEventListener("keydown", onKeyDown);

    // Sincronizar inputs HTML invisíveis (telemóvel)
    const inputNome = document.getElementById("hiddenInputNome");
    const inputTurma = document.getElementById("hiddenInputTurma");
    
    if (inputNome) {
        inputNome.addEventListener("input", (e) => {
            if (state === "inserir_dados" && inserir_active_field === "nome") {
                const oldValue = player_nome;
                player_nome = e.target.value.slice(0, 25);
                console.log("Nome input:", oldValue, "->", player_nome, "| input.value:", e.target.value);
            }
        });
    }
    
    if (inputTurma) {
        inputTurma.addEventListener("input", (e) => {
            if (state === "inserir_dados" && inserir_active_field === "turma") {
                const oldValue = player_turma;
                player_turma = e.target.value.slice(0, 15);
                console.log("Turma input:", oldValue, "->", player_turma, "| input.value:", e.target.value);
            }
        });
    }

    loadAllAssets();
}

window.addEventListener("load", init);
