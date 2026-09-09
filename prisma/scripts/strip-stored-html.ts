/**
 * One-off data cleanup: limpia el HTML que quedó guardado en columnas que son
 * de texto plano por contrato, y sanitiza el HTML de las que sí lo permiten.
 *
 *   news.title           → texto plano  (stripHtml)
 *   news.description      → HTML whitelist (sanitizeRichHtml) — quita <script> etc.
 *   notification.subject  → texto plano  (stripHtml)
 *   notification.message  → texto plano  (stripHtml)
 *   task.title            → texto plano  (stripHtml)
 *   task.description      → texto plano  (stripHtml)
 *
 * Usa la MISMA librería (`sanitize-html`) que los endpoints — sin regex.
 * Idempotente: correrlo dos veces no cambia nada la segunda vez.
 *
 *   npx ts-node prisma/scripts/strip-stored-html.ts
 *   npm run data:strip-html
 */
import { PrismaClient } from "@prisma/client";
import { stripHtml, sanitizeRichHtml } from "../../src/common/utils/html.util";

const prisma = new PrismaClient();
const BATCH = 200;

async function cleanNews(): Promise<number> {
  let changed = 0;
  for (let skip = 0; ; skip += BATCH) {
    const rows = await prisma.news.findMany({
      skip,
      take: BATCH,
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, description: true },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      const title = stripHtml(r.title);
      const description = sanitizeRichHtml(r.description);
      if (title !== r.title || description !== r.description) {
        await prisma.news.update({ where: { id: r.id }, data: { title, description } });
        changed++;
      }
    }
  }
  return changed;
}

async function cleanNotifications(): Promise<number> {
  let changed = 0;
  for (let skip = 0; ; skip += BATCH) {
    const rows = await prisma.notification.findMany({
      skip,
      take: BATCH,
      orderBy: { sentAt: "asc" },
      select: { id: true, subject: true, message: true },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      const subject = stripHtml(r.subject);
      const message = stripHtml(r.message);
      if (subject !== r.subject || message !== r.message) {
        await prisma.notification.update({
          where: { id: r.id },
          data: { subject, message },
        });
        changed++;
      }
    }
  }
  return changed;
}

async function cleanTasks(): Promise<number> {
  let changed = 0;
  for (let skip = 0; ; skip += BATCH) {
    const rows = await prisma.task.findMany({
      skip,
      take: BATCH,
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, description: true },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      const title = stripHtml(r.title);
      const description = stripHtml(r.description);
      if (title !== r.title || description !== r.description) {
        await prisma.task.update({ where: { id: r.id }, data: { title, description } });
        changed++;
      }
    }
  }
  return changed;
}

async function main() {
  console.log("Limpiando HTML guardado…");
  const news = await cleanNews();
  const notifications = await cleanNotifications();
  const tasks = await cleanTasks();
  console.log(
    `Listo. Filas modificadas → news: ${news}, notifications: ${notifications}, tasks: ${tasks}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
