// Prueba de humo determinista para inventario-cliente.
// Extrae el <script> en línea de index.html, lo ejecuta con un DOM y fetch
// simulados, y verifica el pipeline completo: carga -> originales -> render.
// Si el script muere a mitad de camino (como pasó con `data.forEach`),
// la prueba falla. Correr con: node test/smoke.mjs
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('FAIL: no se encontró el script en línea'); process.exit(1); }
const js = scripts[scripts.length - 1];

const FAKE_ITEMS = [
  { id: 'a1', sede: 'bodega', producto: 'MAYONESA KRAFT 500 GR', codigo: 'MK500', costo_usd: 2.5, venta_usd: 3.57, existencia: 10 },
  { id: 'a2', sede: 'bodega', producto: 'ACEITE Vatel 1L', codigo: 'AV1', costo_usd: null, venta_usd: 4.2, existencia: 5.7 },
];

function makeEl() {
  return {
    textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    closest() { return makeEl(); },
    addEventListener() {},
  };
}

function buildSandbox({ failFetch = false } = {}) {
  const els = {};
  const calls = [];
  const document = {
    getElementById: (id) => (els[id] ??= makeEl()),
    createElement: () => ({ src: '', onload: null, onerror: null }),
    head: { appendChild() {} },
  };
  const sandbox = {
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_ANON_KEY: 'fake-key',
    document,
    calls,
    fetch: async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || null });
      if (failFetch) throw new Error('network down');
      if (String(url).includes('/rest/v1/items?')) {
        return { ok: true, json: async () => JSON.parse(JSON.stringify(FAKE_ITEMS)) };
      }
      if (String(url).includes('/rpc/items_batch_update')) {
        const n = JSON.parse(opts.body).p_rows.length;
        return { ok: true, json: async () => n };
      }
      return { ok: true, json: async () => ({}) };
    },
    confirm: () => true,
    window: { scrollTo() {} },
    setTimeout, clearTimeout,
    console,
    __els: els,
  };
  sandbox.globalThis = sandbox;
  return createContext(sandbox);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name);
  if (!cond) failures++;
}

const get = (ctx, expr) => runInContext(expr, ctx);

