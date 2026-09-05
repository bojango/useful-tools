(() => {
  const $ = id => document.getElementById(id);

  const palettes = {
    termgreen:{type:'mono',colors:['#020703','#0b2a12','#25a83a','#86ff78']},
    amber:{type:'mono',colors:['#080400','#3a1d00','#c77400','#ffd36a']},
    ice:{type:'mono',colors:['#020708','#0b2c36','#1ca6b8','#b7fbff']},
    paper:{type:'mono',colors:['#050505','#474747','#a6a6a6','#f1f1ea']},
    gameboy:{type:'mono',colors:['#0f380f','#306230','#8bac0f','#9bbc0f']},
    cga:{type:'color',colors:['#000000','#006f73','#b000a8','#ffffff']},
    red:{type:'mono',colors:['#090101','#490909','#bd2020','#ff8585']},
    violet:{type:'mono',colors:['#07020a','#36104a','#9b35c7','#edb5ff']},
    appleii:{type:'color',colors:['#000000','#402c7d','#1882ff','#42d9ff','#7d4d2a','#c95f43','#ffb482','#ffffff']},
    pico8:{type:'color',colors:['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa']},
    cyberpunk:{type:'color',colors:['#05010d','#18053a','#40105f','#00f0ff','#00b6ff','#ffe600','#ffb000','#ff00aa','#ff4fd8','#ffffff']},
    teletext:{type:'color',colors:['#000000','#ff0000','#00ff00','#ffff00','#0000ff','#ff00ff','#00ffff','#ffffff']}
  };

  const asciiPresets = {
    standard:'@%#*+=-:. ',
    dense:'$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
    blocks:'█▓▒░ ',
    tech:'@#S%?*+;:,. '
  };

  const defaultState = {
    renderMode:'bitmap', palette:'termgreen', dither:'ordered', pixelSize:4, brightness:0, contrast:0,
    levels:4, ditherStrength:85, gamma:100, invert:false, scanlines:0, vignette:0,
    exportSize:'2048', asciiPreset:'standard'
  };

  let sourceImage = null, sourceUrl = '', sourceName = '', renderTimer = 0, renderToken = 0;
  const outputCanvas = $('outputCanvas');
  const outputCtx = outputCanvas.getContext('2d', { alpha:false, willReadFrequently:false });
  const workCanvas = document.createElement('canvas');
  const workCtx = workCanvas.getContext('2d', { willReadFrequently:true });

  function setStatus(text, type='') {
    $('status').textContent = text;
    $('status').className = 'status' + (type ? ' ' + type : '');
  }
  function setTop(text) {
    $('topStatus').textContent = text;
    $('renderStatus').textContent = text;
  }
  function readState() {
    return {
      renderMode:$('renderMode').value,
      palette:$('palette').value,
      dither:$('dither').value,
      pixelSize:+$('pixelSize').value,
      brightness:+$('brightness').value,
      contrast:+$('contrast').value,
      levels:+$('levels').value,
      ditherStrength:+$('ditherStrength').value,
      gamma:+$('gamma').value,
      invert:$('invert').checked,
      scanlines:+$('scanlines').value,
      vignette:+$('vignette').value,
      exportSize:$('exportSize').value,
      asciiPreset:$('asciiPreset').value
    };
  }
  function setState(s) {
    for (const [k, v] of Object.entries(s)) {
      const el = $(k);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
    }
    updateLabels();
    updatePaletteStrip();
    updateModeUi();
    scheduleRender();
  }
  function updateLabels() {
    $('pixelSizeValue').textContent = $('pixelSize').value + 'px';
    $('brightnessValue').textContent = $('brightness').value;
    $('contrastValue').textContent = $('contrast').value;
    $('ditherStrengthValue').textContent = $('ditherStrength').value + '%';
    $('gammaValue').textContent = (+$('gamma').value / 100).toFixed(2);
    $('scanlinesValue').textContent = $('scanlines').value + '%';
    $('vignetteValue').textContent = $('vignette').value + '%';
    $('paletteMeta').textContent = $('palette').selectedOptions[0].text.toUpperCase();
    $('modeMeta').textContent = $('renderMode').selectedOptions[0].text.toUpperCase();
  }
  function updatePaletteStrip() {
    const p = palettes[$('palette').value].colors;
    $('paletteStrip').innerHTML = p.slice(0, 16).map(c => `<span style="background:${c}"></span>`).join('');
  }
  function updateModeUi() {
    const ascii = $('renderMode').value === 'ascii';
    $('asciiPreset').closest('.field').style.display = ascii ? '' : 'none';
  }
  function dimensions(state) {
    const w = sourceImage.naturalWidth, h = sourceImage.naturalHeight, max = Math.max(w, h);
    let scale = 1;
    if (state.exportSize !== 'source') {
      const cap = +state.exportSize;
      scale = Math.min(1, cap / max);
    }
    return { w:Math.max(1, Math.round(w * scale)), h:Math.max(1, Math.round(h * scale)) };
  }
  function rgbFromHex(hex) {
    return [parseInt(hex.slice(1,3), 16), parseInt(hex.slice(3,5), 16), parseInt(hex.slice(5,7), 16)];
  }
  function monoPalette(base, levels) {
    if (base.length <= levels) return base.map(rgbFromHex);
    if (levels === 2) return [rgbFromHex(base[0]), rgbFromHex(base[base.length - 1])];
    if (levels === 3) return [rgbFromHex(base[0]), rgbFromHex(base[Math.floor((base.length - 1) / 2)]), rgbFromHex(base[base.length - 1])];
    const out = [];
    for (let i = 0; i < levels; i++) {
      const idx = Math.round(i * (base.length - 1) / (levels - 1));
      out.push(rgbFromHex(base[idx]));
    }
    return out;
  }
  function fullPalette(base) {
    return base.map(rgbFromHex);
  }
  function clamp255(v) { return Math.max(0, Math.min(255, v)); }
  function luminance(r,g,b) { return .2126 * r + .7152 * g + .0722 * b; }
  function toneChannel(v, state) {
    v += state.brightness * 2.55;
    const c = state.contrast * 2.55;
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    v = factor * (v - 128) + 128;
    v = clamp255(v);
    const gamma = state.gamma / 100;
    v = 255 * Math.pow(v / 255, 1 / gamma);
    if (state.invert) v = 255 - v;
    return clamp255(v);
  }
  function applyToneRgb(r, g, b, state) {
    return [toneChannel(r, state), toneChannel(g, state), toneChannel(b, state)];
  }
  function quantIndex(v, count) {
    return Math.max(0, Math.min(count - 1, Math.round(v / 255 * (count - 1))));
  }
  function nearestColor(rgb, palette) {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = rgb[0] - p[0], dg = rgb[1] - p[1], db = rgb[2] - p[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }
  const bayer4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  function randomSigned(x, y) {
    let n = (x * 374761393 + y * 668265263) >>> 0;
    n = (n ^ (n >>> 13)) * 1274126177 >>> 0;
    n ^= n >>> 16;
    return (n / 4294967295) - .5;
  }

  function processMono(data, w, h, state, palette) {
    const levels = palette.length;
    const strength = state.ditherStrength / 100;
    const vals = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const [r,g,b] = applyToneRgb(data[i], data[i + 1], data[i + 2], state);
      vals[p] = luminance(r,g,b);
    }
    const write = (p, idx) => {
      const c = palette[idx], i = p * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    };
    if (state.dither === 'floyd' || state.dither === 'atkinson') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const old = clamp255(vals[p]);
        const idx = quantIndex(old, levels);
        const q = idx * 255 / (levels - 1 || 1);
        const err = (old - q) * strength;
        write(p, idx);
        if (state.dither === 'floyd') {
          if (x + 1 < w) vals[p + 1] += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0) vals[p + w - 1] += err * 3 / 16;
            vals[p + w] += err * 5 / 16;
            if (x + 1 < w) vals[p + w + 1] += err / 16;
          }
        } else {
          const e = err / 8;
          if (x + 1 < w) vals[p + 1] += e;
          if (x + 2 < w) vals[p + 2] += e;
          if (y + 1 < h) {
            if (x > 0) vals[p + w - 1] += e;
            vals[p + w] += e;
            if (x + 1 < w) vals[p + w + 1] += e;
          }
          if (y + 2 < h) vals[p + w * 2] += e;
        }
      }
      return;
    }
    const step = 255 / Math.max(1, levels - 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let v = vals[p];
      if (state.dither === 'ordered') v += (bayer4[y & 3][x & 3] / 15 - .5) * step * strength;
      else if (state.dither === 'random') v += randomSigned(x, y) * step * 1.4 * strength;
      else if (state.dither === 'threshold') v = v < 128 ? 0 : 255;
      write(p, quantIndex(clamp255(v), levels));
    }
  }

  function processColor(data, w, h, state, palette) {
    const strength = state.ditherStrength / 100;
    const total = w * h;
    const vals = new Float32Array(total * 3);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
      const [r,g,b] = applyToneRgb(data[i], data[i + 1], data[i + 2], state);
      vals[p] = r; vals[p + 1] = g; vals[p + 2] = b;
    }
    const write = (p, color) => {
      const i = (p / 3) * 4;
      data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    };
    if (state.dither === 'floyd' || state.dither === 'atkinson') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pos = (y * w + x) * 3;
        const old = [clamp255(vals[pos]), clamp255(vals[pos + 1]), clamp255(vals[pos + 2])];
        const c = palette[nearestColor(old, palette)];
        write(pos, c);
        const er = (old[0] - c[0]) * strength;
        const eg = (old[1] - c[1]) * strength;
        const eb = (old[2] - c[2]) * strength;
        const diffuse = (idx, f) => {
          vals[idx] += er * f;
          vals[idx + 1] += eg * f;
          vals[idx + 2] += eb * f;
        };
        if (state.dither === 'floyd') {
          if (x + 1 < w) diffuse(pos + 3, 7 / 16);
          if (y + 1 < h) {
            if (x > 0) diffuse(pos + (w - 1) * 3, 3 / 16);
            diffuse(pos + w * 3, 5 / 16);
            if (x + 1 < w) diffuse(pos + (w + 1) * 3, 1 / 16);
          }
        } else {
          const e = 1 / 8;
          if (x + 1 < w) diffuse(pos + 3, e);
          if (x + 2 < w) diffuse(pos + 6, e);
          if (y + 1 < h) {
            if (x > 0) diffuse(pos + (w - 1) * 3, e);
            diffuse(pos + w * 3, e);
            if (x + 1 < w) diffuse(pos + (w + 1) * 3, e);
          }
          if (y + 2 < h) diffuse(pos + w * 6, e);
        }
      }
      return;
    }
    const noiseAmp = 36 * strength;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pos = (y * w + x) * 3;
      let rgb = [vals[pos], vals[pos + 1], vals[pos + 2]];
      if (state.dither === 'ordered') {
        const n = (bayer4[y & 3][x & 3] / 15 - .5) * noiseAmp;
        rgb = [clamp255(rgb[0] + n), clamp255(rgb[1] + n), clamp255(rgb[2] + n)];
      } else if (state.dither === 'random') {
        const n = randomSigned(x, y) * noiseAmp * 1.4;
        rgb = [clamp255(rgb[0] + n), clamp255(rgb[1] + n), clamp255(rgb[2] + n)];
      } else if (state.dither === 'threshold') {
        const v = luminance(rgb[0], rgb[1], rgb[2]) < 128 ? palette[0] : palette[palette.length - 1];
        write(pos, v);
        continue;
      }
      write(pos, palette[nearestColor(rgb, palette)]);
    }
  }

  function getPalette(state) {
    const def = palettes[state.palette];
    return def.type === 'mono' ? monoPalette(def.colors, state.levels) : fullPalette(def.colors);
  }

  function renderBitmap(out, state) {
    const px = state.pixelSize;
    const gw = Math.max(1, Math.round(out.w / px));
    const gh = Math.max(1, Math.round(out.h / px));
    workCanvas.width = gw;
    workCanvas.height = gh;
    workCtx.clearRect(0, 0, gw, gh);
    workCtx.drawImage(sourceImage, 0, 0, gw, gh);
    const image = workCtx.getImageData(0, 0, gw, gh);
    const palette = getPalette(state);
    if (palettes[state.palette].type === 'mono') processMono(image.data, gw, gh, state, palette);
    else processColor(image.data, gw, gh, state, palette);
    workCtx.putImageData(image, 0, 0);
    outputCanvas.width = out.w;
    outputCanvas.height = out.h;
    outputCtx.imageSmoothingEnabled = false;
    outputCtx.fillStyle = '#000';
    outputCtx.fillRect(0, 0, out.w, out.h);
    outputCtx.drawImage(workCanvas, 0, 0, gw, gh, 0, 0, out.w, out.h);
  }

  function renderAscii(out, state) {
    const palette = getPalette(state);
    const chars = asciiPresets[state.asciiPreset] || asciiPresets.standard;
    const mono = palettes[state.palette].type === 'mono';
    const cellW = Math.max(5, Math.round(state.pixelSize * 4));
    const cellH = Math.max(7, Math.round(cellW * 1.6));
    const cols = Math.max(12, Math.floor(out.w / cellW));
    const rows = Math.max(8, Math.floor(out.h / cellH));
    workCanvas.width = cols;
    workCanvas.height = rows;
    workCtx.clearRect(0, 0, cols, rows);
    workCtx.drawImage(sourceImage, 0, 0, cols, rows);
    const data = workCtx.getImageData(0, 0, cols, rows).data;

    outputCanvas.width = out.w;
    outputCanvas.height = out.h;
    outputCtx.imageSmoothingEnabled = false;
    outputCtx.fillStyle = 'rgb(' + palette[0].join(',') + ')';
    outputCtx.fillRect(0, 0, out.w, out.h);
    outputCtx.textAlign = 'center';
    outputCtx.textBaseline = 'middle';
    outputCtx.font = `${Math.max(9, Math.floor(cellH * .92))}px Menlo, Consolas, monospace`;

    const usedW = cols * cellW;
    const usedH = rows * cellH;
    const offsetX = Math.floor((out.w - usedW) / 2);
    const offsetY = Math.floor((out.h - usedH) / 2);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        let [r,g,b] = applyToneRgb(data[i], data[i + 1], data[i + 2], state);
        const lum = luminance(r,g,b);
        const char = chars[Math.min(chars.length - 1, Math.floor((255 - lum) / 255 * (chars.length - 1)))];
        if (char === ' ') continue;
        let color;
        if (mono) {
          color = palette[quantIndex(lum, palette.length)];
        } else {
          color = palette[nearestColor([r,g,b], palette)];
        }
        outputCtx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        outputCtx.fillText(char, offsetX + x * cellW + cellW / 2, offsetY + y * cellH + cellH / 2);
      }
    }
  }

  function applyOverlays(ctx, w, h, state) {
    if (state.scanlines > 0) {
      const a = .42 * (state.scanlines / 100);
      const gap = Math.max(2, Math.round(state.pixelSize * .75));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, Math.floor(gap / 3)));
      ctx.restore();
    }
    if (state.vignette > 0) {
      const a = .78 * (state.vignette / 100);
      const g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.18, w/2, h/2, Math.max(w,h)*.68);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function scheduleRender() {
    updateLabels();
    updatePaletteStrip();
    updateModeUi();
    if (!sourceImage) return;
    clearTimeout(renderTimer);
    $('renderStatus').textContent = 'QUEUED';
    renderTimer = setTimeout(render, 55);
  }

  async function render() {
    if (!sourceImage) return;
    const token = ++renderToken;
    const state = readState();
    setTop('PROCESSING');
    await new Promise(r => requestAnimationFrame(r));
    if (token !== renderToken) return;
    try {
      const out = dimensions(state);
      if (state.renderMode === 'ascii') renderAscii(out, state);
      else renderBitmap(out, state);
      if (token !== renderToken) return;
      applyOverlays(outputCtx, out.w, out.h, state);
      $('previewStatus').textContent = out.w + '×' + out.h;
      $('outputMeta').textContent = out.w + ' × ' + out.h;
      $('renderStatus').textContent = 'READY';
      $('topStatus').textContent = 'READY';
      setStatus(state.renderMode === 'ascii' ? 'ASCII signal processed locally.' : 'Signal processed locally.');
    } catch (err) {
      console.error(err);
      setTop('ERROR');
      setStatus('Could not process this image. Try a smaller output resolution.', 'error');
    }
  }

  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif|jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name || '')) {
      setStatus('That file does not look like an image.', 'error');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      sourceImage = img;
      sourceName = file.name || 'clipboard-image';
      $('originalPreview').src = sourceUrl;
      $('originalPreview').hidden = false;
      outputCanvas.hidden = false;
      $('noSignal').hidden = true;
      $('previewStage').classList.add('has-image');
      $('sourceMeta').textContent = img.naturalWidth + ' × ' + img.naturalHeight;
      $('fileStatus').textContent = 'LOADED';
      $('clearBtn').disabled = false;
      $('saveBtn').disabled = false;
      $('randomBtn').disabled = false;
      $('compareBtn').disabled = false;
      setStatus('Input loaded. Processing…');
      scheduleRender();
    };
    img.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      sourceUrl = '';
      setStatus('This browser could not decode that image format.', 'error');
    };
    img.src = sourceUrl;
  }

  function clearImage() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    sourceImage = null;
    sourceName = '';
    outputCanvas.width = 1;
    outputCanvas.height = 1;
    outputCanvas.hidden = true;
    $('originalPreview').hidden = true;
    $('originalPreview').removeAttribute('src');
    $('noSignal').hidden = false;
    $('previewStage').classList.remove('has-image', 'compare');
    $('sourceMeta').textContent = '—';
    $('outputMeta').textContent = '—';
    $('previewStatus').textContent = '0×0';
    $('fileStatus').textContent = 'NO SIGNAL';
    $('clearBtn').disabled = true;
    $('saveBtn').disabled = true;
    $('randomBtn').disabled = true;
    $('compareBtn').disabled = true;
    setTop('READY');
    setStatus('Waiting for input stream.');
  }

  function saveImage() {
    if (!sourceImage) return;
    setStatus('Preparing PNG…');
    outputCanvas.toBlob(blob => {
      if (!blob) {
        setStatus('PNG export failed.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stem = (sourceName || 'terminal-photo').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
      a.href = url;
      a.download = stem + '-terminal-fx.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      setStatus('PNG saved.');
    }, 'image/png');
  }

  function randomise() {
    const paletteKeys = Object.keys(palettes);
    const dithers = ['ordered', 'floyd', 'atkinson', 'threshold', 'random', 'none'];
    const modes = ['bitmap', 'bitmap', 'bitmap', 'ascii'];
    const asciiKeys = Object.keys(asciiPresets);
    setState({
      renderMode:modes[Math.floor(Math.random() * modes.length)],
      palette:paletteKeys[Math.floor(Math.random() * paletteKeys.length)],
      dither:dithers[Math.floor(Math.random() * dithers.length)],
      pixelSize:1 + Math.floor(Math.random() * 12),
      brightness:-20 + Math.floor(Math.random() * 51),
      contrast:-10 + Math.floor(Math.random() * 71),
      levels:2 + Math.floor(Math.random() * 3),
      ditherStrength:45 + Math.floor(Math.random() * 101),
      gamma:75 + Math.floor(Math.random() * 61),
      invert:Math.random() < .16,
      scanlines:Math.random() < .5 ? 0 : 10 + Math.floor(Math.random() * 51),
      vignette:Math.random() < .55 ? 0 : 10 + Math.floor(Math.random() * 51),
      asciiPreset:asciiKeys[Math.floor(Math.random() * asciiKeys.length)]
    });
  }

  ['renderMode','palette','dither','pixelSize','brightness','contrast','levels','ditherStrength','gamma','invert','scanlines','vignette','exportSize','asciiPreset'].forEach(id => {
    $(id).addEventListener('input', scheduleRender);
    $(id).addEventListener('change', scheduleRender);
  });

  $('chooseBtn').addEventListener('click', () => $('fileInput').click());
  $('replaceBtn').addEventListener('click', () => $('fileInput').click());
  $('dropZone').addEventListener('click', () => $('fileInput').click());
  $('dropZone').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('fileInput').click();
    }
  });
  $('fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => $('dropZone').addEventListener(type, e => { e.preventDefault(); $('dropZone').classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => $('dropZone').addEventListener(type, e => {
    $('dropZone').classList.remove('drag');
    if (type === 'drop') {
      e.preventDefault();
      loadFile(e.dataTransfer.files[0]);
    }
  }));
  document.addEventListener('paste', e => {
    const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      loadFile(file);
    }
  });
  $('clearBtn').addEventListener('click', clearImage);
  $('resetBtn').addEventListener('click', () => setState(defaultState));
  $('randomBtn').addEventListener('click', randomise);
  $('saveBtn').addEventListener('click', saveImage);

  const compareOn = () => { if (sourceImage) $('previewStage').classList.add('compare'); };
  const compareOff = () => $('previewStage').classList.remove('compare');
  $('compareBtn').addEventListener('pointerdown', compareOn);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => $('compareBtn').addEventListener(type, compareOff));
  window.addEventListener('pagehide', () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); });

  setState(defaultState);
})();
