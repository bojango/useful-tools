(() => {
  const $ = id => document.getElementById(id);
  const palettes = {
    termgreen:['#020703','#0b2a12','#25a83a','#86ff78'], amber:['#080400','#3a1d00','#c77400','#ffd36a'],
    ice:['#020708','#0b2c36','#1ca6b8','#b7fbff'], paper:['#050505','#474747','#a6a6a6','#f1f1ea'],
    gameboy:['#0f380f','#306230','#8bac0f','#9bbc0f'], cga:['#000000','#006f73','#b000a8','#ffffff'],
    red:['#090101','#490909','#bd2020','#ff8585'], violet:['#07020a','#36104a','#9b35c7','#edb5ff']
  };
  const defaultState = {palette:'termgreen',dither:'ordered',pixelSize:4,brightness:0,contrast:0,levels:4,ditherStrength:85,gamma:100,invert:false,scanlines:0,vignette:0,exportSize:'2048'};
  let sourceImage = null, sourceUrl = '', sourceName = '', renderTimer = 0, renderToken = 0;
  const outputCanvas = $('outputCanvas'); const outputCtx = outputCanvas.getContext('2d',{alpha:false,willReadFrequently:false});
  const workCanvas = document.createElement('canvas'); const workCtx = workCanvas.getContext('2d',{willReadFrequently:true});

  function setStatus(text,type=''){$('status').textContent=text;$('status').className='status'+(type?' '+type:'');}
  function setTop(text){$('topStatus').textContent=text;$('renderStatus').textContent=text;}
  function readState(){return {
    palette:$('palette').value,dither:$('dither').value,pixelSize:+$('pixelSize').value,brightness:+$('brightness').value,contrast:+$('contrast').value,
    levels:+$('levels').value,ditherStrength:+$('ditherStrength').value,gamma:+$('gamma').value,invert:$('invert').checked,scanlines:+$('scanlines').value,
    vignette:+$('vignette').value,exportSize:$('exportSize').value
  }}
  function setState(s){for(const [k,v] of Object.entries(s)){const el=$(k);if(!el)continue;if(el.type==='checkbox')el.checked=!!v;else el.value=String(v)}updateLabels();updatePaletteStrip();scheduleRender()}
  function updateLabels(){
    $('pixelSizeValue').textContent=$('pixelSize').value+'px'; $('brightnessValue').textContent=$('brightness').value; $('contrastValue').textContent=$('contrast').value;
    $('ditherStrengthValue').textContent=$('ditherStrength').value+'%'; $('gammaValue').textContent=(+$('gamma').value/100).toFixed(2);
    $('scanlinesValue').textContent=$('scanlines').value+'%'; $('vignetteValue').textContent=$('vignette').value+'%'; $('paletteMeta').textContent=$('palette').selectedOptions[0].text.toUpperCase();
  }
  function updatePaletteStrip(){const p=palettes[$('palette').value];$('paletteStrip').innerHTML=p.map(c=>`<span style="background:${c}"></span>`).join('')}
  function dimensions(state){
    const w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,max=Math.max(w,h); let scale=1;
    if(state.exportSize!=='source'){const cap=+state.exportSize; scale=Math.min(1,cap/max)}
    return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
  }
  function levelPalette(base,levels){if(levels===2)return[base[0],base[3]];if(levels===3)return[base[0],base[2],base[3]];return base.slice(0,4)}
  function hexRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
  function tone(v,state){
    v += state.brightness*2.55;
    const c=state.contrast*2.55, factor=(259*(c+255))/(255*(259-c)); v=factor*(v-128)+128;
    v=Math.max(0,Math.min(255,v)); const gamma=state.gamma/100; v=255*Math.pow(v/255,1/gamma); if(state.invert)v=255-v; return Math.max(0,Math.min(255,v));
  }
  function quantIndex(v,levels){return Math.max(0,Math.min(levels-1,Math.round(v/255*(levels-1))))}
  function quantValue(idx,levels){return levels===1?0:idx*255/(levels-1)}
  const bayer4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  function randomSigned(x,y){let n=(x*374761393+y*668265263)>>>0;n=(n^(n>>>13))*1274126177>>>0;n^=n>>>16;return(n/4294967295)-.5}

  function processPixels(data,w,h,state){
    const pal=levelPalette(palettes[state.palette],state.levels).map(hexRgb), levels=pal.length, strength=state.ditherStrength/100;
    const vals=new Float32Array(w*h);
    for(let i=0,p=0;i<data.length;i+=4,p++) vals[p]=tone(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],state);
    const write=(p,idx)=>{const c=pal[idx];const i=p*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255};
    if(state.dither==='floyd'||state.dither==='atkinson'){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=y*w+x, old=Math.max(0,Math.min(255,vals[p])), idx=quantIndex(old,levels), q=quantValue(idx,levels), err=(old-q)*strength; write(p,idx);
        if(state.dither==='floyd'){
          if(x+1<w)vals[p+1]+=err*7/16; if(y+1<h){if(x>0)vals[p+w-1]+=err*3/16;vals[p+w]+=err*5/16;if(x+1<w)vals[p+w+1]+=err/16}
        }else{
          const e=err/8; if(x+1<w)vals[p+1]+=e;if(x+2<w)vals[p+2]+=e;if(y+1<h){if(x>0)vals[p+w-1]+=e;vals[p+w]+=e;if(x+1<w)vals[p+w+1]+=e}if(y+2<h)vals[p+w*2]+=e;
        }
      }
      return;
    }
    const step=255/Math.max(1,levels-1);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=y*w+x; let v=vals[p];
      if(state.dither==='ordered')v+=(bayer4[y&3][x&3]/15-.5)*step*strength;
      else if(state.dither==='random')v+=randomSigned(x,y)*step*1.4*strength;
      else if(state.dither==='threshold')v=v<128?0:255;
      write(p,quantIndex(Math.max(0,Math.min(255,v)),levels));
    }
  }
  function applyOverlays(ctx,w,h,state){
    if(state.scanlines>0){const a=.42*(state.scanlines/100),gap=Math.max(2,Math.round(state.pixelSize*.75));ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#000';for(let y=0;y<h;y+=gap)ctx.fillRect(0,y,w,Math.max(1,Math.floor(gap/3)));ctx.restore()}
    if(state.vignette>0){const a=.78*(state.vignette/100),g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.18,w/2,h/2,Math.max(w,h)*.68);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${a})`);ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore()}
  }
  function scheduleRender(){updateLabels();updatePaletteStrip();if(!sourceImage)return;clearTimeout(renderTimer);$('renderStatus').textContent='QUEUED';renderTimer=setTimeout(render,55)}
  async function render(){
    if(!sourceImage)return; const token=++renderToken,state=readState(); setTop('PROCESSING');
    await new Promise(r=>requestAnimationFrame(r)); if(token!==renderToken)return;
    try{
      const out=dimensions(state),px=state.pixelSize,gw=Math.max(1,Math.round(out.w/px)),gh=Math.max(1,Math.round(out.h/px));
      workCanvas.width=gw;workCanvas.height=gh;workCtx.clearRect(0,0,gw,gh);workCtx.drawImage(sourceImage,0,0,gw,gh);
      const image=workCtx.getImageData(0,0,gw,gh);processPixels(image.data,gw,gh,state);workCtx.putImageData(image,0,0);
      if(token!==renderToken)return; outputCanvas.width=out.w;outputCanvas.height=out.h;outputCtx.imageSmoothingEnabled=false;outputCtx.fillStyle='#000';outputCtx.fillRect(0,0,out.w,out.h);outputCtx.drawImage(workCanvas,0,0,gw,gh,0,0,out.w,out.h);applyOverlays(outputCtx,out.w,out.h,state);
      $('previewStatus').textContent=out.w+'×'+out.h;$('outputMeta').textContent=out.w+' × '+out.h;$('renderStatus').textContent='READY';$('topStatus').textContent='READY';setStatus('Signal processed locally.');
    }catch(err){console.error(err);setTop('ERROR');setStatus('Could not process this image. Try a smaller output resolution.','error')}
  }
  function loadFile(file){
    if(!file)return; if(!file.type.startsWith('image/')&&!/\.(heic|heif|jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name||'')){setStatus('That file does not look like an image.','error');return}
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);const img=new Image();img.decoding='async';
    img.onload=()=>{sourceImage=img;sourceName=file.name||'clipboard-image';$('originalPreview').src=sourceUrl;$('originalPreview').hidden=false;outputCanvas.hidden=false;$('noSignal').hidden=true;$('previewStage').classList.add('has-image');$('sourceMeta').textContent=img.naturalWidth+' × '+img.naturalHeight;$('fileStatus').textContent='LOADED';$('clearBtn').disabled=false;$('saveBtn').disabled=false;$('randomBtn').disabled=false;$('compareBtn').disabled=false;setStatus('Input loaded. Processing…');scheduleRender()};
    img.onerror=()=>{URL.revokeObjectURL(sourceUrl);sourceUrl='';setStatus('This browser could not decode that image format.','error')};img.src=sourceUrl;
  }
  function clearImage(){if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl='';sourceImage=null;sourceName='';outputCanvas.width=1;outputCanvas.height=1;outputCanvas.hidden=true;$('originalPreview').hidden=true;$('originalPreview').removeAttribute('src');$('noSignal').hidden=false;$('previewStage').classList.remove('has-image','compare');$('sourceMeta').textContent='—';$('outputMeta').textContent='—';$('previewStatus').textContent='0×0';$('fileStatus').textContent='NO SIGNAL';$('clearBtn').disabled=true;$('saveBtn').disabled=true;$('randomBtn').disabled=true;$('compareBtn').disabled=true;setTop('READY');setStatus('Waiting for input stream.')}
  function saveImage(){if(!sourceImage)return;setStatus('Preparing PNG…');outputCanvas.toBlob(blob=>{if(!blob){setStatus('PNG export failed.','error');return}const url=URL.createObjectURL(blob),a=document.createElement('a'),stem=(sourceName||'terminal-photo').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-');a.href=url;a.download=stem+'-terminal-fx.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);setStatus('PNG saved.')},'image/png')}
  function randomise(){const paletteKeys=Object.keys(palettes),dithers=['ordered','floyd','atkinson','threshold','random','none'];setState({palette:paletteKeys[Math.floor(Math.random()*paletteKeys.length)],dither:dithers[Math.floor(Math.random()*dithers.length)],pixelSize:1+Math.floor(Math.random()*12),brightness:-20+Math.floor(Math.random()*51),contrast:Math.floor(Math.random()*61),levels:2+Math.floor(Math.random()*3),ditherStrength:45+Math.floor(Math.random()*101),gamma:75+Math.floor(Math.random()*61),invert:Math.random()<.16,scanlines:Math.random()<.5?0:10+Math.floor(Math.random()*51),vignette:Math.random()<.55?0:10+Math.floor(Math.random()*51)})}

  ['palette','dither','pixelSize','brightness','contrast','levels','ditherStrength','gamma','invert','scanlines','vignette','exportSize'].forEach(id=>{$(id).addEventListener('input',scheduleRender);$(id).addEventListener('change',scheduleRender)});
  $('chooseBtn').addEventListener('click',()=>$('fileInput').click());$('replaceBtn').addEventListener('click',()=>$('fileInput').click());$('dropZone').addEventListener('click',()=>$('fileInput').click());$('dropZone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click()}});$('fileInput').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='' });
  ['dragenter','dragover'].forEach(type=>$('dropZone').addEventListener(type,e=>{e.preventDefault();$('dropZone').classList.add('drag')}));['dragleave','drop'].forEach(type=>$('dropZone').addEventListener(type,e=>{$('dropZone').classList.remove('drag');if(type==='drop'){e.preventDefault();loadFile(e.dataTransfer.files[0])}}));
  document.addEventListener('paste',e=>{const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();loadFile(file)}});
  $('clearBtn').addEventListener('click',clearImage);$('resetBtn').addEventListener('click',()=>setState(defaultState));$('randomBtn').addEventListener('click',randomise);$('saveBtn').addEventListener('click',saveImage);
  const compareOn=()=>{if(sourceImage)$('previewStage').classList.add('compare')},compareOff=()=>$('previewStage').classList.remove('compare');$('compareBtn').addEventListener('pointerdown',compareOn);['pointerup','pointercancel','pointerleave'].forEach(type=>$('compareBtn').addEventListener(type,compareOff));
  window.addEventListener('pagehide',()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl)});
  setState(defaultState);
})();
