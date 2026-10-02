# Revisa tu inventario

App sencilla para que el cliente revise y corrija los inventarios de Bodega y Cosméticos.

## Uso
1. Abre el link desplegado.
2. Elige la pestaña **Bodega** o **Cosméticos**.
3. Busca el producto por nombre o código.
4. Corrige **Venta USD** o **Existencia** tocando el número — se guarda solo.
5. Las filas en amarillo fueron modificadas.
6. **Descargar Excel**: baja el inventario de la pestaña activa en el formato original.

## Técnico
- Página estática (`index.html`), sin build.
- Datos en Supabase (`inventario-cliente`, tabla `items`).
- `config.js` se genera con la URL y la anon key (link abierto por diseño).
- `scripts/importar.py` carga inicial de los Excel (ya ejecutado el 2026-10-02).
