// Carga inicial de cpAfipExclusiones con los CUITs que el usuario identificó
// como alquileres/servicios (no facturas de productos) en los comprobantes de
// AFIP de julio 2026 para Pepe di Roma — ver conversación 2026-08-19. CUITs
// tomados del export real "Mis Comprobantes Recibidos -PEPE.xlsx".
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../db/index";
import { cpAfipExclusiones } from "../db/schema";

const EXCLUSIONES: { cuit: string; nombre: string; motivo: "ALQUILER" | "SERVICIO" | "OTRO" }[] = [
  { cuit: "30715221159", nombre: "Delivery Hero Financial Services S.A. (PedidosYa)", motivo: "SERVICIO" },
  { cuit: "30711985766", nombre: "Delivery Hero E-Commerce S.A. (PedidosYa)", motivo: "SERVICIO" },
  { cuit: "27222166204", nombre: "Cicchinelli Karina Amelia", motivo: "ALQUILER" },
  { cuit: "30697667810", nombre: "Sistemas de Proteccion y Seguridad SRL", motivo: "SERVICIO" },
  { cuit: "30711277249", nombre: "ICG Argentina S.A.", motivo: "SERVICIO" },
  { cuit: "30712295631", nombre: "Onsoft S.R.L.", motivo: "SERVICIO" },
  { cuit: "33716234679", nombre: "DSJV Sociedad Simple", motivo: "ALQUILER" },
  { cuit: "20204279692", nombre: "Mizraji Sergio Adrian", motivo: "ALQUILER" },
  { cuit: "20937098635", nombre: "Cicchinelli Jose", motivo: "ALQUILER" },
  { cuit: "27366846129", nombre: "Castelli Mariana", motivo: "ALQUILER" },
  { cuit: "20389950832", nombre: "Mancuso Lucas Marcelo", motivo: "SERVICIO" },
  { cuit: "27233270917", nombre: "Argibay Molina Virginia Maria", motivo: "SERVICIO" },
  { cuit: "20108328941", nombre: "Ruggeri Mario Antonio", motivo: "SERVICIO" },
  { cuit: "27932647538", nombre: "Chen Yejing", motivo: "SERVICIO" },
  { cuit: "30703088534", nombre: "MercadoLibre S.R.L. (Mercado Pago)", motivo: "SERVICIO" },
  { cuit: "27364006778", nombre: "Signorelli Agostina", motivo: "SERVICIO" },
  { cuit: "20183621859", nombre: "Ballestero Carlos Rodolfo", motivo: "SERVICIO" },
  { cuit: "20254421937", nombre: "Besada Pablo Martin", motivo: "SERVICIO" },
  { cuit: "20281684125", nombre: "Musich Diego", motivo: "SERVICIO" },
  { cuit: "30639453738", nombre: "Telecom Argentina S.A.", motivo: "SERVICIO" },
  { cuit: "27059151318", nombre: "Lopresti Nelida Adela", motivo: "SERVICIO" },
  { cuit: "30500008454", nombre: "Banco Santander Argentina S.A.", motivo: "SERVICIO" },
  { cuit: "27275373937", nombre: "Panighetti Maria Eugenia", motivo: "SERVICIO" },
];

async function main() {
  for (const e of EXCLUSIONES) {
    await db.insert(cpAfipExclusiones).values(e).onConflictDoUpdate({ target: cpAfipExclusiones.cuit, set: { nombre: e.nombre, motivo: e.motivo } });
    console.log(`OK  ${e.cuit}  ${e.motivo.padEnd(9)} ${e.nombre}`);
  }
  console.log(`\n${EXCLUSIONES.length} exclusiones cargadas.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
