// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
const WIDTH = 800, HEIGHT = 600, FPS = 60;
const GRID_COLS = 8, GRID_ROWS = 6;
const TITLE_CHANGE_MS = 1500;
const TITLE_FILES = ["title_off1.png", "title_off2.png", "title_shock.png"];

// ─── Estado global ───────────────────────────────────────────────────────────
let state = "menu";  // menu | inserir_dados | jogo | creditos | vitoria | game_over
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

// Imagens carregadas
const images = {};
// Sons (usamos Audio)
const sounds = {};

// Canvas
let canvas, ctx;
let animFrame;
let lastTime = 0;

// Títulos pré-escalados (após carregar)
let titleImagesScaled = [null, null, null];
let titleScaleW = 0, titleScaleH = 0;

// ─── CARREGAR RECURSOS ───────────────────────────────────────────────────────
function loadImage(name) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { images[name] = img; resolve(img); };
        img.onerror = () => { images[name] = null; resolve(null); };
        img.src = "assets/" + name;
    });
}

function loadSound(name) {
    return new Promise((resolve) => {
        const path = "assets/" + name;
        const audio = new Audio(path);
        audio.oncanplaythrough = () => { sounds[name] = audio; resolve(audio); };
        audio.onerror = () => { sounds[name] = null; resolve(null); };
        audio.load();
    });
}

function playSound(name) {
    const s = sounds[name];
    if (!s) return;
    try {
        s.currentTime = 0;
        s.play();
    } catch(e) {}
}

function stopSound(name) {
    const s = sounds[name];
    if (!s) return;
    try {
        s.pause();
        s.currentTime = 0;
    } catch(e) {}
}

// Pré-escalar títulos todos para o mesmo tamanho
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

    // Desenhar cada título numa offscreen canvas com esse tamanho
    TITLE_FILES.forEach((fname, i) => {
        const img = images[fname];
        if (!img) { titleImagesScaled[i] = null; return; }
        const offscreen = document.createElement("canvas");
        offscreen.width = maxW;
        offscreen.height = maxH;
        const octx = offscreen.getContext("2d");
        // Desenhar centrado (pode haver diferenças de proporção original mas todos ficam no mesmo box)
        octx.drawImage(img, 0, 0, maxW, maxH);
        titleImagesScaled[i] = offscreen;
    });
}

