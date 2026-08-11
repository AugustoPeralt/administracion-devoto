"use client";

import {
  buscarProveedoresSimilares,
  type CategoriaInsumo,
  type FacturaExtraidaIA,
  type ItemFacturaIA,
} from "@/app/control-precios/actions";
import { CATEGORIAS_INSUMO } from "@/lib/control-precios/constantes";
import { normalizarCuit } from "@/lib/control-precios/normalizar";
import { parseNumeroDecimal } from "@/lib/formato";
import { useState } from "react";

const CATEGORIAS = CATEGORIAS_INSUMO;

type Sugerencia = { id: number; nombre: string; categoria: CategoriaInsumo };

/** Formulario editable de una factura extraída — cabecera + tabla de ítems.
 * Usado tanto en la carga de un único comprobante como en cada fila expandida del
 * lote (ver CargaComprobanteForm). */
export function EditorFacturaExtraida({
  factura,
  onChange,
}: {
  factura: FacturaExtraidaIA;
  onChange: (factura: FacturaExtraidaIA) => void;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);

  function actualizarCabecera<K extends keyof FacturaExtraidaIA>(campo: K, valor: FacturaExtraidaIA[K]) {
    onChange({ ...factura, [campo]: valor });
  }

  function actualizarItem(index: number, campo: keyof ItemFacturaIA, valorTexto: string) {
    const items = factura.items.map((item, i) => {
      if (i !== index) return item;
      if (campo === "producto_nombre") return { ...item, producto_nombre: valorTexto };
      if (campo === "unidad_medida") return { ...item, unidad_medida: valorTexto || null };

      // parseNumeroDecimal() devuelve NaN ante cualquier texto no numérico (ej. se
      // tipeó "%", una letra, etc.) — un NaN en el estado termina como `value={NaN}`
      // en un input controlado, lo que React trata igual que un `value={null}`
      // (advertencia dura, tira abajo el árbol de React y con eso se pierde todo lo
      // que estaba cargado en el lote). Un tecleo inválido se ignora en vez de
      // corromper el ítem — el campo se queda con el último valor válido.
      if (campo === "cantidad") {
        if (valorTexto === "") return { ...item, cantidad: 0 };
        const cantidad = parseNumeroDecimal(valorTexto);
        return Number.isNaN(cantidad) ? item : { ...item, cantidad };
      }
      if (valorTexto === "") return { ...item, [campo]: null };
      const numero = parseNumeroDecimal(valorTexto);
      return Number.isNaN(numero) ? item : { ...item, [campo]: numero };
    });
    onChange({ ...factura, items });
  }

  /** El subtotal que se persiste nunca sale del papel — siempre se calcula acá
   * mismo, igual que en confirmarFactura(). Null si todavía no hay precio unitario. */
  function subtotalCalculado(item: ItemFacturaIA): number | null {
    if (item.precio_unitario === null) return null;
    return item.precio_unitario * item.cantidad - (item.descuento ?? 0);
  }

  function eliminarItem(index: number) {
    onChange({ ...factura, items: factura.items.filter((_, i) => i !== index) });
  }

  async function revisarProveedor(nombre: string) {
    if (!nombre.trim()) {
      setSugerencias([]);
      return;
    }
    const encontrados = await buscarProveedoresSimilares(nombre);
    setSugerencias(encontrados.filter((p) => p.nombre.toLowerCase() !== nombre.trim().toLowerCase()));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Proveedor</label>
          <input
            type="text"
            value={factura.proveedor_nombre}
            onChange={(e) => actualizarCabecera("proveedor_nombre", e.target.value)}
            onBlur={(e) => void revisarProveedor(e.target.value)}
            className="w-56 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
          {sugerencias.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sugerencias.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    actualizarCabecera("proveedor_nombre", s.nombre);
                    actualizarCabecera("categoria_sugerida", s.categoria);
                    setSugerencias([]);
                  }}
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
                >
                  ¿Es &quot;{s.nombre}&quot;?
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">CUIT</label>
          <input
            type="text"
            value={factura.proveedor_cuit ?? ""}
            onChange={(e) => actualizarCabecera("proveedor_cuit", e.target.value || null)}
            onBlur={(e) => {
              // Reformatea a XX-XXXXXXXX-X si se tipeó/leyó con otro formato (sin
              // guiones, con espacios) — evita que el mismo CUIT quede guardado con
              // formato distinto entre dos facturas y se lea como dos proveedores.
              const digitos = normalizarCuit(e.target.value);
              if (digitos.length === 11) {
                actualizarCabecera("proveedor_cuit", `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`);
              }
            }}
            placeholder="XX-XXXXXXXX-X"
            className="w-40 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" title="Se usa para detectar si esta factura ya se cargó antes">
            N° Factura
          </label>
          <input
            type="text"
            value={factura.numero_factura ?? ""}
            onChange={(e) => actualizarCabecera("numero_factura", e.target.value || null)}
            placeholder="0000-00000000"
            className="w-36 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Categoría</label>
          <select
            value={factura.categoria_sugerida}
            onChange={(e) => actualizarCabecera("categoria_sugerida", e.target.value as CategoriaInsumo)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Fecha de emisión</label>
          <input
            type="date"
            value={factura.fecha_emision}
            onChange={(e) => actualizarCabecera("fecha_emision", e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Monto total</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Sin total (página no final)"
            value={factura.monto_total ?? ""}
            onChange={(e) =>
              actualizarCabecera("monto_total", e.target.value.trim() === "" ? null : parseNumeroDecimal(e.target.value))
            }
            className="w-40 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Precio unitario</th>
              <th className="px-3 py-2 text-right">Descuento</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="px-3 py-2 text-right text-slate-400" title="Dato de referencia impreso en la factura — no se usa para comparar precios">
                IVA %
              </th>
              <th
                className="px-3 py-2 text-right text-slate-400"
                title="Total de línea impreso en la factura (puede incluir IVA) — solo referencia, no se usa para comparar precios"
              >
                Subtotal c/IVA (ref.)
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {factura.items.map((item, i) => {
              const sinPrecio = item.precio_unitario === null;
              const subtotal = subtotalCalculado(item);
              return (
                <tr key={i} className={`border-t border-slate-100 ${sinPrecio ? "bg-amber-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={item.producto_nombre}
                      onChange={(e) => actualizarItem(i, "producto_nombre", e.target.value)}
                      className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={item.unidad_medida ?? ""}
                      onChange={(e) => actualizarItem(i, "unidad_medida", e.target.value)}
                      className="w-20 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.cantidad}
                      onChange={(e) => actualizarItem(i, "cantidad", e.target.value)}
                      className="w-20 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.precio_unitario ?? ""}
                      onChange={(e) => actualizarItem(i, "precio_unitario", e.target.value)}
                      placeholder={sinPrecio ? "sin dato" : ""}
                      className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none placeholder:text-amber-500 focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.descuento ?? ""}
                      onChange={(e) => actualizarItem(i, "descuento", e.target.value)}
                      placeholder="sin descuento"
                      className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="w-24 px-3.5 py-1.5 text-right font-mono text-sm tabular-nums text-slate-700">
                    {subtotal !== null ? subtotal.toFixed(2) : "sin dato"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.iva_porcentaje ?? ""}
                      onChange={(e) => actualizarItem(i, "iva_porcentaje", e.target.value)}
                      placeholder="—"
                      className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm text-slate-500 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.subtotal_impreso ?? ""}
                      onChange={(e) => actualizarItem(i, "subtotal_impreso", e.target.value)}
                      placeholder="—"
                      className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm text-slate-500 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => eliminarItem(i)}
                      className="text-xs text-rose-500 hover:text-rose-700"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        El Subtotal se calcula solo (cantidad × precio unitario − descuento) y no se puede editar directo — si está
        mal, corregí el precio unitario, la cantidad o el descuento. IVA % y Subtotal c/IVA son solo de referencia
        (lo que imprime la factura): no se usan para comparar precios.
      </p>

      {factura.items.some((i) => i.precio_unitario === null) && (
        <p className="text-xs text-amber-700">
          Los ítems resaltados no traen precio impreso. Al confirmar, la factura queda marcada como
          &quot;pendiente de revisión&quot; y podés cargarles el precio a mano después desde Calidad de datos.
        </p>
      )}
    </div>
  );
}
