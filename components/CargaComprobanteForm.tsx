"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { confirmarFactura, procesarComprobante, type FacturaExtraidaIA } from "@/app/control-precios/actions";
import { EditorFacturaExtraida } from "@/components/EditorFacturaExtraida";

// Cuántos comprobantes se procesan (upload + Gemini) al mismo tiempo. Ni tan bajo
// que un lote de 30-40 tarde una eternidad, ni tan alto que se coma el rate limit
// de Google AI Studio o satures la generación de tokens de subida.
const CONCURRENCIA = 4;

/** Sube un archivo directo a R2 (sin pasar los bytes por una función serverless,
 * mismo motivo que el handleUpload de Vercel Blob que reemplaza): pide una URL
 * firmada al server y hace el PUT desde el navegador. Devuelve la clave de R2
 * (lo que se guarda en cp_facturas.archivo_url) — ver lib/control-precios/r2.ts. */
async function subirComprobante(archivo: File): Promise<string> {
  const resPresign = await fetch("/api/control-precios/r2-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: archivo.type }),
  });
  if (!resPresign.ok) {
    const { error } = await resPresign.json().catch(() => ({ error: null }));
    throw new Error(error || "No se pudo iniciar la subida del comprobante.");
  }
  const { url, key } = (await resPresign.json()) as { url: string; key: string };

  const resPut = await fetch(url, { method: "PUT", body: archivo, headers: { "Content-Type": archivo.type } });
  if (!resPut.ok) throw new Error("Falló la subida del comprobante.");

  return key;
}

type EstadoItem = "en_cola" | "subiendo" | "procesando" | "validando" | "guardando" | "guardado" | "error";

type ItemLote = {
  id: string;
  nombreArchivo: string;
  // Solo existe para ítems recién soltados en esta pestaña — un archivo no
  // sobrevive un reload, así que un ítem recuperado de localStorage (ver más
  // abajo) queda con esto en null. No hace falta para nada más allá de la subida
  // inicial en procesarUnItem().
  archivo: File | null;
  estado: EstadoItem;
  archivoRef: string | null;
  factura: FacturaExtraidaIA | null;
  modelo: "flash" | "pro" | null;
  error: string | null;
  facturaId: number | null;
  pendienteRevision: boolean | null;
  // Nombre de un proveedor YA existente con el que este chocó en nombre pero no
  // en CUIT — confirmarFactura() lo crea aparte por las dudas (podría ser otra
  // empresa) en vez de fusionar solo, así que se avisa acá para revisar a mano
  // en /control-precios/proveedores. Null si no hubo conflicto.
  posibleProveedorDuplicado: string | null;
};

const CLAVE_STORAGE = "control-precios:carga-en-progreso";

/** Subconjunto de ItemLote que sobrevive un reload: nada de File (no es
 * serializable), y solo tiene sentido guardar ítems que ya pasaron la parte cara
 * (subida a Blob + lectura de Gemini) — lo que se pierde si el proceso se corta
 * en "en_cola"/"subiendo"/"procesando" es barato de rehacer (solo hay que volver
 * a soltar el archivo). */
type ItemPersistido = Pick<
  ItemLote,
  "id" | "nombreArchivo" | "archivoRef" | "factura" | "modelo" | "facturaId" | "pendienteRevision"
>;

// Después de esto se descarta lo recuperado en vez de restaurarlo — son datos
// comerciales (proveedor, precios) que quedan en el disco de ese navegador sin
// vencer solos; en un equipo compartido no tiene sentido que se acumulen
// indefinidamente lotes viejos que la persona ya ni se acuerda que quedaron a medio
// cargar. 48hs alcanza de sobra para retomar una carga cortada por un corte de
// wifi o un cierre accidental de pestaña.
const VENCIMIENTO_MS = 48 * 60 * 60 * 1000;

function guardarEnStorage(localId: number | null, items: ItemLote[]) {
  try {
    const resumibles: ItemPersistido[] = items
      .filter((it) => it.archivoRef && it.factura && it.estado !== "guardado")
      .map((it) => ({
        id: it.id,
        nombreArchivo: it.nombreArchivo,
        archivoRef: it.archivoRef,
        factura: it.factura,
        modelo: it.modelo,
        facturaId: it.facturaId,
        pendienteRevision: it.pendienteRevision,
      }));
    if (resumibles.length === 0) {
      window.localStorage.removeItem(CLAVE_STORAGE);
    } else {
      window.localStorage.setItem(
        CLAVE_STORAGE,
        JSON.stringify({ localId, items: resumibles, guardadoEn: Date.now() })
      );
    }
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — el autoguardado es
    // una red de contención, no algo de lo que dependa la carga en sí.
  }
}

