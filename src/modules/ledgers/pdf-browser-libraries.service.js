import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function createLinuxLibraryCheck({platform=process.platform, uid=()=>process.getuid?.(), run=exec}={}) {
  const pending = new Map();
  async function missingLibraries(executable) {
    let output;
    try { output=await run('ldd',[executable],{timeout:30000,maxBuffer:1024*1024}); }
    catch(error) {
      if(error.code==='ENOENT') throw new Error('PDF browser dependency check requires ldd. Deploy the supplied Dockerfile with Chromium system packages installed.');
      if(!error.stdout) throw new Error(`Could not check PDF browser Linux dependencies: ${error.message}`);
      output=error;
    }
    return [...String(output.stdout).matchAll(/^\s*(\S+)\s+=>\s+not found/gm)].map(match=>match[1]);
  }
  async function verify(executable) {
    let missing=await missingLibraries(executable);
    if(!missing.length) return;
    if(uid()!==0) throw new Error(`PDF browser Linux libraries are missing: ${missing.join(', ')}. Rebuild using Server/Dockerfile; installing OS packages requires a root build step, not a non-root application process.`);
    // Debian's Chromium package installs the full browser dependency tree,
    // including GLib, NSS, GTK, fonts and audio libraries. No shell interpolation.
    try {
      await run('apt-get',['update'],{timeout:300000,maxBuffer:10*1024*1024});
      await run('apt-get',['install','-y','--no-install-recommends','chromium'],{timeout:600000,maxBuffer:10*1024*1024});
    } catch(error) {
      throw new Error(`Automatic PDF Linux library installation failed. Use the Debian-based Server/Dockerfile or install Chrome dependencies in your hosting build. ${error.message}`);
    }
    missing=await missingLibraries(executable);
    if(missing.length) throw new Error(`PDF browser still has missing Linux libraries after installation: ${missing.join(', ')}.`);
  }
  return async executable => {
    if(platform!=='linux') return;
    if(!pending.has(executable)) pending.set(executable,verify(executable).catch(error=>{pending.delete(executable);throw error;}));
    await pending.get(executable);
  };
}

export const ensurePdfBrowserLibraries=createLinuxLibraryCheck();
