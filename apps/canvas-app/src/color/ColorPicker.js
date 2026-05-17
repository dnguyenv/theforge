import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class ColorPicker {
    constructor(container) {
        this.container = container;
        this.hue = 0;
        this.saturation = 0.8;
        this.brightness = 0.5;
        this.history = [];

        this._build();
    }

    _build() {
        this.container.innerHTML = `
            <div class="color-picker">
                <canvas class="cp-wheel" width="200" height="200"></canvas>
                <canvas class="cp-square" width="150" height="150"></canvas>
                <div class="cp-preview"></div>
                <div class="cp-history"></div>
                <input type="text" class="cp-hex" maxlength="7">
            </div>
        `;

        this.wheelCanvas = this.container.querySelector('.cp-wheel');
        this.squareCanvas = this.container.querySelector('.cp-square');
        this.preview = this.container.querySelector('.cp-preview');
        this.hexInput = this.container.querySelector('.cp-hex');
        this.historyEl = this.container.querySelector('.cp-history');

        this._drawWheel();
        this._drawSquare();
        this._updatePreview();

        this.wheelCanvas.addEventListener('pointerdown', (e) => this._onWheelClick(e));
        this.wheelCanvas.addEventListener('pointermove', (e) => {
            if (e.buttons) this._onWheelClick(e);
        });
        this.squareCanvas.addEventListener('pointerdown', (e) => this._onSquareClick(e));
        this.squareCanvas.addEventListener('pointermove', (e) => {
            if (e.buttons) this._onSquareClick(e);
        });
        this.hexInput.addEventListener('change', () => this._onHexInput());
    }

    _drawWheel() {
        const ctx = this.wheelCanvas.getContext('2d');
        const cx = 100, cy = 100, outerR = 95, innerR = 70;

        for (let angle = 0; angle < 360; angle++) {
            const startAngle = (angle - 1) * Math.PI / 180;
            const endAngle = (angle + 1) * Math.PI / 180;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
            ctx.fill();
        }
    }

    _drawSquare() {
        const ctx = this.squareCanvas.getContext('2d');
        const size = 150;
        const imageData = ctx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const s = x / size;
                const v = 1 - y / size;
                const [r, g, b] = hsvToRgb(this.hue, s, v);
                const idx = (y * size + x) * 4;
                imageData.data[idx] = r;
                imageData.data[idx + 1] = g;
                imageData.data[idx + 2] = b;
                imageData.data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    _onWheelClick(e) {
        const rect = this.wheelCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left - 100;
        const y = e.clientY - rect.top - 100;
        const dist = Math.sqrt(x * x + y * y);
        if (dist < 65 || dist > 100) return;

        this.hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        this._drawSquare();
        this._emitColor();
    }

    _onSquareClick(e) {
        const rect = this.squareCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(149, e.clientX - rect.left));
        const y = Math.max(0, Math.min(149, e.clientY - rect.top));
        this.saturation = x / 150;
        this.brightness = 1 - y / 150;
        this._emitColor();
    }

    _onHexInput() {
        const hex = this.hexInput.value;
        if (/^#[0-9a-f]{6}$/i.test(hex)) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const [h, s, v] = rgbToHsv(r, g, b);
            this.hue = h;
            this.saturation = s;
            this.brightness = v;
            this._drawSquare();
            this._emitColor();
        }
    }

    _emitColor() {
        const [r, g, b] = hsvToRgb(this.hue, this.saturation, this.brightness);
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        this._updatePreview();
        this.hexInput.value = hex;

        if (this.history[this.history.length - 1] !== hex) {
            this.history.push(hex);
            if (this.history.length > 10) this.history.shift();
            this._renderHistory();
        }

        bus.emit(EVENTS.COLOR_CHANGE, { color: hex });
    }

    _updatePreview() {
        const [r, g, b] = hsvToRgb(this.hue, this.saturation, this.brightness);
        this.preview.style.backgroundColor = `rgb(${r},${g},${b})`;
    }

    _renderHistory() {
        this.historyEl.innerHTML = this.history
            .map(c => `<div class="cp-swatch" style="background:${c}" data-color="${c}"></div>`)
            .join('');
        this.historyEl.querySelectorAll('.cp-swatch').forEach(el => {
            el.addEventListener('click', () => {
                this.hexInput.value = el.dataset.color;
                this._onHexInput();
            });
        });
    }

    setColor(hex) {
        this.hexInput.value = hex;
        this._onHexInput();
    }
}

function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [h, s, v];
}
