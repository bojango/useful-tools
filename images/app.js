const $ = id => document.getElementById(id);
const RAW_EXTS = new Set(['raw','dng','cr2','cr3','nef','nrw','arw','sr2','raf','orf','rw2','pef','x3f','3fr','iiq','rwl','erf','kdc','dcr','mos']);
const state = { items:[], running:false, seq:0 };
const modules = {};

function extOf(name=''){ const m=name.toLowerCase().match(/\.([^.]+)$/); return m ? m[1] : ''; }
function sourceFormat(file){ const e=extOf(file.name); if(e==='jpg'||e==='jpeg') return 'jpeg'; if(e==='png') return 'png'; if(e==='webp') return 'webp'; if(RAW_EXTS.has(e)) return 'raw'; return ''; }
function fmtBytes(n){ if(!Number.isFinite(n)) return '—'; if(n<1024) return `${n} B`; const u=['KB','MB','GB']; let v=n/1024,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v>=100?Math.round(v):v>=10?v.toFixed(1):v.toFixed(2)} ${u[i]}`; }
function pctSaved(a,b){ return a>0 ? ((a-b)/a)*100 : 0; }
function outputExt(format){ return format==='jpeg'?'jpg':format; }
function cleanBase(name){ return name.replace(/\.[^.]+$/,'') || 'image'; }
function currentMode(){ return document.querySelector('input[name="mode"]:checked').value; }
function targetBytes(){ if(!$('targetEnabled').checked || currentMode()==='lossless') return 0; const n=Math.max(1,Number($('targetSize').value)||1); return Math.round(n*Number($('targetUnit').value)); }
function resolvedFormat(item){ const chosen=$('format').value; if(chosen!=='keep') return chosen; const src=sourceFormat(item.file); if(src==='raw') return currentMode()==='lossless'?'png':'jpeg'; return src; }
function outputName(item,format,keptOriginal=false){ return keptOriginal ? item.file.name : `${cleanBase(item.file.name)}.${outputExt(format)}`; }
function nextPaint(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function setGlobal(text='',error=false){ $('globalStatus').textContent=text; $('globalStatus').classList.toggle('error',error); }
function rowId(item,suffix){ return `img-${item.id}-${suffix}`; }
function setProgress(item,pct,status){ item.progress=Math.max(0,Math.min(100,pct)); item.status=status; updateItem(item); updateOverall(); }
function renderItem(item){
  const el=document.createElement('article'); el.className='item'; el.id=rowId(item,'row');
  el.innerHTML=`<div class="item-top"><div><div class="item-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div><div id="${rowId(item,'result')}" class="item-result">Waiting to process</div></div><div class="item-size">${fmtBytes(item.file.size)}</div></div><div class="item-progress"><span id="${rowId(item,'bar')}"></span></div><div class="item-bottom"><span id="${rowId(item,'status')}" class="item-status">QUEUED · 0%</span><div class="item-actions"><button id="${rowId(item,'download')}" class="mini" type="button" disabled>Download</button><button id="${rowId(item,'remove')}" class="mini" type="button">Remove</button></div></div>`;
  $('queue').appendChild(el);
  document.getElementById(rowId(item,'download')).addEventListener('click',()=>downloadItem(item));
  document.getElementById(rowId(item,'remove')).addEventListener('click',()=>removeItem(item));
}
function updateItem(item){
  const bar=document.getElementById(rowId(item,'bar')); if(!bar)return;
  bar.style.width=`${item.progress}%`;
  document.getElementById(rowId(item,'status')).textContent=`${item.status||'QUEUED'} · ${Math.round(item.progress)}%`;
  const res=document.getElementById(rowId(item,'result')); res.className='item-result';
  if(item.error){ res.textContent=item.error; res.classList.add('error'); }
  else if(item.result){
    const saving=pctSaved(item.file.size,item.result.size),delta=item.file.size-item.result.size;
    const suffix=item.keptOriginal?' · ORIGINAL KEPT':item.rawHalf?' · HALF-SIZE RAW FALLBACK':'';
    res.textContent=`${fmtBytes(item.file.size)} → ${fmtBytes(item.result.size)} · ${delta>=0?`${Math.max(0,saving).toFixed(1)}% SAVED`:`${Math.abs(saving).toFixed(1)}% LARGER`}${suffix}`;
    res.classList.add(delta>=0?'good':'warn');
  } else res.textContent='Waiting to process';
  document.getElementById(rowId(item,'download')).disabled=!item.result;
  document.getElementById(rowId(item,'remove')).disabled=state.running;
}
function updateOverall(){
  const n=state.items.length;
  $('fileCount').textContent=`${n} FILE${n===1?'':'S'}`; $('overallPanel').hidden=n===0; $('queuePanel').hidden=n===0;
  $('compress').disabled=n===0||state.running; $('clear').disabled=n===0||state.running; $('choose').disabled=state.running; $('fileInput').disabled=state.running;
  if(!n) return;
  const avg=state.items.reduce((s,i)=>s+i.progress,0)/n; $('overallBar').style.width=`${avg}%`; $('overallPercent').textContent=`${Math.round(avg)}%`;
  const completed=state.items.filter(i=>i.result||i.error).length; $('overallDone').textContent=`${completed} / ${n}`; $('completedCount').textContent=`${completed} COMPLETE`;
  const original=state.items.reduce((s,i)=>s+i.file.size,0),finished=state.items.filter(i=>i.result),totalNew=finished.reduce((s,i)=>s+i.result.size,0);
  $('totalOriginal').textContent=fmtBytes(original); $('totalNew').textContent=finished.length?fmtBytes(totalNew):'—';
  if(finished.length){ const origFinished=finished.reduce((s,i)=>s+i.file.size,0),saved=origFinished-totalNew; $('totalSaved').textContent=`${saved>=0?fmtBytes(saved):`+${fmtBytes(-saved)}`} · ${Math.abs(pctSaved(origFinished,totalNew)).toFixed(1)}%${saved<0?' LARGER':''}`; } else $('totalSaved').textContent='—';
  $('downloadAll').disabled=!finished.length||state.running; $('overallState').textContent=state.running?'PROCESSING':completed===n?'COMPLETE':'QUEUED';
}
function resetResults(){ state.items.forEach(i=>{i.progress=0;i.status='QUEUED';i.result=null;i.resultName='';i.error='';i.keptOriginal=false;i.rawHalf=false;updateItem(i);}); updateOverall(); }
function addFiles(fileList){
  if(state.running)return; let added=0,rejected=0;
  for(const file of [...fileList]){ if(!sourceFormat(file)){rejected++;continue;} const item={id:++state.seq,file,progress:0,status:'QUEUED',result:null,resultName:'',error:'',keptOriginal:false,rawHalf:false};state.items.push(item);renderItem(item);added++; }
  if(added)setGlobal(''); if(rejected)setGlobal(`${rejected} unsupported file${rejected===1?' was':'s were'} skipped`,true); updateOverall();
}
function removeItem(item){ if(state.running)return; const idx=state.items.indexOf(item); if(idx>=0)state.items.splice(idx,1); document.getElementById(rowId(item,'row'))?.remove(); updateOverall(); }
function clearAll(){ if(state.running)return; state.items=[];$('queue').innerHTML='';$('fileInput').value='';setGlobal('');updateOverall(); }

