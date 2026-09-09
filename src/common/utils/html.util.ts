import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";

/**
 * Utilidades de HTML basadas en `sanitize-html` (parser real, sin regex frágil).
 *
 * - `stripHtml`      → texto plano. Para campos que NUNCA son HTML por contrato:
 *                      news.title, notification.subject/message, task.title/description.
 * - `sanitizeRichHtml` → HTML por whitelist. Para news.description: se guarda como
 *                      HTML crudo pero se filtran <script>, <style>, on*, y
 *                      href="javascript:".
 */

/**
 * Quita TODAS las etiquetas y decodifica entidades. `<h1><b>Hola</b></h1>` → `Hola`.
 * El contenido de <script>/<style> se descarta entero (no queda el texto suelto).
 * Colapsa saltos de línea y espacios repetidos a un solo espacio para dejar una
 * línea apta para una celda de tabla, un toast o un asunto de email.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  // sanitize-html no inserta separadores al quitar etiquetas, así que
  // `<p>a</p><p>b</p>` quedaría como `ab`. `textFilter` recibe cada nodo de
  // texto ya parseado (por htmlparser2, no regex) y le añade un espacio final;
  // los espacios sobrantes se colapsan después.
  const text = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    // <script>, <style>, <textarea>, <option> → se elimina también su contenido
    disallowedTagsMode: "discard",
    textFilter: (t) => `${t} `,
  });

  // sanitize-html devuelve HTML-safe (`&amp;`, `&lt;`). Este campo es texto
  // plano y el frontend lo pinta como textContent, así que se decodifican las
  // entidades a caracteres reales. `decodeHTML` es de `entities` (el parser que
  // ya usa sanitize-html), no regex.
  return decodeHTML(text).replace(/\s+/g, " ").trim();
}

/** Etiquetas seguras permitidas en el cuerpo HTML de una noticia. */
const RICH_ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "span", "div",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "img", "figure", "figcaption",
];

/**
 * Sanitiza el HTML de `news.description` contra una whitelist. Mantiene el
 * marcado de formato del editor RichText; elimina scripts, estilos, iframes,
 * manejadores de eventos (`onclick`, ...) y URLs `javascript:` / `data:` en
 * enlaces. NO escapa: el resultado sigue siendo HTML real (`<h1>…</h1>`, no
 * `&lt;h1&gt;…`).
 */
export function sanitizeRichHtml(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  return sanitizeHtml(input, {
    allowedTags: RICH_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height"],
      span: ["style"],
      div: ["style"],
      p: ["style"],
      td: ["style", "colspan", "rowspan"],
      th: ["style", "colspan", "rowspan"],
      "*": ["class"],
    },
    // Solo esquemas seguros en href/src. `javascript:` y `vbscript:` fuera.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    // style: solo un puñado de propiedades de formato, sin `expression()` ni url()
    allowedStyles: {
      "*": {
        "color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^[a-z-]+$/i],
        "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^[a-z-]+$/i],
        "text-align": [/^left$|^right$|^center$|^justify$/],
        "font-weight": [/^normal$|^bold$|^\d{3}$/],
        "font-style": [/^normal$|^italic$/],
        "text-decoration": [/^none$|^underline$|^line-through$/],
      },
    },
    disallowedTagsMode: "discard",
  });
}