async function loadAllAssets() {
    const imgNames = [
        "background.png",
        "title_off1.png", "title_off2.png", "title_shock.png",
        "game_over_battery.png", "victory_congratulations.png",
        "credits_title_off.png", "credits_title_on.png",
        "robot_front.png", "robot_left.png", "robot_right.png",
        "life_full.png", "life_half.png", "life_empty.png",
        "obstacle.png", "socket_A.png", "socket_B.png", "socket_C.png"
    ];
    const sndNames = ["shock.wav", "correct.wav", "wrong.wav", "victory.wav"];

    await Promise.all([
        ...imgNames.map(n => loadImage(n)),
        ...sndNames.map(n => loadSound(n))
    ]);

    // Música de fundo
    const bgMusic = new Audio("assets/bg_music.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.08;
    sounds["bg_music"] = bgMusic;

    if (sounds["shock.wav"]) sounds["shock.wav"].volume = 0.1;

    prescaleTitles();

    // Se o título inicial for o shock, tocar
    if (current_title_index === 2) playSound("shock.wav");

    // Carregar perguntas
    await loadQuestions();

    // Começar música (precisa de interação do utilizador — tratamos no primeiro clique)
    // Tentamos aqui na mesma
    tryPlayMusic();

    // Iniciar loop
    animFrame = requestAnimationFrame(gameLoop);
}

function tryPlayMusic() {
    const m = sounds["bg_music"];
    if (m && m.paused) {
        m.play().catch(() => {});
    }
}

// ─── PERGUNTAS ───────────────────────────────────────────────────────────────
async function loadQuestions() {
    try {
        const resp = await fetch("assets/questions.json");
        const data = await resp.json();
        if (Array.isArray(data) && data.length >= 10) {
            all_questions = data;
            return;
        }
    } catch(e) {}
    // Fallback gerador
    all_questions = [];
    for (let i = 0; i < 10; i++) {
        const grid = [];
        for (let r = 0; r < GRID_ROWS; r++) grid.push(".".repeat(GRID_COLS));
        const row = Math.floor(Math.random() * GRID_ROWS);
        const col = Math.floor(Math.random() * GRID_COLS);
        const letter = ["A","B","C"][Math.floor(Math.random()*3)];
        const rowArr = grid[row].split("");
        rowArr[col] = letter;
        grid[row] = rowArr.join("");
        all_questions.push({
            id: i+1,
            texto: `Pergunta ${i+1}: Qual socket é o correto?`,
            respostas: {A:"Opção A", B:"Opção B", C:"Opção C"},
            correta: ["A","B","C"][Math.floor(Math.random()*3)],
            grid: grid
        });
    }
}

// ─── LÓGICA DO JOGO ──────────────────────────────────────────────────────────
function startGameSession() {
    // Embaralhar 5 perguntas
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
    const q = all_questions[session_questions[current_q_session_idx]];
    buildGrid(q);
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

    const ANSWER_PANEL_WIDTH = 260, SPACING = 15;
    const max_grid_w = WIDTH - ANSWER_PANEL_WIDTH - SPACING - 40;
    const max_grid_h = HEIGHT - 160;
    CELL_SIZE = Math.min(Math.floor(max_grid_w / GRID_COLS), Math.floor(max_grid_h / GRID_ROWS), 55);

    const total_w = CELL_SIZE * GRID_COLS;
    const total_h = CELL_SIZE * GRID_ROWS;
    const content_width = total_w + SPACING + ANSWER_PANEL_WIDTH;
    GRID_X = Math.floor((WIDTH - content_width) / 2);
    GRID_Y = 95;

    cell_rects = [];
    for (let y = 0; y < GRID_ROWS; y++) {
        const row = [];
        for (let x = 0; x < GRID_COLS; x++) {
            row.push({ x: GRID_X + x*CELL_SIZE, y: GRID_Y + y*CELL_SIZE, w: CELL_SIZE, h: CELL_SIZE });
        }
        cell_rects.push(row);
    }

    answer_panel_x = GRID_X + total_w + SPACING;
    answer_panel_height = total_h;

    // Encontrar primeira célula livre para o robô
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            if (game_grid[y][x] === ".") {
                robot_cell = [x, y];
                robot_grid_dir = "front";
                return;
            }
        }
    }
    robot_cell = [0,0];
    robot_grid_dir = "front";
}

function restartCurrentPhase() {
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            if (game_grid[y][x] === ".") {
                robot_cell = [x, y];
                robot_grid_dir = "front";
                return;
            }
        }
    }
    robot_cell = [0,0];
    robot_grid_dir = "front";
}

function handleSocketInteraction(socketId) {
    const q = all_questions[session_questions[current_q_session_idx]];
    if (socketId === q.correta) {
        playSound("correct.wav");
        current_q_session_idx++;
        if (current_q_session_idx >= session_questions.length) {
            final_game_time = performance.now() - game_timer_start;
            playSound("victory.wav");
            state = "vitoria";
        } else {
            startQuestion();
        }
    } else {
        playSound("wrong.wav");
        lives--;
        if (lives <= 0) {
            state = "game_over";
        } else {
            restartCurrentPhase();
        }
    }
}

// ─── DESENHO ─────────────────────────────────────────────────────────────────
function drawButton(rect, text, hover) {
    const color = hover ? "#e6e6e6" : "#c8c8c8";
    ctx.fillStyle = color;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = "#323232";
    roundRectStroke(ctx, rect.x, rect.y, rect.w, rect.h, 8, 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w/2, rect.y + rect.h/2);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
    ctx.fill();
}

function roundRectStroke(ctx, x, y, w, h, r, lineW) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
    ctx.lineWidth = lineW;
    ctx.stroke();
}