function cargarDeStorage(): { localId: number | null; items: ItemPersistido[] } | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos?.items) || datos.items.length === 0) return null;
    if (typeof datos.guardadoEn !== "number" || Date.now() - datos.guardadoEn > VENCIMIENTO_MS) {
      window.localStorage.removeItem(CLAVE_STORAGE);
      return null;
    }
    return datos;
  } catch {
    return null;
  }
}

function crearId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .trim();
}

/** true si el nombre del restaurante elegido y lo que la IA detectó como
 * comprador en la factura no tienen nada en común — señal de que el lote se
 * cargó bajo el restaurante equivocado. */
function pareceOtroRestaurante(clienteDetectado: string | null, nombreLocalElegido: string): boolean {
  if (!clienteDetectado?.trim()) return false;
  const detectado = normalizar(clienteDetectado);
  const elegido = normalizar(nombreLocalElegido);
  if (detectado.length < 3 || elegido.length < 3) return false;
  return !detectado.includes(elegido) && !elegido.includes(detectado);
}

export function CargaComprobanteForm({ locales }: { locales: { id: number; nombre: string }[] }) {
  const [items, setItems] = useState<ItemLote[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<number | null>(null);
  const [avisoRecuperado, setAvisoRecuperado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Al entrar a la página, si quedó algo sin confirmar de una sesión anterior
  // (se cerró la pestaña, se cortó el wifi, un error tiró abajo la página) se
  // recupera acá — ver guardarEnStorage()/cargarDeStorage(). Corre una sola vez
  // al montar; leer localStorage en el useState inicial rompería la hidratación
  // (el server no tiene localStorage).
  useEffect(() => {
    const datos = cargarDeStorage();
    if (!datos) return;
    setLocalId(datos.localId);
    setItems(
      datos.items.map((it) => ({
        ...it,
        archivo: null,
        // Se fuerza a "validando" sin importar en qué estado haya quedado
        // guardado: "guardando"/"procesando" son instantáneos de un vuelo que ya
        // no existe, no algo confiable después de un reload.
        estado: "validando",
        error: null,
        posibleProveedorDuplicado: null,
      }))
    );
    setAvisoRecuperado(datos.items.length);
  }, []);

  // Autoguardado: cualquier cambio en la tanda (nueva lectura de la IA, edición,
  // confirmación) se refleja en localStorage al toque.
  useEffect(() => {
    guardarEnStorage(localId, items);
  }, [items, localId]);

  function actualizarItem(id: string, cambios: Partial<ItemLote>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)));
  }

  async function procesarUnItem(id: string, archivo: File) {
    actualizarItem(id, { estado: "subiendo" });
    try {
      const key = await subirComprobante(archivo);
      actualizarItem(id, { estado: "procesando", archivoRef: key });

      const { factura, modelo } = await procesarComprobante(key);
      actualizarItem(id, { estado: "validando", factura, modelo });
    } catch (err) {
      actualizarItem(id, {
        estado: "error",
        error: err instanceof Error ? err.message : "Error al procesar el comprobante.",
      });
    }
  }

  async function encolarArchivos(archivos: File[]) {
    if (archivos.length === 0) return;
    const pendientes = archivos.map((archivo) => ({ id: crearId(), archivo }));
    const nuevos: ItemLote[] = pendientes.map(({ id, archivo }) => ({
      id,
      nombreArchivo: archivo.name,
      archivo,
      estado: "en_cola",
      archivoRef: null,
      factura: null,
      modelo: null,
      error: null,
      facturaId: null,
      pendienteRevision: null,
      posibleProveedorDuplicado: null,
    }));
    setItems((prev) => [...prev, ...nuevos]);

    // Pool simple de N workers consumiendo la misma cola — sin librerías extra.
    let cursor = 0;
    async function worker() {
      while (cursor < pendientes.length) {
        const { id, archivo } = pendientes[cursor++];
        await procesarUnItem(id, archivo);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCIA }, worker));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (localId === null) return;
    void encolarArchivos(Array.from(e.dataTransfer.files));
  }

  function onSelect(e: ChangeEvent<HTMLInputElement>) {
    if (localId !== null) void encolarArchivos(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  async function confirmarItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item?.factura || !item.archivoRef) return;
    actualizarItem(id, { estado: "guardando", error: null });
    try {
      const res = await confirmarFactura(item.factura, item.archivoRef, localId);
      actualizarItem(id, {
        estado: "guardado",
        facturaId: res.facturaId,
        pendienteRevision: res.pendienteRevision,
        posibleProveedorDuplicado: res.posibleDuplicado,
      });
      if (expandidoId === id) setExpandidoId(null);
    } catch (err) {
      actualizarItem(id, {
        estado: "validando",
        error: err instanceof Error ? err.message : "Error al confirmar la factura.",
      });
    }
  }

  async function confirmarLimpias() {
    const limpias = items.filter(
      (i) => i.estado === "validando" && i.factura && !i.factura.items.some((it) => it.precio_unitario === null)
    );
    for (const item of limpias) {
      // Secuencial a propósito: son inserts a Neon (rápidos), no llamadas a Gemini —
      // no hace falta concurrencia acá, y evita mandar muchas mutaciones a la vez.
      await confirmarItem(item.id);
    }
  }

  function quitarItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (expandidoId === id) setExpandidoId(null);
  }

  function limpiarGuardadas() {
    setItems((prev) => prev.filter((it) => it.estado !== "guardado"));
  }

  const nombreLocalElegido = locales.find((l) => l.id === localId)?.nombre ?? null;
  const procesando = items.some((i) => i.estado === "en_cola" || i.estado === "subiendo" || i.estado === "procesando");
  const hayLimpiasParaConfirmar = items.some(
    (i) => i.estado === "validando" && i.factura && !i.factura.items.some((it) => it.precio_unitario === null)
  );
  const hayGuardadas = items.some((i) => i.estado === "guardado");

  return (
    <div className="space-y-4">
      {avisoRecuperado > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="flex-1">
            Se recuperaron {avisoRecuperado} comprobante{avisoRecuperado === 1 ? "" : "s"} sin confirmar de una
            sesión anterior (se guardan solos mientras trabajás, por si se corta la conexión o se cierra la página).
          </span>
          <button
            type="button"
            onClick={() => setAvisoRecuperado(0)}
            className="shrink-0 text-xs text-amber-700 underline hover:text-amber-900"
          >
            Cerrar aviso
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs text-slate-500">Este lote es de</label>
        <select
          value={localId ?? ""}
          onChange={(e) => setLocalId(e.target.value ? Number(e.target.value) : null)}
          disabled={items.length > 0}
          className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">Elegí un restaurante...</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
        {items.length > 0 && (
          <p className="text-xs text-slate-400">
            Para cambiar de restaurante, terminá o limpiá esta tanda primero.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (localId !== null) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        onClick={() => localId !== null && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={localId === null}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          localId === null
            ? "cursor-not-allowed border-slate-200 bg-slate-50"
            : arrastrando
              ? "cursor-pointer border-slate-950 bg-slate-50"
              : "cursor-pointer border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        {localId === null ? (
          <p className="text-sm text-slate-400">Elegí primero el restaurante de este lote ↑</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">Arrastrá las fotos o PDFs de los comprobantes acá</p>
            <p className="text-xs text-slate-400">
              Podés soltar varios a la vez (30-40 sin problema) — se procesan {CONCURRENCIA} en paralelo
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={localId === null}
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          onChange={onSelect}
          className="hidden"
        />
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">
            {items.length} comprobante{items.length === 1 ? "" : "s"} en esta tanda
            {procesando && " — procesando..."}
          </p>
          <div className="flex-1" />
          {hayLimpiasParaConfirmar && (
            <button
              type="button"
              onClick={() => void confirmarLimpias()}
              className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Confirmar todas las que están completas
            </button>
          )}
          {hayGuardadas && (
            <button
              type="button"
              onClick={limpiarGuardadas}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Limpiar confirmadas
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <FilaItemLote
            key={item.id}
            item={item}
            nombreLocalElegido={nombreLocalElegido}
            expandido={expandidoId === item.id}
            onToggleExpandir={() => setExpandidoId((prev) => (prev === item.id ? null : item.id))}
            onCambiarFactura={(factura) => actualizarItem(item.id, { factura })}
            onConfirmar={() => void confirmarItem(item.id)}
            onQuitar={() => quitarItem(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FilaItemLote({
  item,
  nombreLocalElegido,
  expandido,
  onToggleExpandir,
  onCambiarFactura,
  onConfirmar,
  onQuitar,
}: {
  item: ItemLote;
  nombreLocalElegido: string | null;
  expandido: boolean;
  onToggleExpandir: () => void;
  onCambiarFactura: (factura: FacturaExtraidaIA) => void;
  onConfirmar: () => void;
  onQuitar: () => void;
}) {
  const itemsSinPrecio = item.factura?.items.filter((i) => i.precio_unitario === null).length ?? 0;
  const otroRestaurante =
    item.factura && nombreLocalElegido
      ? pareceOtroRestaurante(item.factura.cliente_detectado, nombreLocalElegido)
      : false;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={item.nombreArchivo}>
          {item.nombreArchivo}
        </span>

        <EstadoBadge item={item} />

        {item.factura && (
          <>
            <span className="text-sm text-slate-900">{item.factura.proveedor_nombre || "—"}</span>
            <span className="text-xs text-slate-400">{item.factura.fecha_emision}</span>
            {itemsSinPrecio > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {itemsSinPrecio} sin precio
              </span>
            )}
            {item.modelo === "pro" && (
              <span
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                title="Flash dio un resultado dudoso y se reprocesó con el modelo Pro"
              >
                revisado con Pro
              </span>
            )}
            {otroRestaurante && (
              <span
                className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                title={`La factura menciona "${item.factura?.cliente_detectado}" como comprador, pero elegiste "${nombreLocalElegido}" para este lote`}
              >
                ⚠️ ¿Restaurante equivocado?
              </span>
            )}
          </>
        )}

        <div className="flex-1" />

        {(item.estado === "validando" || item.estado === "guardando") && (
          <>
            <button type="button" onClick={onToggleExpandir} className="text-xs text-slate-500 hover:text-slate-900">
              {expandido ? "Ocultar" : "Ver/editar"}
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={item.estado === "guardando"}
              className="rounded-md bg-slate-950 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.estado === "guardando" ? "Guardando..." : "Confirmar"}
            </button>
          </>
        )}
        {item.estado === "guardado" && (
          <span className="text-xs text-emerald-700">
            Factura #{item.facturaId}
            {item.pendienteRevision && " (pendiente de revisión)"}
          </span>
        )}
        {item.posibleProveedorDuplicado && (
          <span
            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
            title={`Se cargó como proveedor nuevo porque el CUIT leído no coincide con el ya confirmado de "${item.posibleProveedorDuplicado}" — si es la misma empresa, fusionalos en /control-precios/proveedores.`}
          >
            ⚠️ ¿Proveedor duplicado?
          </span>
        )}
        <button type="button" onClick={onQuitar} className="text-xs text-rose-500 hover:text-rose-700">
          Quitar
        </button>
      </div>

      {item.error && (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{item.error}</div>
      )}

      {expandido && item.factura && (
        <div className="border-t border-slate-100 p-4">
          <EditorFacturaExtraida factura={item.factura} onChange={onCambiarFactura} />
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ item }: { item: ItemLote }) {
  const config: Record<EstadoItem, { texto: string; clase: string }> = {
    en_cola: { texto: "En cola", clase: "bg-slate-100 text-slate-500" },
    subiendo: { texto: "Subiendo...", clase: "bg-slate-100 text-slate-500" },
    procesando: { texto: "Leyendo con IA...", clase: "bg-slate-100 text-slate-500" },
    validando: { texto: "Para revisar", clase: "bg-amber-50 text-amber-700" },
    guardando: { texto: "Guardando...", clase: "bg-slate-100 text-slate-500" },
    guardado: { texto: "Confirmada", clase: "bg-emerald-50 text-emerald-700" },
    error: { texto: "Error", clase: "bg-rose-50 text-rose-700" },
  };
  const { texto, clase } = config[item.estado];
  const conSpinner = item.estado === "subiendo" || item.estado === "procesando" || item.estado === "guardando";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>
      {conSpinner && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      )}
      {texto}
    </span>
  );
}
