import LibRawModule from './vendor/libraw.js';

let ready;
let raw;

async function init(){
  ready=(async()=>{
    const module=await LibRawModule();
    raw=new module.LibRaw();
  })();
}
init();

function typed(value){return ArrayBuffer.isView(value)&&!(value instanceof DataView);}

self.onmessage=async event=>{
  const {id,fn,args}=event.data;
  try{
    await ready;
    const out=raw[fn](...args);
    const transfer=[];
    if(out&&typeof out==='object'){
      for(const key in out){const value=out[key];if(typed(value))transfer.push(value.buffer);}
    }
    self.postMessage({id,out},transfer);
  }catch(error){
    self.postMessage({id,error:error?.message||String(error)});
  }
};
