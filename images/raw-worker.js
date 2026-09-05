import LibRaw from './vendor/index.js';

let raw = null;

function errorText(error){
  if(typeof error === 'string') return error;
  if(error && typeof error.message === 'string') return error.message;
  if(error && error.message != null){
    try { return JSON.stringify(error.message); } catch(e) {}
  }
  try {
    const text = JSON.stringify(error);
    if(text && text !== '{}') return text;
  } catch(e) {}
  return String(error);
}

function typed(value){
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

self.onmessage = async event => {
  const {id, fn, args = []} = event.data || {};
  try {
    if(!self.crossOriginIsolated){
      throw new Error('RAW decoder is not cross-origin isolated. Reload the image compressor once and try again.');
    }

    if(!raw) raw = new LibRaw();
    if(typeof raw[fn] !== 'function') throw new Error(`Unknown RAW decoder operation: ${fn}`);

    const out = await raw[fn](...args);
    const transfer = [];
    if(out && typeof out === 'object'){
      for(const key in out){
        const value = out[key];
        if(typed(value)) transfer.push(value.buffer);
      }
    }
    self.postMessage({id, out}, transfer);
  } catch(error) {
    self.postMessage({id, error:errorText(error)});
  }
};