function drawBackground() {
    if (images["background.png"]) {
        ctx.drawImage(images["background.png"], 0, 0, WIDTH, HEIGHT);
    } else {
        ctx.fillStyle = "#1e1e1e";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
}

// ── MENU ─────────────────────────────────────────────────────────────────────
const menuButtons = {
    jogar:    { x: WIDTH/2 - 110, y: 260, w: 220, h: 60 },
    creditos: { x: WIDTH/2 - 110, y: 340, w: 220, h: 60 },
    sair:     { x: WIDTH/2 - 110, y: 420, w: 220, h: 60 }
};
const menuLabels = { jogar: "Jogar", creditos: "Créditos", sair: "Sair" };

function drawMenu() {
    drawBackground();

    // Título pré-escalado
    const titleImg = titleImagesScaled[current_title_index];
    if (titleImg) {
        const rx = WIDTH/2 - titleScaleW/2;
        ctx.drawImage(titleImg, rx, 60);
    } else {
        // Fallback texto
        const labels = ["CIRCUITO SEGURO - LIGADO","CIRCUITO SEGURO - OFF B","CIRCUITO SEGURO - CHOQUE"];
        const colors = ["#b4b4b4","#a0a0a0","#ffb43c"];
        const tw = Math.floor(WIDTH*0.6);
        ctx.fillStyle = colors[current_title_index];
        roundRect(ctx, WIDTH/2-tw/2, 10, tw, 80, 6);
        ctx.fillStyle = "#0a0a0a";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labels[current_title_index], WIDTH/2, 50);
    }

    // Botões
    const mx = mouse.x, my = mouse.y;
    for (const key of ["jogar","creditos","sair"]) {
        const r = menuButtons[key];
        const hover = mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h;
        drawButton(r, menuLabels[key], hover);
    }
}

// ── INSERIR DADOS ────────────────────────────────────────────────────────────
const ID_CAMPO_W = 320, ID_CAMPO_H = 50;
const ID_CAMPO_NOME  = { x: WIDTH/2 - ID_CAMPO_W/2, y: 290, w: ID_CAMPO_W, h: ID_CAMPO_H };
const ID_CAMPO_TURMA = { x: WIDTH/2 - ID_CAMPO_W/2, y: 380, w: ID_CAMPO_W, h: ID_CAMPO_H };
const ID_BTN_COMECAR = { x: WIDTH/2 - 110, y: 480, w: 220, h: 50 };
const ID_BTN_VOLTAR  = { x: WIDTH/2 - 110, y: 545, w: 220, h: 40 };

function drawCampo(rect, labelText, value, isActive) {
    const mx = mouse.x, my = mouse.y;
    const hovered = mx >= rect.x && mx <= rect.x+rect.w && my >= rect.y && my <= rect.y+rect.h;

    // Label
    ctx.fillStyle = "#c8c864";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(labelText, rect.x, rect.y - 6);

    // Borda
    let borderColor;
    if (isActive) borderColor = "#64b4ff";
    else if (hovered) borderColor = "#a0a0a0";
    else borderColor = "#646464";

    ctx.fillStyle = "#282828";
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.strokeStyle = borderColor;
    roundRectStroke(ctx, rect.x, rect.y, rect.w, rect.h, 8, 2);

    // Texto
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, rect.x + 14, rect.y + rect.h/2);

    // Cursor piscante
    if (isActive) {
        const tw = ctx.measureText(value).width;
        const cx = rect.x + 14 + tw;
        if (Math.floor(performance.now() / 500) % 2 === 0) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, rect.y + 10);
            ctx.lineTo(cx, rect.y + rect.h - 10);
            ctx.stroke();
        }
    }
}

