"use client";

import { useState, type ReactNode } from "react";

/** Sección con título que se puede mostrar/ocultar a mano — pensado para
 * poder enfocarse en una sola comparación a la vez sin scrollear entre varias
 * tablas grandes en la misma pantalla. No persiste el estado entre visitas:
 * arranca abierta salvo que se pida lo contrario. */
export function SeccionColapsable({
  titulo,
  defaultAbierta = true,
  children,
}: {
  titulo: ReactNode;
  defaultAbierta?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(defaultAbierta);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <span className="text-slate-400">{abierta ? "▾" : "▸"}</span>
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">{titulo}</h2>
      </button>
      {abierta && children}
    </div>
  );
}
