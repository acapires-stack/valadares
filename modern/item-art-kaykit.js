// Inventory icons rendered from the same licensed GLBs used in the character's hands.
// Loading is non-blocking: callers keep their existing 2D art until each icon is ready.
import {equipmentVisualCatalog} from './equipment-visuals.js';

const imageByModel = new Map();
const stateByModel = new Map();
const baseId = itemId => typeof itemId === 'string'
    ? itemId.replace(/_PLUS_\d+$/, '') : '';
const modelFor = itemId => equipmentVisualCatalog[baseId(itemId)] || null;

function preloadModel(model) {
    if (stateByModel.has(model)) return;
    stateByModel.set(model, 'loading');
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
        stateByModel.set(model, 'ready');
        window.dispatchEvent(new CustomEvent('valadares:kaykit-icon-ready', {
            detail: {model}
        }));
    };
    image.onerror = () => stateByModel.set(model, 'failed');
    image.src = new URL(`./assets/weapons-bits/icons/${model}.png`, import.meta.url).href;
    imageByModel.set(model, image);
}

export function preloadEquipmentIcons() {
    for (const model of new Set(Object.values(equipmentVisualCatalog))) preloadModel(model);
}

export function getIconURL(itemId) {
    const model = modelFor(itemId);
    if (!model) return null;
    preloadModel(model);
    return stateByModel.get(model) === 'ready' ? imageByModel.get(model).src : null;
}

export function drawIcon(ctx, definition, itemId, size) {
    const model = modelFor(itemId);
    if (!model || !ctx || !Number.isFinite(size) || size <= 0) return false;
    // No visual replacement for unrelated armor, boots, loot, or broken image loads.
    if (definition && !['weapon', 'wand', 'offhand'].includes(definition.kind)) return false;
    preloadModel(model);
    if (stateByModel.get(model) !== 'ready') return false;
    const oldSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imageByModel.get(model), 0, 0, size, size);
    ctx.imageSmoothingEnabled = oldSmoothing;
    return true;
}

export const itemArtCatalog = equipmentVisualCatalog;
window.ValadaresKayKitItemArt = Object.freeze({getIconURL, drawIcon, preloadEquipmentIcons, itemArtCatalog});
preloadEquipmentIcons();