function drawInserirDados() {
    drawBackground();

    // Título
    ctx.fillStyle = "#f0f0f0";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Identificação", WIDTH/2, 200);

    // Campos
    drawCampo(ID_CAMPO_NOME,  "Nome",  player_nome,  inserir_active_field === "nome");
    drawCampo(ID_CAMPO_TURMA, "Turma", player_turma, inserir_active_field === "turma");

    const mx = mouse.x, my = mouse.y;
    const campos_preenchidos = player_nome.trim() !== "" && player_turma.trim() !== "";

    // Botão Começar
    const chover = mx >= ID_BTN_COMECAR.x && mx <= ID_BTN_COMECAR.x+ID_BTN_COMECAR.w &&
                   my >= ID_BTN_COMECAR.y && my <= ID_BTN_COMECAR.y+ID_BTN_COMECAR.h;
    let btnColor;
    if (campos_preenchidos) btnColor = chover ? "#50d350" : "#3cb43c";
    else btnColor = "#464646";

    ctx.fillStyle = btnColor;
    roundRect(ctx, ID_BTN_COMECAR.x, ID_BTN_COMECAR.y, ID_BTN_COMECAR.w, ID_BTN_COMECAR.h, 8);
    ctx.strokeStyle = "#1e1e1e";
    roundRectStroke(ctx, ID_BTN_COMECAR.x, ID_BTN_COMECAR.y, ID_BTN_COMECAR.w, ID_BTN_COMECAR.h, 8, 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Começar", ID_BTN_COMECAR.x + ID_BTN_COMECAR.w/2, ID_BTN_COMECAR.y + ID_BTN_COMECAR.h/2);

    // Botão Voltar
    const vhover = mx >= ID_BTN_VOLTAR.x && mx <= ID_BTN_VOLTAR.x+ID_BTN_VOLTAR.w &&
                   my >= ID_BTN_VOLTAR.y && my <= ID_BTN_VOLTAR.y+ID_BTN_VOLTAR.h;
    ctx.fillStyle = vhover ? "#b4b4b4" : "#8c8c8c";
    roundRect(ctx, ID_BTN_VOLTAR.x, ID_BTN_VOLTAR.y, ID_BTN_VOLTAR.w, ID_BTN_VOLTAR.h, 8);
    ctx.strokeStyle = "#3c3c3c";
    roundRectStroke(ctx, ID_BTN_VOLTAR.x, ID_BTN_VOLTAR.y, ID_BTN_VOLTAR.w, ID_BTN_VOLTAR.h, 8, 2);
    ctx.fillStyle = "#141414";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Voltar", ID_BTN_VOLTAR.x + ID_BTN_VOLTAR.w/2, ID_BTN_VOLTAR.y + ID_BTN_VOLTAR.h/2);
}

// ── CRÉDITOS ─────────────────────────────────────────────────────────────────
const CREDITS_TEXT_LINES = [
    "Desenvolvimento: Santiago 11ºB",
    "",
    "Design: Santiago 11ºB",
    "",
    "Música: Dark Heart by Walen",
    "",
    "Perguntas: Afonso Pinto, João Esteves, Lucas Pinheiro",
    "",
    "Prémios: Martim Gomes, Pedro Almeida, Diego Luís",
    "",
    "Obrigado por jogar! :)"
];

function drawCredits() {
    drawBackground();

    // Título créditos
    const titleOff = images["credits_title_off.png"];
    const titleOn  = images["credits_title_on.png"];
    const TITLE_MAX_W = Math.floor(WIDTH * 0.6), TITLE_MAX_H = 140;

    if (credits_title_on && titleOn) {
        blitScaledCenter(titleOn, WIDTH/2, 30, TITLE_MAX_W, TITLE_MAX_H, false);
    } else if (!credits_title_on && titleOff) {
        blitScaledCenter(titleOff, WIDTH/2, 30, TITLE_MAX_W, TITLE_MAX_H, false);
    } else {
        const tw = Math.floor(WIDTH*0.6);
        ctx.fillStyle = credits_title_on ? "#dcdc50" : "#787878";
        roundRect(ctx, WIDTH/2-tw/2, 10, tw, 80, 6);
        ctx.fillStyle = "#0a0a0a";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(credits_title_on ? "CREDITOS" : "CREDITOS (DESLIGADO)", WIDTH/2, 50);
    }

    // Painel
    const pw = Math.floor(WIDTH*0.8), ph = Math.floor(HEIGHT*0.55);
    const px = WIDTH/2 - pw/2, py = HEIGHT/2 - ph/2 - 20;
    ctx.fillStyle = "#1e1e1e";
    roundRect(ctx, px, py, pw, ph, 8);
    ctx.strokeStyle = "#c8c8c8";
    roundRectStroke(ctx, px, py, pw, ph, 8, 2);

    // Texto
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "20px arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let ty = py + 20;
    for (const line of CREDITS_TEXT_LINES) {
        if (line === "") { ty += 10; continue; }
        ctx.fillText(line, px + 20, ty);
        ty += 26;
    }

    // Botão Voltar
    const br = { x: WIDTH/2 - 110, y: HEIGHT - 100, w: 220, h: 60 };
    const mx = mouse.x, my = mouse.y;
    const hover = mx >= br.x && mx <= br.x+br.w && my >= br.y && my <= br.y+br.h;
    drawButton(br, "VOLTAR", hover);
}

// ── JOGO ─────────────────────────────────────────────────────────────────────
function drawGameHud(questionText) {
    // Texto da pergunta com word-wrap
    ctx.fillStyle = "#f0f0f0";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const words = questionText.split(" ");
    let line = "", lines = [], yOff = 10;
    for (const word of words) {
        const test = line + word + " ";
        if (ctx.measureText(test).width > WIDTH - 240) {
            if (line) { lines.push(line.trim()); line = word + " "; }
            else { lines.push(word); line = ""; }
        } else { line = test; }
    }
    if (line) lines.push(line.trim());
    for (const l of lines) { ctx.fillText(l, 20, yOff); yOff += 25; }

    // Bateria
    const bx = 20, by = 60, bw = 50, bh = 20;
    let lifeImg;
    if (lives === 3) lifeImg = images["life_full.png"];
    else if (lives === 2) lifeImg = images["life_half.png"];
    else lifeImg = images["life_empty.png"];

    if (lifeImg) {
        ctx.drawImage(lifeImg, bx, by, bw, bh);
    } else {
        const colors = { 3: "#32c832", 2: "#c8c832", 1: "#c83232" };
        ctx.fillStyle = colors[lives] || "#c83232";
        roundRect(ctx, bx, by, bw, bh, 4);
        ctx.strokeStyle = "#141414";
        roundRectStroke(ctx, bx, by, bw, bh, 4, 2);
    }

    // Timer
    const elapsed = performance.now() - game_timer_start;
    const secs = Math.floor(elapsed / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    const timeStr = String(mins).padStart(2,"0") + ":" + String(s).padStart(2,"0");

    const trx = WIDTH - 140, try_ = 60, trw = 120, trh = 24;
    ctx.fillStyle = "#fafafa";
    roundRect(ctx, trx, try_, trw, trh, 6);
    ctx.strokeStyle = "#141414";
    roundRectStroke(ctx, trx, try_, trw, trh, 6, 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(timeStr, trx + trw/2, try_ + trh/2);

    // Instrução inferior
    ctx.fillStyle = "#c8c864";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WASD ou Setas para mover / Leve o robô à resposta correta / Espaço para interagir", WIDTH/2, HEIGHT - 20);
}

function drawGridAndRobot() {
    const CELL_PADDING = 4;

    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            const r = cell_rects[y][x];
            ctx.fillStyle = "#282828";
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = "#646464";
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x, r.y, r.w, r.h);

            const cell = game_grid[y][x];
            const cx = r.x + r.w/2, cy = r.y + r.h/2;
            const sz = CELL_SIZE - CELL_PADDING;

            if (cell === "#") {
                if (images["obstacle.png"]) {
                    ctx.drawImage(images["obstacle.png"], cx - sz/2, cy - sz/2, sz, sz);
                } else {
                    ctx.fillStyle = "#783c3c";
                    roundRect(ctx, r.x+4, r.y+4, r.w-8, r.h-8, 4);
                }
            } else if (cell === "A" || cell === "B" || cell === "C") {
                const spriteKey = "socket_" + cell + ".png";
                if (images[spriteKey]) {
                    ctx.drawImage(images[spriteKey], cx - sz/2, cy - sz/2, sz, sz);
                } else {
                    const colors = { A: "#6496c8", B: "#9664c8", C: "#c89664" };
                    ctx.fillStyle = colors[cell];
                    roundRect(ctx, r.x+5, r.y+5, r.w-10, r.h-10, 6);
                    ctx.fillStyle = "#f0f0f0";
                    ctx.font = "bold 18px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(cell, cx, cy);
                }
            }
        }
    }

    // Robô
    const [rx, ry] = robot_cell;
    const rr = cell_rects[ry][rx];
    const rcx = rr.x + rr.w/2, rcy = rr.y + rr.h/2;
    const target = Math.floor((CELL_SIZE - 4) * 0.95);

    let spriteKey;
    if (robot_grid_dir === "left") spriteKey = "robot_left.png";
    else if (robot_grid_dir === "right") spriteKey = "robot_right.png";
    else spriteKey = "robot_front.png";

    const robotImg = images[spriteKey];
    if (robotImg) {
        // Manter proporção original
        const scale = target / Math.max(robotImg.width, robotImg.height);
        const dw = robotImg.width * scale;
        const dh = robotImg.height * scale;
        ctx.drawImage(robotImg, rcx - dw/2, rcy - dh/2, dw, dh);
    } else {
        ctx.fillStyle = "#c8c8c8";
        roundRect(ctx, rr.x+5, rr.y+5, rr.w-10, rr.h-10, 6);
        ctx.strokeStyle = "#282828";
        roundRectStroke(ctx, rr.x+5, rr.y+5, rr.w-10, rr.h-10, 6, 2);
    }
}

