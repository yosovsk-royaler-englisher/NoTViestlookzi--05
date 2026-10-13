import { app } from "../../scripts/app.js";

/**
 * Slot Position - ComfyUI Extension
 * 
 * Permite reposicionar visualmente os slots de qualquer nó.
 * Backend 100% inalterado.
 */

const EXTENSION_NAME = "SlotPosition";

// ============================================================
// CONFIGURAÇÃO DAS POSIÇÕES
// ============================================================

const POSITIONS = {
    "top-left":     { side: "top",    align: "left",   icon: "↖" },
    "top":          { side: "top",    align: "center", icon: "↑" },
    "top-right":    { side: "top",    align: "right",  icon: "↗" },
    "left":         { side: "left",   align: "center", icon: "←" },
    "right":        { side: "right",  align: "center", icon: "→" },
    "bottom-left":  { side: "bottom", align: "left",   icon: "↙" },
    "bottom":       { side: "bottom", align: "center", icon: "↓" },
    "bottom-right": { side: "bottom", align: "right",  icon: "↘" },
};

const GRID_LAYOUT = [
    ["top-left",    "top",    "top-right"],
    ["left",        null,     "right"],
    ["bottom-left", "bottom", "bottom-right"],
];

// ============================================================
// CONSTANTES DO LITEGRAPH
// ============================================================

const NODE_TITLE_HEIGHT = 30;   // altura do título do node
const SLOT_HEIGHT = 20;         // altura padrão de cada slot
const SLOT_MARGIN = 8;          // margem das bordas
const SLOT_SPACING = 4;         // espaço entre slots

// ============================================================
// UTILITÁRIOS
// ============================================================

function getSlotSide(node) {
    return node.properties?.slotSide || "default";
}

function setSlotSide(node, side) {
    if (!node.properties) node.properties = {};
    node.properties.slotSide = side;
    node.setDirtyCanvas(true, true);
}

/**
 * Calcula a posição de um slot em relação ao node.
 * 
 * @param {LGraphNode} node - O node
 * @param {number} slot - Índice do slot
 * @param {number} total - Total de slots nessa direção
 * @param {string} side - "top" | "bottom" | "left" | "right"
 * @param {string} align - "left" | "center" | "right"
 * @param {boolean} isInput - Se é input (afeta o offset do título em "top")
 * @returns {[number, number]} - Coordenadas [x, y] absolutas no canvas
 */
function computeSlotPos(node, slot, total, side, align, isInput) {
    const [nx, ny] = node.pos;
    const [nw, nh] = node.size;

    // Ponto de partida: canto superior esquerdo do node
    // Se for "top" e o node tem título, o slot começa DEPOIS do título
    const topOffset = (side === "top") ? NODE_TITLE_HEIGHT : 0;

    // Área útil para distribuir os slots
    let usableStart, usableEnd;

    if (side === "top" || side === "bottom") {
        usableStart = SLOT_MARGIN;
        usableEnd = nw - SLOT_MARGIN;
    } else {
        // left/right: distribui verticalmente, mas começa depois do título
        usableStart = topOffset + SLOT_MARGIN;
        usableEnd = nh - SLOT_MARGIN;
    }

    const usableSize = usableEnd - usableStart;
    const step = usableSize / (total + 1);

    // Posição "linear" do slot dentro da área útil
    const linearPos = usableStart + step * (slot + 1);

    // Aplica o alinhamento
    let finalLinearPos = linearPos;
    if (align === "left") {
        finalLinearPos = usableStart + SLOT_MARGIN + slot * (SLOT_HEIGHT + SLOT_SPACING);
    } else if (align === "right") {
        finalLinearPos = usableEnd - SLOT_MARGIN - (total - 1 - slot) * (SLOT_HEIGHT + SLOT_SPACING);
    }
    // "center" usa o linearPos original (distribuído igualmente)

    // Converte pra coordenadas absolutas
    switch (side) {
        case "top":
            return [nx + finalLinearPos, ny + topOffset];
        case "bottom":
            return [nx + finalLinearPos, ny + nh];
        case "left":
            return [nx, ny + finalLinearPos];
        case "right":
            return [nx + nw, ny + finalLinearPos];
    }

    return [nx, ny];
}

