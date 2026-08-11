"use client";

import {
  corregirFechaFactura,
  corregirItemFacturaConfirmada,
  corregirMontoFactura,
  eliminarItemDetalle,
  type CambiosItemFactura,
} from "@/app/control-precios/actions";
import type { FacturaConDetalle, ItemFacturaDetalle } from "@/lib/control-precios/consultas";
import { parseNumeroDecimal } from "@/lib/formato";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Compara el texto tipeado contra el valor numérico original — evita mandar un
 * `cambios` con un campo "cambiado" que en realidad es el mismo número escrito
 * distinto (ej. "10" vs "10.00"). */
function difiereDeOriginal(texto: string, original: string | null): boolean {
  const num = texto.trim() === "" ? null : parseNumeroDecimal(texto);
  const numOriginal = original !== null ? Number(original) : null;
  if (num === null && numOriginal === null) return false;
  if (num === null || numOriginal === null) return true;
  return Math.abs(num - numOriginal) > 0.001;
}

function FilaItem({ item, onGuardado }: { item: ItemFacturaDetalle; onGuardado: () => void }) {
  const [productoNombre, setProductoNombre] = useState(item.productoNombre);
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [precioUnitario, setPrecioUnitario] = useState(item.precioUnitario ?? "");
  const [descuento, setDescuento] = useState(item.descuento ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambio =
    productoNombre.trim() !== item.productoNombre ||
    difiereDeOriginal(cantidad, item.cantidad) ||
    difiereDeOriginal(precioUnitario, item.precioUnitario) ||
    difiereDeOriginal(descuento, item.descuento);

  const precioNum = precioUnitario.trim() === "" ? null : parseNumeroDecimal(precioUnitario);
  const cantidadNum = parseNumeroDecimal(cantidad);
  const descuentoNum = descuento.trim() === "" ? null : parseNumeroDecimal(descuento);
  const subtotalPreview =
    precioNum !== null && Number.isFinite(precioNum) && Number.isFinite(cantidadNum)
      ? precioNum * cantidadNum - (descuentoNum ?? 0)
      : null;

  async function guardar() {
    setError(null);
    const cambios: CambiosItemFactura = {};
    if (productoNombre.trim() !== item.productoNombre) cambios.productoNombre = productoNombre.trim();
    if (difiereDeOriginal(cantidad, item.cantidad)) cambios.cantidad = cantidadNum;
    if (difiereDeOriginal(precioUnitario, item.precioUnitario)) cambios.precioUnitario = precioNum;
    if (difiereDeOriginal(descuento, item.descuento)) cambios.descuento = descuentoNum;

    setGuardando(true);
    try {
      await corregirItemFacturaConfirmada(item.detalleId, cambios);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    setError(null);
    setGuardando(true);
    try {
      await eliminarItemDetalle(item.detalleId);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar.");
      setGuardando(false);
    }
  }

  return (
    <tr className={`border-t border-slate-100 ${item.precioUnitario === null ? "bg-amber-50" : ""}`}>
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={productoNombre}
          onChange={(e) => setProductoNombre(e.target.value)}
          className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-slate-300 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1.5 text-xs text-slate-400">{item.unidadMedida}</td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-20 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none focus:border-slate-300 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          placeholder="sin dato"
          value={precioUnitario}
          onChange={(e) => setPrecioUnitario(e.target.value)}
          className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none placeholder:text-amber-500 focus:border-slate-300 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          placeholder="sin descuento"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
          className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm outline-none placeholder:text-slate-300 focus:border-slate-300 focus:bg-white"
        />
      </td>
      <td className="w-24 px-3.5 py-1.5 text-right font-mono text-sm tabular-nums text-slate-700">
        {subtotalPreview !== null ? subtotalPreview.toFixed(2) : "sin dato"}
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={!cambio || guardando}
            onClick={() => void guardar()}
            className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? "..." : "Guardar"}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void eliminar()}
            className="text-xs text-rose-500 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quitar
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
      </td>
    </tr>
  );
}

/** Editor de una factura YA guardada — para el caso de notar un error después de
 * confirmar (ej. un descuento mal aplicado que distorsiona el % de aumento en
 * Reportes) sin tener que pedir la corrección a mano. Cada renglón se guarda
 * solo (no hay un "confirmar todo" único), igual que el resto de los paneles de
 * calidad de datos de este módulo. */
export function EditorFacturaConfirmada({ factura }: { factura: FacturaConDetalle }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(factura.fechaEmision.slice(0, 10));
  const [monto, setMonto] = useState(factura.montoTotal ?? "");
  const [guardandoCabecera, setGuardandoCabecera] = useState<"fecha" | "monto" | null>(null);
  const [errorCabecera, setErrorCabecera] = useState<string | null>(null);

  function onGuardado() {
    router.refresh();
  }

  async function guardarFecha() {
    setErrorCabecera(null);
    setGuardandoCabecera("fecha");
    try {
      await corregirFechaFactura(factura.id, fecha);
      router.refresh();
    } catch (err) {
      setErrorCabecera(err instanceof Error ? err.message : "Error al corregir la fecha.");
    } finally {
      setGuardandoCabecera(null);
    }
  }

  async function guardarMonto() {
    const nuevoMonto = parseNumeroDecimal(monto);
    if (!Number.isFinite(nuevoMonto)) return;
    setErrorCabecera(null);
    setGuardandoCabecera("monto");
    try {
      await corregirMontoFactura(factura.id, nuevoMonto);
      router.refresh();
    } catch (err) {
      setErrorCabecera(err instanceof Error ? err.message : "Error al corregir el monto.");
    } finally {
      setGuardandoCabecera(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Corregir cabecera</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Fecha de emisión</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="button"
            disabled={fecha === factura.fechaEmision.slice(0, 10) || guardandoCabecera !== null}
            onClick={() => void guardarFecha()}
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardandoCabecera === "fecha" ? "Guardando..." : "Corregir fecha"}
          </button>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Monto total</label>
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-40 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="button"
            disabled={monto === (factura.montoTotal ?? "") || guardandoCabecera !== null}
            onClick={() => void guardarMonto()}
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardandoCabecera === "monto" ? "Guardando..." : "Corregir monto"}
          </button>
        </div>
        {errorCabecera && <p className="mt-2 text-xs text-rose-700">{errorCabecera}</p>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Precio unitario</th>
              <th className="px-3 py-2 text-right">Descuento</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {factura.items.map((item) => (
              <FilaItem key={item.detalleId} item={item} onGuardado={onGuardado} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        El Subtotal se recalcula solo (cantidad × precio unitario − descuento) al guardar un renglón. Cada renglón se
        guarda por separado con su propio botón &quot;Guardar&quot;.
      </p>
    </div>
  );
}