function drawAnswerPanel(question) {
    const px = answer_panel_x, py = GRID_Y, pw = 260, ph = answer_panel_height;

    ctx.fillStyle = "#191919";
    roundRect(ctx, px, py, pw, ph, 8);
    ctx.strokeStyle = "#969696";
    roundRectStroke(ctx, px, py, pw, ph, 8, 2);

    ctx.fillStyle = "#f0f0f0";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Respostas:", px + 15, py + 15);

    const respostas = question.respostas || {};
    let yOff = py + 50;
    for (const key of ["A","B","C"]) {
        if (!(key in respostas)) continue;
        ctx.fillStyle = "#c8c864";
        ctx.font = "18px sans-serif";
        ctx.fillText(key + ":", px + 20, yOff);

        // Word-wrap da resposta
        const ansText = respostas[key];
        const ansWords = ansText.split(" ");
        let ansLine = "", ansLineY = yOff + 30;
        const maxLW = pw - 40;
        ctx.font = "15px sans-serif";
        ctx.fillStyle = "#dcdcdc";
        for (const w of ansWords) {
            const test = ansLine + w + " ";
            if (ctx.measureText(test).width > maxLW) {
                if (ansLine) { ctx.fillText(ansLine.trim(), px+20, ansLineY); ansLine = w+" "; ansLineY += 22; }
                else { ctx.fillText(w, px+20, ansLineY); ansLineY += 22; }
            } else { ansLine = test; }
        }
        if (ansLine) ctx.fillText(ansLine.trim(), px+20, ansLineY);

        yOff += 95;
    }
}

