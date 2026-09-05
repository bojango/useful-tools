/* Cross-origin isolation for the image compressor, plus same-origin proxying of LibRaw assets. */
const LIBRAW_BASE='https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/';
const VENDOR_CACHE='useful-tools-image-vendor-v1';

if(typeof window==='undefined'){
  self.addEventListener('install',()=>self.skipWaiting());
  self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

  function isolatedResponse(response){
    if(!response||response.status===0)return response;
    const headers=new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cross-Origin-Embedder-Policy','require-corp');
    headers.set('Cross-Origin-Resource-Policy','cross-origin');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }

  async function vendorResponse(filename){
    const remote=LIBRAW_BASE+filename;
    const cache=await caches.open(VENDOR_CACHE);
    let response=await cache.match(remote);
    if(!response){
      response=await fetch(remote,{mode:'cors',credentials:'omit'});
      if(!response.ok)throw new Error(`LibRaw asset failed: ${response.status}`);
      await cache.put(remote,response.clone());
    }
    const headers=new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cross-Origin-Embedder-Policy','require-corp');
    headers.set('Cross-Origin-Resource-Policy','cross-origin');
    if(filename.endsWith('.js'))headers.set('Content-Type','text/javascript; charset=utf-8');
    if(filename.endsWith('.wasm'))headers.set('Content-Type','application/wasm');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }

  self.addEventListener('fetch',event=>{
    const request=event.request;
    if(request.cache==='only-if-cached'&&request.mode!=='same-origin')return;
    const url=new URL(request.url);
    const scopePath=new URL(self.registration.scope).pathname.replace(/\/$/,'');
    const vendorPrefix=`${scopePath}/vendor/`;
    if(url.origin===self.location.origin&&url.pathname.startsWith(vendorPrefix)){
      const filename=url.pathname.slice(vendorPrefix.length);
      if(filename==='libraw.js'||filename==='libraw.wasm'){
        event.respondWith(vendorResponse(filename).catch(error=>new Response(String(error),{status:502,headers:{'Content-Type':'text/plain'}})));
        return;
      }
    }
    event.respondWith(fetch(request).then(isolatedResponse).catch(()=>caches.match(request)));
  });
}else{
  (()=>{
    if(window.crossOriginIsolated!==false||!window.isSecureContext||!('serviceWorker' in navigator))return;
    const scriptURL=new URL(document.currentScript.src,location.href).href;
    const reloadKey='usefulToolsImageCoiReload';
    const controllerIsOurs=()=>navigator.serviceWorker.controller?.scriptURL===scriptURL;
    const reloadOnce=()=>{
      if(sessionStorage.getItem(reloadKey)==='1')return;
      sessionStorage.setItem(reloadKey,'1');
      location.reload();
    };
    navigator.serviceWorker.register(scriptURL,{scope:'./'}).then(registration=>{
      if(controllerIsOurs()){
        sessionStorage.removeItem(reloadKey);
        return;
      }
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(controllerIsOurs())reloadOnce();
      });
      if(registration.active)reloadOnce();
    }).catch(error=>console.error('Image compressor isolation worker failed:',error));
    if(window.crossOriginIsolated)sessionStorage.removeItem(reloadKey);
  })();
}