// ============================================================
// POPUP DE SELEÇÃO DE POSIÇÃO
// ============================================================

function openPositionPopup(node, event) {
    const existing = document.getElementById("slot-position-popup");
    if (existing) existing.remove();

    // Usa as coordenadas do evento se disponível, senão o centro da tela
    const evtX = event?.clientX ?? window.innerWidth / 2;
    const evtY = event?.clientY ?? window.innerHeight / 2;

    const popup = document.createElement("div");
    popup.id = "slot-position-popup";
    popup.style.cssText = `
        position: fixed;
        left: ${evtX}px;
        top: ${evtY}px;
        background: #2a2a2a;
        border: 1px solid #555;
        border-radius: 8px;
        padding: 10px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        font-family: sans-serif;
        color: #fff;
        user-select: none;
        transform: translate(-50%, -50%);
    `;

    const title = document.createElement("div");
    title.textContent = "Slot Position";
    title.style.cssText = `
        font-size: 13px;
        font-weight: bold;
        margin-bottom: 8px;
        text-align: center;
        color: #aaa;
    `;
    popup.appendChild(title);

    const grid = document.createElement("div");
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 40px);
        grid-template-rows: repeat(3, 40px);
        gap: 4px;
        justify-content: center;
    `;

    GRID_LAYOUT.forEach(row => {
        row.forEach(cell => {
            const btn = document.createElement("button");
            btn.style.cssText = `
                width: 40px;
                height: 40px;
                border: 1px solid #555;
                border-radius: 6px;
                background: #1d1d1d;
                color: #fff;
                font-size: 18px;
                cursor: pointer;
                transition: background 0.15s;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            if (cell === null) {
                btn.style.background = "transparent";
                btn.style.border = "1px dashed #333";
                btn.style.cursor = "default";
                btn.disabled = true;
            } else {
                const pos = POSITIONS[cell];
                btn.textContent = pos.icon;
                btn.title = cell;

                if (getSlotSide(node) === cell) {
                    btn.style.background = "#4a80af";
                    btn.style.borderColor = "#6aa0d0";
                }

                btn.onmouseenter = () => { btn.style.background = "#3a3a3a"; };
                btn.onmouseleave = () => {
                    if (getSlotSide(node) !== cell) {
                        btn.style.background = "#1d1d1d";
                    }
                };
                btn.onclick = (e) => {
                    e.stopPropagation();
                    setSlotSide(node, cell);
                    popup.remove();
                };
            }

            grid.appendChild(btn);
        });
    });

    popup.appendChild(grid);

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset (default)";
    resetBtn.style.cssText = `
        width: 100%;
        margin-top: 8px;
        padding: 6px;
        background: #1d1d1d;
        border: 1px solid #555;
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
    `;
    resetBtn.onmouseenter = () => { resetBtn.style.background = "#3a3a3a"; };
    resetBtn.onmouseleave = () => { resetBtn.style.background = "#1d1d1d"; };
    resetBtn.onclick = (e) => {
        e.stopPropagation();
        setSlotSide(node, "default");
        popup.remove();
    };
    popup.appendChild(resetBtn);

    // Ajusta posição se estourar a tela
    document.body.appendChild(popup);
    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        popup.style.left = `${window.innerWidth - rect.width / 2 - 20}px`;
    }
    if (rect.bottom > window.innerHeight) {
        popup.style.top = `${window.innerHeight - rect.height / 2 - 20}px`;
    }
    if (rect.left < 0) popup.style.left = `${rect.width / 2 + 20}px`;
    if (rect.top < 0) popup.style.top = `${rect.height / 2 + 20}px`;

    const closeHandler = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener("mousedown", closeHandler);
        }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
}

// ============================================================
// MONKEY-PATCH: getInputPos / getOutputPos
// ============================================================