function drawGame() {
    drawBackground();
    const q = all_questions[session_questions[current_q_session_idx]];
    drawGameHud(q.texto);
    drawGridAndRobot();
    drawAnswerPanel(q);
}

// ── VITÓRIA ──────────────────────────────────────────────────────────────────
function drawVictoryScreen() {
    drawBackground();

    if (images["victory_congratulations.png"]) {
        blitScaledCenter(images["victory_congratulations.png"], WIDTH/2, 80, Math.floor(WIDTH*0.8), 300, true);
    } else {
        ctx.fillStyle = "#f0f064";
        ctx.font = "bold 36px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PARABÉNS", WIDTH/2, 150);
    }

    const secs = Math.floor(final_game_time / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;

    // Painel tempo
    const tpx = WIDTH/2 - 200, tpy = 380, tpw = 400, tph = 100;
    ctx.fillStyle = "#1e1e1e";
    roundRect(ctx, tpx, tpy, tpw, tph, 8);
    ctx.strokeStyle = "#c8c8c8";
    roundRectStroke(ctx, tpx, tpy, tpw, tph, 8, 2);

    ctx.fillStyle = "#e6e6e6";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Completaste o jogo em:", WIDTH/2, tpy + 25);

    ctx.fillStyle = "#f0f064";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(String(mins).padStart(2,"0") + ":" + String(s).padStart(2,"0"), WIDTH/2, tpy + 65);

    // Botão
    const br = { x: WIDTH/2 - 110, y: HEIGHT - 80, w: 220, h: 60 };
    const mx = mouse.x, my = mouse.y;
    const hover = mx >= br.x && mx <= br.x+br.w && my >= br.y && my <= br.y+br.h;
    drawButton(br, "VOLTAR AO MENU", hover);
}

