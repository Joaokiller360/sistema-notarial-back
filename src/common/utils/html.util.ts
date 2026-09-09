import { convert } from "html-to-text";

/**
 * Convierte HTML a texto plano legible. Reutilizable en cualquier destino que
 * NO renderiza HTML (notificaciones del inbox, toasts, listados, push, email en
 * texto). Usa el parser de `html-to-text` — nada de regex frágil.
 *
 * - Decodifica entidades (`&amp;` → `&`, `&nbsp;` → espacio).
 * - `<br>`, `</p>`, `<li>` → saltos de línea, que luego se colapsan a un espacio
 *   para dejar una sola línea apta para una celda de tabla o un toast.
 * - `<a href="https://x">texto</a>` → `texto https://x` (la URL plana se
 *   conserva; si el href coincide con el texto no se duplica).
 * - Entrada vacía / no-string → cadena vacía.
 */
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  const text = convert(input, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true, linkBrackets: false } },
      { selector: "img", format: "skip" },
      { selector: "ul", options: { itemPrefix: " " } },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
    ],
  });

  // Colapsa cualquier bloque de espacios/saltos de línea en un único espacio.
  return text.replace(/\s+/g, " ").trim();
}