async function scenarioLoad() {
  console.log('\n[1] Carga exitosa dibuja la tabla');
  const ctx = buildSandbox();
  runInContext(js, ctx); // si el script lanza ReferenceError, esto truena
  // esperar a que cargar() termine (reintentos como máximo ~4.5s en fallo)
  for (let i = 0; i < 100 && get(ctx, 'datos.length') === 0 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  check('no hubo error de carga', get(ctx, 'errorCarga') === false);
  check('datos cargados (2)', get(ctx, 'datos.length') === 2);
  check('originales poblados', get(ctx, 'Object.keys(originales).length') === 2);
  const cuerpo = ctx.__els['cuerpo'].innerHTML;
  check('la tabla muestra MAYONESA KRAFT', cuerpo.includes('MAYONESA KRAFT'));
  check('la tabla muestra ACEITE Vatel', cuerpo.includes('ACEITE Vatel'));
  check('contador dice "2 productos"', ctx.__els['conteo'].textContent === '2 productos');
  check('paginador dice "Página 1 de 1"', ctx.__els['paginfo'].textContent === 'Página 1 de 1');

  console.log('\n[2] Buscador filtra');
  ctx.__els['buscador'].value = 'mayonesa';
  runInContext('filtrar()', ctx);
  check('vista filtrada (1)', get(ctx, 'vista.length') === 1);
  check('contador dice "1 productos"', ctx.__els['conteo'].textContent === '1 productos');

  console.log('\n[3] Filtro "solo editados" sin editados');
  ctx.__els['buscador'].value = '';
  runInContext('toggleEditados()', ctx);
  check('botón muestra ✓', ctx.__els['btnEditados'].textContent === '✓ Solo editados');
  check('mensaje de vacío útil', ctx.__els['cuerpo'].innerHTML.includes('Aún no hay productos editados'));
}

async function scenarioFail() {
  console.log('\n[4] Sin conexión muestra Reintentar');
  const ctx = buildSandbox({ failFetch: true });
  runInContext(js, ctx);
  for (let i = 0; i < 120 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  check('errorCarga = true', get(ctx, 'errorCarga') === true);
  check('muestra botón Reintentar', ctx.__els['cuerpo'].innerHTML.includes('Reintentar'));
}

async function scenarioCostos() {
  console.log('\n[5] Calcular costos con factor 0.6: vista previa + Guardar');
  const ctx = buildSandbox();
  runInContext(js, ctx);
  for (let i = 0; i < 100 && get(ctx, 'datos.length') === 0 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  runInContext("document.getElementById('factor').value = '0.6'", ctx);
  runInContext('calcularCostos()', ctx);
  // 3.57 * 0.6 = 2.142 -> 2.14 ; 4.2 * 0.6 = 2.52
  check('costo de MAYONESA = 2.14', get(ctx, 'datos[0].costo_usd') === 2.14);
  check('costo de ACEITE = 2.52', get(ctx, 'datos[1].costo_usd') === 2.52);
  check('la tabla muestra el costo calculado', ctx.__els['cuerpo'].innerHTML.includes('2.14'));
  check('NO se guardó todavía (vista previa)', ctx.calls.filter(c => c.method !== 'GET').length === 0);
  check('barra de Guardar visible', ctx.__els['savebar'].style.display === 'flex');
  check('texto de la barra', ctx.__els['savebarText'].textContent.includes('2 productos'));

  await runInContext('(async () => { await guardarCalculados(); })()', ctx);
  const posts = ctx.calls.filter(c => c.method === 'POST');
  check('se hizo 1 POST al guardar', posts.length === 1);
  check('el POST va al RPC batch', posts[0].url.includes('/rpc/items_batch_update'));
  const body = JSON.parse(posts[0].body);
  check('el RPC lleva p_rows con costo_usd 2.14', body.p_rows[0].costo_usd === 2.14 && body.p_rows[0].id === 'a1');
  check('barra de Guardar oculta tras guardar', ctx.__els['savebar'].style.display === 'none');
  check('no quedan pendientes', get(ctx, 'pendientesCalc.size') === 0);
}

async function scenarioPreciosDescartar() {
  console.log('\n[6] Calcular precios con factor 0.6 y Descartar');
  const ctx = buildSandbox();
  runInContext(js, ctx);
  for (let i = 0; i < 100 && get(ctx, 'datos.length') === 0 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  runInContext("document.getElementById('factor').value = '0.6'", ctx);
  runInContext('calcularPrecios()', ctx);
  // solo a1 tiene costo: 2.5 / 0.6 = 4.1666 -> 4.17
  check('venta de MAYONESA = 4.17', get(ctx, 'datos[0].venta_usd') === 4.17);
  check('ACEITE sin costo no se toca', get(ctx, 'datos[1].venta_usd') === 4.2);
  check('1 pendiente', get(ctx, 'pendientesCalc.size') === 1);
  runInContext('descartarCalculados()', ctx);
  check('venta vuelve a 3.57', get(ctx, 'datos[0].venta_usd') === 3.57);
  check('nada pendiente tras descartar', get(ctx, 'pendientesCalc.size') === 0);
  check('barra oculta tras descartar', ctx.__els['savebar'].style.display === 'none');
}

async function scenarioStock() {
  console.log('\n[7] Stock entero y redondeado');
  const ctx = buildSandbox();
  runInContext(js, ctx);
  for (let i = 0; i < 100 && get(ctx, 'datos.length') === 0 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  const cuerpo = ctx.__els['cuerpo'].innerHTML;
  check('etiqueta "Stock" en la columna', cuerpo.includes('data-label="Stock"'));
  check('stock 5.7 se muestra como 6', cuerpo.includes('value="6"'));
  check('estimado usa stock redondeado ($25.20)', cuerpo.includes('$25.20'));
  // editar con decimal -> se redondea al guardar en memoria
  runInContext(`editar('a2', { value: '7.8', dataset: { campo: 'existencia' }, closest: () => ({ classList: { add(){}, remove(){}, toggle(){} } }) })`, ctx);
  check('editar 7.8 queda en 8', get(ctx, 'datos.find(x=>x.id==="a2").existencia') === 8);
  runInContext('clearTimeout(timers["a2"])', ctx); // no disparar el autoguardado en el test
}

async function scenarioBs() {
  console.log('\n[8] Signo $ y tasa BCV');
  const ctx = buildSandbox();
  runInContext(js, ctx);
  for (let i = 0; i < 100 && get(ctx, 'datos.length') === 0 && !get(ctx, 'errorCarga'); i++) await sleep(100);
  check('fmtBs 866.56', get(ctx, 'fmtBs(866.5612)') === '866,56');
  check('fmtBs con miles', get(ctx, 'fmtBs(1663.03)') === '1.663,03');
  // sin tasa no se muestra Bs
  check('sin tasa no hay Bs', !ctx.__els['cuerpo'].innerHTML.includes('Bs '));
  runInContext('tasaBCV = 867; render()', ctx);
  const cuerpo = ctx.__els['cuerpo'].innerHTML;
  check('signo $ en montos', cuerpo.includes('<span class="cur">$</span>'));
  check('venta en Bs (3.57 x 867)', cuerpo.includes('Bs 3.095,19'));
  check('costo en Bs (2.5 x 867)', cuerpo.includes('Bs 2.167,50'));
  check('ficha con grid (cell-producto)', cuerpo.includes('cell-producto'));
  check('estimado destacado (est-box)', cuerpo.includes('est-box'));
  check('input con $ integrado (money)', cuerpo.includes('class="money"'));
}

try {
  await scenarioLoad();
  await scenarioFail();
  await scenarioCostos();
  await scenarioPreciosDescartar();
  await scenarioStock();
  await scenarioBs();
} catch (e) {
  console.log('  FAIL excepción en el script: ' + e.message);
  failures++;
}

console.log(failures ? `\n${failures} FALLA(S)` : '\nTODO OK');
process.exit(failures ? 1 : 0);