// ── GAME OVER ────────────────────────────────────────────────────────────────
function drawGameOverScreen() {
    drawBackground();

    if (images["game_over_battery.png"]) {
        blitScaledCenter(images["game_over_battery.png"], WIDTH/2, 100, Math.floor(WIDTH*0.8), 400, true);
    } else {
        ctx.fillStyle = "#f05050";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("O Robô ficou sem Bateria", WIDTH/2, 200);
        ctx.fillStyle = "#dcdcdc";
        ctx.font = "18px sans-serif";
        ctx.fillText("TENTE NOVAMENTE", WIDTH/2, 280);
    }

    const br = { x: WIDTH/2 - 110, y: HEIGHT - 80, w: 220, h: 60 };
    const mx = mouse.x, my = mouse.y;
    const hover = mx >= br.x && mx <= br.x+br.w && my >= br.y && my <= br.y+br.h;
    drawButton(br, "VOLTAR AO MENU", hover);
}

// ── HELPER: blit escalado centrado (usado nos créditos e fim de jogo) ────────
function blitScaledCenter(img, midtopX, topY, maxW, maxH, allowUpscale) {
    if (!img) return;
    let scale = Math.min(maxW / img.width, maxH / img.height);
    if (!allowUpscale) scale = Math.min(scale, 1.0);
    const nw = Math.max(1, Math.floor(img.width * scale));
    const nh = Math.max(1, Math.floor(img.height * scale));
    ctx.drawImage(img, midtopX - nw/2, topY, nw, nh);
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
const mouse = { x: 0, y: 0 };
const keys = {};

function hitTest(rect) {
    return mouse.x >= rect.x && mouse.x <= rect.x + rect.w &&
           mouse.y >= rect.y && mouse.y <= rect.y + rect.h;
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
}

function onMouseClick(e) {
    // Garantir que a música começa (browsers precisam de interação)
    tryPlayMusic();

    if (state === "menu") {
        if (hitTest(menuButtons.jogar)) {
            stopSound("shock.wav");
            state = "inserir_dados";
            inserir_active_field = "nome";
        } else if (hitTest(menuButtons.creditos)) {
            stopSound("shock.wav");
            state = "creditos";
            credits_title_on = false;
            credits_title_switch_time = performance.now() + 1000;
        } else if (hitTest(menuButtons.sair)) {
            // Em web não há "sair" — pode fechar a tab
        }
    } else if (state === "inserir_dados") {
        if (hitTest(ID_CAMPO_NOME)) inserir_active_field = "nome";
        else if (hitTest(ID_CAMPO_TURMA)) inserir_active_field = "turma";
        else if (hitTest(ID_BTN_COMECAR)) {
            if (player_nome.trim() !== "" && player_turma.trim() !== "") {
                startGameSession();
                state = "jogo";
            }
        } else if (hitTest(ID_BTN_VOLTAR)) {
            state = "menu";
        }
    } else if (state === "creditos") {
        const br = { x: WIDTH/2 - 110, y: HEIGHT - 100, w: 220, h: 60 };
        if (hitTest(br)) state = "menu";
    } else if (state === "vitoria") {
        const br = { x: WIDTH/2 - 110, y: HEIGHT - 80, w: 220, h: 60 };
        if (hitTest(br)) state = "menu";
    } else if (state === "game_over") {
        const br = { x: WIDTH/2 - 110, y: HEIGHT - 80, w: 220, h: 60 };
        if (hitTest(br)) state = "menu";
    }
}

function onKeyDown(e) {
    // Escape → menu
    if (e.key === "Escape") { state = "menu"; return; }

    // ── inserir_dados ──
    if (state === "inserir_dados") {
        if (e.key === "Tab") {
            e.preventDefault();
            inserir_active_field = inserir_active_field === "nome" ? "turma" : "nome";
        } else if (e.key === "Enter") {
            if (player_nome.trim() !== "" && player_turma.trim() !== "") {
                startGameSession();
                state = "jogo";
            }
        } else if (e.key === "Backspace") {
            e.preventDefault();
            if (inserir_active_field === "nome") player_nome = player_nome.slice(0,-1);
            else player_turma = player_turma.slice(0,-1);
        } else if (e.key.length === 1) {
            if (inserir_active_field === "nome" && player_nome.length < 25) player_nome += e.key;
            else if (inserir_active_field === "turma" && player_turma.length < 15) player_turma += e.key;
        }
        return;
    }

    // ── jogo ──
    if (state === "jogo") {
        let [rx, ry] = robot_cell;
        if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
            const nx = Math.max(0, rx - 1);
            if (game_grid[ry][nx] !== "#") { robot_cell = [nx, ry]; robot_grid_dir = "left"; }
        } else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
            const nx = Math.min(GRID_COLS-1, rx + 1);
            if (game_grid[ry][nx] !== "#") { robot_cell = [nx, ry]; robot_grid_dir = "right"; }
        } else if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") {
            const ny = Math.max(0, ry - 1);
            if (game_grid[ny][rx] !== "#") { robot_cell = [rx, ny]; robot_grid_dir = "front"; }
        } else if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
            const ny = Math.min(GRID_ROWS-1, ry + 1);
            if (game_grid[ny][rx] !== "#") { robot_cell = [rx, ny]; robot_grid_dir = "front"; }
        } else if (e.key === " ") {
            e.preventDefault();
            const [cx, cy] = robot_cell;
            const cell = game_grid[cy][cx];
            if (["A","B","C"].includes(cell)) handleSocketInteraction(cell);
        }
    }
}