function updateSettingsUI(){
  const lossless=currentMode()==='lossless'; $('qualityField').style.opacity=lossless?'.38':'1'; $('quality').disabled=lossless;
  $('targetRow').classList.toggle('disabled',!$('targetEnabled').checked||lossless); $('targetSize').disabled=!$('targetEnabled').checked||lossless; $('targetUnit').disabled=!$('targetEnabled').checked||lossless;
  $('modeNote').textContent=lossless?'PIXELS PRESERVED':'QUALITY + SIZE SEARCH'; const jpeg=[...$('format').options].find(o=>o.value==='jpeg'); jpeg.disabled=lossless; if(lossless&&$('format').value==='jpeg')$('format').value='keep'; $('qualityValue').textContent=$('quality').value;
}

async function loadModule(key,url){ if(!modules[key])modules[key]=import(url); return modules[key]; }
async function encodeNative(image,format,quality){
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{alpha:true});ctx.putImageData(image,0,0);
  const mime=format==='jpeg'?'image/jpeg':format==='webp'?'image/webp':'image/png'; const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(`Browser cannot encode ${format.toUpperCase()}`)),mime,quality/100)); canvas.width=canvas.height=1;return blob;
}
async function encodeJPEG(image,quality){ try{const m=await loadModule('jpeg','https://esm.sh/@jsquash/jpeg@1.6.0');const out=await m.encode(image,{quality});return new Blob([out],{type:'image/jpeg'});}catch(e){return encodeNative(image,'jpeg',quality);} }
async function encodeWebP(image,quality,lossless=false){ try{const m=await loadModule('webp','https://esm.sh/@jsquash/webp@1.5.0');const out=await m.encode(image,lossless?{lossless:1,quality:100}:{quality});return new Blob([out],{type:'image/webp'});}catch(e){return encodeNative(image,'webp',lossless?100:quality);} }
async function quantizePNG(image,quality){
  try{const m=await loadModule('imagequant','https://esm.sh/@squoosh-kit/imagequant@0.2.10');const colors=Math.max(16,Math.min(256,Math.round(16+(quality-20)/75*240)));const q=await m.quantize({data:image.data,width:image.width,height:image.height},{numColors:colors,dither:.85});return new ImageData(new Uint8ClampedArray(q.data),q.width,q.height);}catch(e){return image;}
}
async function encodePNG(image,lossless=true,quality=80){ let input=image;if(!lossless)input=await quantizePNG(image,quality);try{const m=await loadModule('oxipng','https://esm.sh/@jsquash/oxipng@2.3.0');const out=await m.optimise(input,{level:4,optimiseAlpha:false,interlace:false});return new Blob([out],{type:'image/png'});}catch(e){return encodeNative(input,'png',100);} }
async function encodeImage(image,format,quality,lossless){ if(format==='jpeg')return encodeJPEG(image,quality);if(format==='webp')return encodeWebP(image,quality,lossless);if(format==='png')return encodePNG(image,lossless,quality);throw new Error('Unsupported output format'); }