function patchSlotPositions() {
    const LGraphNode = window.LiteGraph?.LGraphNode;
    if (!LGraphNode) {
        console.warn("[SlotPosition] LiteGraph não encontrado.");
        return;
    }

    const originalGetInputPos = LGraphNode.prototype.getInputPos;
    const originalGetOutputPos = LGraphNode.prototype.getOutputPos;

    // ---------- INPUT ----------
    LGraphNode.prototype.getInputPos = function(slot) {
        const side = this.properties?.slotSide;
        if (!side || side === "default") {
            return originalGetInputPos.call(this, slot);
        }

        const pos = POSITIONS[side];
        if (!pos) return originalGetInputPos.call(this, slot);

        const total = this.inputs?.length || 1;
        return computeSlotPos(this, slot, total, pos.side, pos.align, true);
    };

    // ---------- OUTPUT ----------
    LGraphNode.prototype.getOutputPos = function(slot) {
        const side = this.properties?.slotSide;
        if (!side || side === "default") {
            return originalGetOutputPos.call(this, slot);
        }

        const pos = POSITIONS[side];
        if (!pos) return originalGetOutputPos.call(this, slot);

        const total = this.outputs?.length || 1;
        return computeSlotPos(this, slot, total, pos.side, pos.align, false);
    };

    console.log("[SlotPosition] Monkey-patch aplicado.");
}

// ============================================================
// DRAG & DROP DOS SLOTS
// ============================================================

/**
 * Corrige o hitbox dos slots quando reposicionados.
 * O LiteGraph calcula o hitbox baseado em posição — se a posição mudou,
 * o hitbox já acompanha automaticamente porque ele chama getInputPos/getOutputPos.
 * 
 * MAS: o `slot.pos` ainda é o padrão (esquerda/direita). Precisamos
 * sincronizar `slot.pos` com a nova posição pra que `getSlotOnPos` funcione.
 */
function syncSlotPositions() {
    const LGraphNode = window.LiteGraph?.LGraphNode;
    if (!LGraphNode) return;

    // Extende o `drawNode` pra sincronizar antes de desenhar
    const LGraphCanvas = window.LGraphCanvas;
    if (!LGraphCanvas) return;

    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function(node, ctx) {
        // Sincroniza `slot.pos` com a posição real ANTES de desenhar
        // Isso faz com que o hitbox e o hover funcionem
        const side = node.properties?.slotSide;
        if (side && side !== "default") {
            const pos = POSITIONS[side];
            if (pos) {
                node.inputs?.forEach((input, i) => {
                    const [x, y] = computeSlotPos(node, i, node.inputs.length, pos.side, pos.align, true);
                    input.pos = [x - node.pos[0], y - node.pos[1]];
                    input._pos = input.pos; // cache interno do LiteGraph
                });
                node.outputs?.forEach((output, i) => {
                    const [x, y] = computeSlotPos(node, i, node.outputs.length, pos.side, pos.align, false);
                    output.pos = [x - node.pos[0], y - node.pos[1]];
                    output._pos = output.pos;
                });
            }
        }
        return originalDrawNode.call(this, node, ctx);
    };

    console.log("[SlotPosition] Sync de slot.pos ativado.");
}

// ============================================================
// PROTEÇÃO: só ativar em nodes com a flag
// ============================================================

/**
 * Verifica se o node permite reposicionamento.
 * Por padrão, TODOS os nodes permitem, exceto se tiver
 * `node.properties.disableSlotPosition = true`.
 */
function isSlotPositionEnabled(node) {
    return node.properties?.disableSlotPosition !== true;
}

// ============================================================
// EXTENSÃO COMFYUI
// ============================================================

app.registerExtension({
    name: EXTENSION_NAME,

    async setup() {
        patchSlotPositions();
        syncSlotPositions();

        const LGraphCanvas = window.LGraphCanvas;
        if (!LGraphCanvas) {
            console.warn("[SlotPosition] LGraphCanvas não encontrado.");
            return;
        }

        const origGetNodeMenuOptions = LGraphCanvas.prototype.getNodeMenuOptions;
        LGraphCanvas.prototype.getNodeMenuOptions = function(node) {
            const options = origGetNodeMenuOptions.call(this, node);

            if (!isSlotPositionEnabled(node)) return options;

            options.push(null);
            options.push({
                content: "🎯 Slot Position...",
                callback: (value, options, event) => {
                    openPositionPopup(node, event);
                }
            });
            options.push({
                content: "🔄 Reset Slot Position",
                callback: () => {
                    setSlotSide(node, "default");
                }
            });

            return options;
        };

        console.log("[SlotPosition] Extensão carregada.");
    }
});