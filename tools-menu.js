(() => {
  if (document.getElementById('toolsMenuButton')) return;

  const style = document.createElement('style');
  style.textContent = `
    .tools-menu-wrap{position:fixed;right:14px;bottom:14px;z-index:9999;font-family:Menlo,Consolas,"SFMono-Regular",monospace}
    .tools-menu-btn{width:38px;height:38px;border:1px solid #263a34;background:#0b1210;color:#789087;display:grid;place-items:center;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .tools-menu-btn:hover,.tools-menu-btn:focus-visible{color:#8cd7ad;border-color:#8cd7ad;outline:none}
    .tools-menu-icon{width:16px;height:12px;display:grid;gap:3px}
    .tools-menu-icon span{display:block;height:1px;background:currentColor}
    .tools-menu-panel{position:absolute;right:0;bottom:46px;width:220px;border:1px solid #263a34;background:#070c0b;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none}
    .tools-menu-panel.open{display:block}
    .tools-menu-head{padding:9px 11px;border-bottom:1px solid #263a34;font-size:8px;line-height:1;letter-spacing:.14em;text-transform:uppercase;color:#789087}
    .tools-menu-link{display:flex;justify-content:space-between;gap:12px;padding:11px;color:#e6eee9;text-decoration:none;border-bottom:1px solid #1f312c;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    .tools-menu-link:last-child{border-bottom:0}
    .tools-menu-link:hover,.tools-menu-link:focus-visible{background:#08100e;color:#8cd7ad;outline:none}
    .tools-menu-link[aria-current="page"]{color:#8cd7ad}
    .tools-menu-status{color:#789087;font-size:8px;font-weight:500}
    .tools-menu-light{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif}
    .tools-menu-light .tools-menu-btn{background:#f4f3ef;color:#797872;border-color:#d7d5ce}
    .tools-menu-light .tools-menu-btn:hover,.tools-menu-light .tools-menu-btn:focus-visible{color:#151515;border-color:#151515}
    .tools-menu-light .tools-menu-panel{background:#f4f3ef;border-color:#d7d5ce;box-shadow:0 10px 30px rgba(0,0,0,.10)}
    .tools-menu-light .tools-menu-head{border-color:#d7d5ce;color:#797872}
    .tools-menu-light .tools-menu-link{color:#151515;border-color:#e4e2dc;font-weight:600}
    .tools-menu-light .tools-menu-link:hover,.tools-menu-light .tools-menu-link:focus-visible{background:#fff;color:#151515;outline:none}
    .tools-menu-light .tools-menu-link[aria-current="page"]{color:#151515;background:#fff}
    .tools-menu-light .tools-menu-status{color:#9b9991}
    @media(max-width:520px){.tools-menu-wrap{right:10px;bottom:10px}.tools-menu-panel{width:min(220px,calc(100vw - 20px))}}
  `;
  document.head.appendChild(style);

  const path = location.pathname.replace(/\/+$/, '');
  const onPassword = /\/password$/i.test(path);
  const onPalette = /\/palette$/i.test(path);
  const onImages = /\/images$/i.test(path);
  const onTerminal = /\/terminalfx$/i.test(path);
  const onAdventure = /\/adventure$/i.test(path);
  const onRoot = !onPassword && !onPalette && !onImages && !onTerminal && !onAdventure;
  const base = (onPassword || onPalette || onImages || onTerminal || onAdventure) ? '..' : '.';

  const wrap = document.createElement('div');
  wrap.className = `tools-menu-wrap${(onPalette || onAdventure) ? ' tools-menu-light' : ''}`;
  wrap.innerHTML = `
    <div id="toolsMenuPanel" class="tools-menu-panel" aria-hidden="true">
      <div class="tools-menu-head">Tools</div>
      <a class="tools-menu-link" href="${base}/" ${onRoot ? 'aria-current="page"' : ''}>
        <span>Dough calculator</span><span class="tools-menu-status">01</span>
      </a>
      <a class="tools-menu-link" href="${base}/password/" ${onPassword ? 'aria-current="page"' : ''}>
        <span>Password generator</span><span class="tools-menu-status">02</span>
      </a>
      <a class="tools-menu-link" href="${base}/palette/" ${onPalette ? 'aria-current="page"' : ''}>
        <span>Colour palette</span><span class="tools-menu-status">03</span>
      </a>
      <a class="tools-menu-link" href="${base}/images/" ${onImages ? 'aria-current="page"' : ''}>
        <span>Image compressor</span><span class="tools-menu-status">04</span>
      </a>
      <a class="tools-menu-link" href="${base}/terminalfx/" ${onTerminal ? 'aria-current="page"' : ''}>
        <span>Terminal photo FX</span><span class="tools-menu-status">05</span>
      </a>
      <a class="tools-menu-link" href="${base}/adventure/" ${onAdventure ? 'aria-current="page"' : ''}>
        <span>Adventure awaits</span><span class="tools-menu-status">06</span>
      </a>
    </div>
    <button id="toolsMenuButton" class="tools-menu-btn" type="button" aria-label="Open tools menu" aria-expanded="false" aria-controls="toolsMenuPanel">
      <span class="tools-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
  `;
  document.body.appendChild(wrap);

  const btn = document.getElementById('toolsMenuButton');
  const panel = document.getElementById('toolsMenuPanel');

  const setOpen = open => {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close tools menu' : 'Open tools menu');
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(!panel.classList.contains('open'));
  });
  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
})();
