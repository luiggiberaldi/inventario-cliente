# Bitácora — inventario-cliente

App sencilla para que el cliente revise y corrija los inventarios de Bodega y Cosméticos.
Producción: https://inventario-cliente-inky.vercel.app
Repo: https://github.com/luiggiberaldi/inventario-cliente
DB: Supabase `inventario-cliente` (tabla pública `items`, 5.411 productos).

## 2026-10-02 — Creación e importación
- Repo público + deploy en Vercel (proyecto `inventario-cliente`, team luiggi2).
- Importados 2.423 (bodega) + 2.988 (cosméticos) productos a Supabase. Verificado por conteo.
- App v1: pestañas Bodega/Cosméticos, buscador, paginación (límite 1.000 filas de Supabase superado con rangos), vista móvil en tarjetas, edición de costo/venta/existencia con autoguardado, exportar a Excel.

## 2026-10-02 — Margen real + columna costo_usd
- Se agregó `costo_usd` a `public.items` y botón "Calcular precios".
- Precio = costo ÷ (1 − margen), no markup. Ej: costo $100, margen 30% → $142,86.
- RLS: la política `items_abierto` permite ALL a anon (incluye INSERT/DELETE por API). Pendiente endurecer a SELECT+UPDATE.

## 2026-10-02 — Todo editable
- luigi pidió editar nombre, código, costo, venta y cantidad. Ahora los 5 campos son editables y se guardan con PATCH.
- El indicador "editado" (fila amarilla) se calcula contra los valores cargados al abrir la página; al recargar, lo corregido pasa a ser el nuevo original.

## 2026-10-02 — Fix "0 productos" (filtro + reintentos)
- Causa 1: el botón "Ver solo editados" quedaba activo sin editados → mostraba 0 sin explicación. Ahora el botón dice "✓ Solo editados" cuando está activo y hay mensaje claro en cada estado vacío.
- Causa 2: si la red fallaba a mitad de carga quedaba en 0. Ahora reintenta 3 veces y muestra botón "Reintentar".

## 2026-10-02 — Fix guardar en lote (RPC) + rediseño de ficha
- Error "HTTP 400" al guardar cálculos: el upsert por REST fallaba porque `items.id` (uuid) no tenía PK y PostgREST intentaba INSERT (violaba not-null de `sede`). Se agregó `PRIMARY KEY (id)` (verificado: 5411/5411 únicos) y se creó la función `public.items_batch_update(jsonb)` (SECURITY DEFINER, solo actualiza venta_usd/costo_usd/actualizado_en, con GRANT a anon). `guardarCalculados()` ahora hace UNA llamada al RPC en vez de 13 upserts. Verificado end-to-end con curl (guarda, cuenta filas, restaura).
- Rediseño de la ficha de producto (móvil): tarjeta en grid 2 columnas (producto y código a ancho completo), nombre en negrita 16px, código como chip monoespaciado, $ integrado al input, estimado en caja verde destacada, sombra sutil, borde ámbar cuando está editada. En escritorio: hover en filas.
- Test `test/smoke.mjs`: adaptado al RPC (verifica URL y p_rows) + checks de la nueva ficha. 35 checks OK.

## 2026-10-02 — Signo $ + tasa BCV redondeada hacia arriba
- luigi pidió el signo $ y el cálculo a tasa BCV, con la tasa redondeada hacia arriba.
- Cambios: montos de costo/venta con signo $; debajo de cada monto en USD se muestra su equivalente en Bs (formato venezolano: Bs 3.095,19).
- Nuevo campo "Tasa BCV": se llena solo al abrir la app desde https://ve.dolarapi.com/v1/dolares/oficial (promedio, con Math.ceil; hoy 866.56 → 867) y se puede corregir a mano; al cambiarla se recalculan los Bs en pantalla.
- El Excel ahora incluye columnas COSTO BS, VENTA BS y ESTIMADO BS.
- Test `test/smoke.mjs`: escenario [8] (fmtBs, sin tasa no hay Bs, valores con tasa 867). 32 checks OK.

## 2026-10-02 — "Existencia" → "Stock", stock siempre entero
- luigi pidió renombrar la columna a Stock y sin decimales.
- Cambios solo de interfaz (la columna en DB sigue llamándose `existencia`): encabezado, tarjetas móvil, textos de ayuda y Excel ahora dicen STOCK; el stock se muestra redondeado, el input es de paso 1 y al editar se redondea con Math.round antes de guardar. El estimado usa el stock redondeado.
- Test `test/smoke.mjs`: escenario [7] (5.7→6 en pantalla, estimado $25.20, editar 7.8→8). 26 checks OK.

## 2026-10-02 — Factor directo + vista previa con botón Guardar
- luigi pidió: (1) el campo es ahora el factor directo (0.6) en vez del % (40%); (2) al calcular no se guarda solo, sale un botón Guardar.
- Cambios: input "Factor costo" (0–1, ej. 0.6; si escriben ≥1 avisa el formato). Precios: Venta = Costo ÷ factor. Costos: Costo = Venta × factor.
- Nuevo flujo: calcular → valores en pantalla (filas amarillas) + barra inferior "N productos con valores calculados sin guardar" con **💾 Guardar** y **✕ Descartar**. Guardar persiste venta_usd y costo_usd en lotes; Descartar revierte a los valores previos al cálculo. Cambiar de pestaña con cálculos pendientes pide confirmación.
- Edición manual de una fila calculada la guarda (autoguardado) y la saca de pendientes.
- Test `test/smoke.mjs`: escenarios [5] (preview sin guardar → Guardar hace 1 POST con los valores) y [6] (precios + Descartar revierte). 22 checks OK.

## 2026-10-02 — Calcular costos desde venta
- luigi pidió el cálculo inverso para Cosméticos: conociendo el precio de venta, Costo = Venta × (1 − margen). Ej: venta $10, margen 40% → costo $6,00. Redondeo a 2 decimales.
- Nuevo botón "🧮 Calcular costos" junto a "Calcular precios". Usa el mismo campo de margen, aplica a TODOS los artículos de la pestaña activa (no solo a la vista filtrada), solo a los que tienen venta > 0, y pide confirmación indicando la sede y la cantidad antes de guardar en lotes.
- Prueba `test/smoke.mjs` ampliada con el escenario [5] (margen 40%: 3.57→2.14, 4.2→2.52).

## 2026-10-02 — Sin dependencias CDN + bug `data.forEach` (AUDITORÍA)
- Reporte: la app a veces no cargaba nada (tabla y contador vacíos, sin mensaje de error).
- Auditoría con navegador real: la API de Supabase respondía 200 OK con los productos; el fallo era 100% frontend.
- Causa raíz: en `cargar()`, línea `data.forEach(...)` cuando la variable se llama `todo` → `ReferenceError` que mataba el script antes de `render()`. Error de tipeo introducido al reescribir la carga.
- Fix 1: `data.forEach` → `todo.forEach`.
- Fix 2 (robustez): se eliminó la dependencia del cliente JS de Supabase por CDN — ahora usa `fetch` directo a la REST API. SheetJS solo se carga al exportar. Así un CDN caído ya no puede tumbar la app.
- Prueba determinista: `test/smoke.mjs` (correr con `node test/smoke.mjs`). Ejecuta el script real de `index.html` con DOM y fetch simulados y verifica: carga→render, buscador, filtro de editados y estado sin conexión. Se comprobó que FALLA con el bug y PASA con el fix (13 checks).
- Regla: correr `node test/smoke.mjs` antes de cada deploy.