// ─── TIMER DO TÍTULO ─────────────────────────────────────────────────────────
setInterval(() => {
    if (state !== "menu") return;
    let next = Math.floor(Math.random() * TITLE_FILES.length);
    if (next === current_title_index && Math.random() < 0.5) {
        const choices = TITLE_FILES.map((_,i) => i).filter(i => i !== current_title_index);
        next = choices[Math.floor(Math.random() * choices.length)];
    }
    current_title_index = next;
    if (current_title_index === 2) playSound("shock.wav");
    else stopSound("shock.wav");
}, TITLE_CHANGE_MS);

// ─── GAME LOOP ───────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
    // Créditos: timer do título
    if (state === "creditos") {
        if (!credits_title_on && credits_title_switch_time && performance.now() >= credits_title_switch_time) {
            credits_title_on = true;
        }
    }

    // Desenhar
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    switch(state) {
        case "menu":          drawMenu();            break;
        case "inserir_dados": drawInserirDados();    break;
        case "jogo":          drawGame();            break;
        case "creditos":      drawCredits();         break;
        case "vitoria":       drawVictoryScreen();   break;
        case "game_over":     drawGameOverScreen();  break;
    }

    animFrame = requestAnimationFrame(gameLoop);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onMouseClick);
    document.addEventListener("keydown", onKeyDown);

    loadAllAssets();
}

window.addEventListener("load", init);