async function decodeStandard(file){
  let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(e){bitmap=await bitmapFromImg(file);}
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close?.();const image=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=1;return image;
}
function bitmapFromImg(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=async()=>{try{resolve(await createImageBitmap(img));}catch(e){reject(e);}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image decode failed'));};img.src=url;});}

class RawDecoder{
  constructor(){this.worker=new Worker(new URL('./raw-worker.js',import.meta.url),{type:'module'});this.pending=new Map();this.next=0;this.worker.onmessage=({data})=>{const p=this.pending.get(data?.id);if(!p)return;this.pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.out);};this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(new Error(e.message||'RAW worker failed'));this.pending.clear();};}
  call(fn,...args){return new Promise((resolve,reject)=>{const id=this.next++;this.pending.set(id,{resolve,reject});const transfers=[];for(const a of args)if(a instanceof Uint8Array)transfers.push(a.buffer);this.worker.postMessage({id,fn,args},transfers);});}
  dispose(){this.worker.terminate();for(const p of this.pending.values())p.reject(new Error('RAW decoder disposed'));this.pending.clear();}
}
function rawToImageData(raw){
  if(!raw||!raw.data||!raw.width||!raw.height)throw new Error('RAW decoder returned no image data');const pixels=raw.width*raw.height,channels=Math.max(1,raw.colors||3),src=raw.data,out=new Uint8ClampedArray(pixels*4),sixteen=src instanceof Uint16Array,val=i=>sixteen?(src[i]>>8):src[i];
  for(let i=0,j=0;i<pixels;i++,j+=4){const s=i*channels;if(channels===1){const v=val(s);out[j]=out[j+1]=out[j+2]=v;}else{out[j]=val(s);out[j+1]=val(s+1);out[j+2]=val(s+2);}out[j+3]=255;}return new ImageData(out,raw.width,raw.height);
}
async function decodeRaw(file,halfSize=false){const decoder=new RawDecoder();try{const bytes=new Uint8Array(await file.arrayBuffer());await decoder.call('open',bytes,{halfSize,useCameraWb:true,useCameraMatrix:1,outputColor:1,outputBps:8,userFlip:-1,userQual:3});return rawToImageData(await decoder.call('imageData'));}finally{decoder.dispose();}}
async function decodeItem(item){if(sourceFormat(item.file)!=='raw')return decodeStandard(item.file);try{return await decodeRaw(item.file,false);}catch(first){item.rawHalf=true;setProgress(item,24,'RAW MEMORY RETRY · HALF SIZE');await nextPaint();try{return await decodeRaw(item.file,true);}catch(second){throw new Error(`RAW decode failed: ${second.message||first.message}`);}}}

