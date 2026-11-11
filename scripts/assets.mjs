import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function projectPath(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Asset path leaves project');
  return target;
}
export async function readCatalog(root = projectRoot) {
  return JSON.parse(await fs.readFile(path.join(root, 'assets/素材/catalog.json'), 'utf8'));
}
async function copyChanged(source, target) {
  const bytes = await fs.readFile(source);
  try { if (hash(await fs.readFile(target)) === hash(bytes)) return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(target), {recursive:true});
  await fs.writeFile(target, bytes);
}
export async function checkAssets(root = projectRoot) {
  const catalog = await readCatalog(root), files = new Set(), codes = new Set();
  for (const theme of Object.values(catalog.themes)) {
    if (!/^[A-Z]$/.test(theme.code) || theme.code === 'G' || codes.has(theme.code)) throw Error('Duplicate/invalid theme letter');
    codes.add(theme.code);
  }
  for (const row of catalog.assets) {
    if (files.has(row.file)) throw Error('Duplicate asset source: ' + row.file);
    files.add(row.file);
    if (!catalog.slots[row.slot] || row.id.slice(2) !== catalog.slots[row.slot].number) throw Error('Asset slot mismatch: ' + row.id);
    if (hash(await fs.readFile(projectPath(root, row.file))) !== row.sha256) throw Error('Asset digest mismatch: ' + row.file);
  }
  return {assets:files.size, themes:codes.size};
}
// Generate fixed Web paths from the registered sources.
export async function prepareRuntimeAssets(root = projectRoot) {
  const catalog = await readCatalog(root);
  for (const row of catalog.assets) {
    const source = projectPath(root, row.file);
    if (hash(await fs.readFile(source)) !== row.sha256) throw Error('Asset digest mismatch: ' + row.file);
    for (const generated of row.generated || []) {
      if (!generated.startsWith('public/')) throw Error('Unexpected generated target');
      await copyChanged(source, projectPath(root, generated));
    }
  }
}
// Explicit allowlist: development whitebox, unused imports and archives never enter the App bundle.
export async function copyWebAssets(out, {root=projectRoot, manifest=true} = {}) {
  const catalog = await readCatalog(root);
  for (const row of catalog.assets) for (const generated of row.generated || []) {
    if (generated.startsWith('public/icons/')) await copyChanged(projectPath(root,row.file),path.join(out,generated.slice(7)));
  }
  const defaults = JSON.parse(await fs.readFile(path.join(root,'src/ui-layout/workbench-defaults.json'),'utf8'));
  for (const theme of Object.values(defaults.themes)) for (const asset of Object.values(theme.assets || {})) {
    const generated = 'public' + asset.src;
    const row = catalog.assets.find(r => (r.generated || []).includes(generated));
    if (!row) throw Error('Workbench asset is not registered: ' + asset.src);
    await copyChanged(projectPath(root,row.file),path.join(out,asset.src.slice(1)));
  }
  if (manifest) await copyChanged(path.join(root,'public/manifest.webmanifest'),path.join(out,'manifest.webmanifest'));
}
export function runtimeAssetsPlugin(root = projectRoot) {
  let config;
  return {
    name:'statify-registered-assets',
    async configResolved(value) { config=value; if(value.command==='serve') await prepareRuntimeAssets(root); },
    async closeBundle() { if(config.command==='build') await copyWebAssets(path.resolve(root,config.build.outDir),{root}); },
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result=await checkAssets();
  if(process.argv.includes('--prepare')) await prepareRuntimeAssets();
  console.log(JSON.stringify(result));
}
