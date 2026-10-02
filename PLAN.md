# Plan — App "Revisa tu inventario"

**Objetivo:** Luigi envía el link a bily (cliente Pro, 2 sedes). El cliente revisa los dos
inventarios, corrige existencia/precio donde haya errores. Luigi descarga después los
Excel corregidos, listos para el importador.

## Decisiones de Luigi (2026-10-02)
- Link **abierto** (sin clave).
- Se usan los Excel limpiados del 2026-10-01 (bodega 2.423 + cosméticos 2.988 productos).
- El cliente edita **EXISTENCIA** y **VENTA** (USD). No agrega ni elimina productos.
- El Excel de salida sale en el **mismo formato del original**.

## Arquitectura (todo gratis)
- **Frontend:** página estática (HTML/CSS/JS, sin build) → deploy en Vercel (cuenta luiggi2, plan hobby).
- **Datos:** proyecto Supabase nuevo `inventario-cliente` (plan free, región us-east-2), ref `fxtocmtnlepaksceggrt`.
  - Tabla `items`: id, sede ('bodega'|'cosmeticos'), producto, codigo, venta_usd, existencia, actualizado_en.
  - RLS abierto (lectura/escritura pública con anon key) — es lo que pide el link abierto.
- **Export:** botón "Descargar Excel" genera el .xlsx en el navegador (SheetJS por CDN), mismo formato original.

## Flujo
1. Cliente abre el link → pestaña Bodega o Cosméticos → busca por nombre o código.
2. Edita EXISTENCIA / VENTA USD inline → se guarda solo en Supabase (con debounce).
3. Luigi abre el link → "Descargar Excel" por sede → obtiene el inventario corregido.

## Archivos
- `index.html` — app completa (pestañas, buscador, tabla editable, export).
- `config.js` — URL + anon key de Supabase (generado, no se commitea a mano).
- `scripts/importar.py` — carga inicial de los 2 Excel a Supabase (una sola vez).
- `PLAN.md` — este archivo.

## Nota de seguridad
Link abierto = cualquiera con el link puede ver y editar. La anon key es pública por diseño.
Si más adelante se quiere clave o accesos por cliente, se agrega auth.