function resizeImageData(image,scale){const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale)),src=document.createElement('canvas');src.width=image.width;src.height=image.height;src.getContext('2d').putImageData(image,0,0);const dst=document.createElement('canvas');dst.width=w;dst.height=h;const ctx=dst.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,w,h);const result=ctx.getImageData(0,0,w,h);src.width=src.height=dst.width=dst.height=1;return result;}

async function encodeToTarget(item,image,format,startQuality,target){
  if(!target||currentMode()==='lossless')return{blob:await encodeImage(image,format,startQuality,false),image,quality:startQuality,resized:false};
  if(format==='png'){
    let working=image,best=null,resized=false;
    for(let attempt=0;attempt<7;attempt++){setProgress(item,38+attempt*7,`PNG TARGET PASS ${attempt+1}/7`);await nextPaint();const q=Math.max(25,startQuality-attempt*8),blob=await encodePNG(working,false,q);if(!best||blob.size<best.blob.size)best={blob,image:working,quality:q,resized};if(blob.size<=target)return{blob,image:working,quality:q,resized};const ratio=Math.sqrt(target/blob.size)*.96,scale=Math.max(.58,Math.min(.9,ratio));working=resizeImageData(working,scale);resized=true;}
    return best;
  }
  let working=image,resized=false,bestUnder=null,lastSmallest=null;
  for(let resizePass=0;resizePass<5;resizePass++){
    let lo=20,hi=startQuality,smallest=null;
    for(let n=0;n<7;n++){const q=Math.round((lo+hi)/2),p=36+Math.min(50,(resizePass*7+n)*3);setProgress(item,p,`TARGET SEARCH · Q${q}`);await nextPaint();const blob=await encodeImage(working,format,q,false),candidate={blob,image:working,quality:q,resized};if(!smallest||blob.size<smallest.blob.size)smallest=candidate;if(blob.size<=target){bestUnder=candidate;lo=q+1;}else hi=q-1;}
    if(bestUnder)return bestUnder;lastSmallest=smallest;if(!smallest)break;const ratio=Math.sqrt(target/smallest.blob.size)*.95,scale=Math.max(.55,Math.min(.88,ratio));working=resizeImageData(working,scale);resized=true;
  }
  return lastSmallest||{blob:await encodeImage(working,format,20,false),image:working,quality:20,resized:true};
}

