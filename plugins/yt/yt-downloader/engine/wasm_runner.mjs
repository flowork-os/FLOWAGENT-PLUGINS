import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WASI } from 'node:wasi';

const syncModuleCache = new Map();

export function getSyncModule(wasmPath) {
  if (syncModuleCache.has(wasmPath)) {
    return syncModuleCache.get(wasmPath);
  }
  const wasmBuffer = fs.readFileSync(wasmPath);
  const wasmModule = new WebAssembly.Module(wasmBuffer);
  syncModuleCache.set(wasmPath, wasmModule);
  return wasmModule;
}

export function executeWasmSync(wasmPath, argsObj = {}) {
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`[WASM_NOT_FOUND] WASM module not found at: ${wasmPath}`);
  }

  const mod = getSyncModule(wasmPath);
  const tmpOut = path.join(os.tmpdir(), `yt_wasm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`);
  const outFd = fs.openSync(tmpOut, 'w+');

  const wasi = new WASI({
    version: 'preview1',
    args: [path.basename(wasmPath), JSON.stringify(argsObj)],
    env: process.env,
    stdout: outFd
  });

  try {
    const instance = new WebAssembly.Instance(mod, wasi.getImportObject());
    wasi.start(instance);
  } catch (err) {
    if (err && err.code !== '0' && err.message !== 'wasi.start() exited with 0') {
      try { fs.closeSync(outFd); } catch (_) {}
      try { fs.unlinkSync(tmpOut); } catch (_) {}
      throw err;
    }
  } finally {
    try { fs.closeSync(outFd); } catch (_) {}
  }

  try {
    const rawOutput = fs.readFileSync(tmpOut, 'utf8').trim();
    try { fs.unlinkSync(tmpOut); } catch (_) {}
    if (!rawOutput) return { success: true };
    return JSON.parse(rawOutput);
  } catch (readErr) {
    try { fs.unlinkSync(tmpOut); } catch (_) {}
    throw readErr;
  }
}

export default { executeWasmSync, getSyncModule };