async function processItem(item){
  try{
    setProgress(item,5,'READING');await nextPaint();const mode=currentMode(),format=resolvedFormat(item),src=sourceFormat(item.file),quality=Number($('quality').value),target=targetBytes();
    if(mode==='lossless'&&format==='jpeg'&&src!=='jpeg')throw new Error('JPEG cannot be created losslessly. Choose PNG, WebP or Lossy.');
    if(mode==='lossless'&&format==='jpeg'&&src==='jpeg'){item.result=item.file.slice(0,item.file.size,item.file.type||'image/jpeg');item.resultName=item.file.name;item.keptOriginal=true;setProgress(item,100,'DONE · JPEG KEPT');return;}
    setProgress(item,15,src==='raw'?'DECODING RAW':'DECODING');await nextPaint();let image=await decodeItem(item);setProgress(item,30,`DECODED · ${image.width}×${image.height}`);await nextPaint();
    let result;if(mode==='lossless'){setProgress(item,48,`LOSSLESS ${format.toUpperCase()}`);await nextPaint();result={blob:await encodeImage(image,format,100,true),image,quality:100,resized:false};}else result=await encodeToTarget(item,image,format,quality,target);image=null;
    let blob=result.blob,keptOriginal=false,name=outputName(item,format,false);if($('format').value==='keep'&&$('keepSmaller').checked&&blob.size>=item.file.size&&src!=='raw'){blob=item.file.slice(0,item.file.size,item.file.type||'application/octet-stream');name=item.file.name;keptOriginal=true;}
    item.result=blob;item.resultName=name;item.keptOriginal=keptOriginal;setProgress(item,96,'FINALISING');await nextPaint();setProgress(item,100,target&&blob.size>target?'DONE · TARGET NOT REACHED':'DONE');
  }catch(e){item.error=(e&&e.message)||'Processing failed';setProgress(item,100,'FAILED');}
}
async function processAll(){
  if(state.running||!state.items.length)return;if(currentMode()==='lossless'&&$('format').value==='jpeg'){setGlobal('JPEG re-encoding cannot be lossless. Choose PNG, WebP, Keep original, or switch to Lossy.',true);return;}
  state.running=true;resetResults();state.running=true;updateOverall();setGlobal('');$('codecStatus').textContent='PROCESSING';for(const item of state.items){await processItem(item);await nextPaint();}state.running=false;$('codecStatus').textContent='READY';updateOverall();const failed=state.items.filter(i=>i.error).length;setGlobal(failed?`${failed} file${failed===1?'':'s'} could not be processed`:'Compression complete',failed>0);
}

function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function downloadItem(item){if(item.result)downloadBlob(item.result,item.resultName||'image');}
async function downloadAll(){
  const done=state.items.filter(i=>i.result);if(!done.length)return;$('downloadAll').disabled=true;const old=$('downloadAll').textContent;$('downloadAll').textContent='Building ZIP…';
  try{const{default:JSZip}=await import('https://esm.sh/jszip@3.10.1'),zip=new JSZip(),used=new Set();for(const item of done){let name=item.resultName||'image';if(used.has(name)){const dot=name.lastIndexOf('.'),b=dot>0?name.slice(0,dot):name,e=dot>0?name.slice(dot):'';let n=2;while(used.has(`${b}-${n}${e}`))n++;name=`${b}-${n}${e}`;}used.add(name);zip.file(name,item.result);}downloadBlob(await zip.generateAsync({type:'blob',compression:'STORE'}),'compressed-images.zip');}catch(e){setGlobal(`ZIP failed: ${e.message}`,true);}finally{$('downloadAll').textContent=old;$('downloadAll').disabled=state.running||!done.length;}
}

$('choose').addEventListener('click',()=>$('fileInput').click());$('dropZone').addEventListener('click',()=>$('fileInput').click());$('dropZone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click();}});$('fileInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
for(const type of ['dragenter','dragover'])$('dropZone').addEventListener(type,e=>{e.preventDefault();$('dropZone').classList.add('drag');});for(const type of ['dragleave','drop'])$('dropZone').addEventListener(type,e=>{e.preventDefault();$('dropZone').classList.remove('drag');});$('dropZone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('compress').addEventListener('click',processAll);$('clear').addEventListener('click',clearAll);$('downloadAll').addEventListener('click',downloadAll);$('quality').addEventListener('input',updateSettingsUI);$('targetEnabled').addEventListener('change',updateSettingsUI);$('format').addEventListener('change',updateSettingsUI);document.querySelectorAll('input[name="mode"]').forEach(el=>el.addEventListener('change',updateSettingsUI));updateSettingsUI();updateOverall();
