import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);
  private scanner: any = null;
  private initAttempted = false;

  private async getScanner(): Promise<any | null> {
    if (this.initAttempted) return this.scanner;
    this.initAttempted = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const NodeClam = require("clamscan");
      const clamscan = new NodeClam();
      this.scanner = await clamscan.init({
        removeInfected: false,
        quarantineInfected: false,
        debugMode: false,
        scanRecursively: false,
        clamscan: { active: true, scanArchives: false },
        clamdscan: { active: false },
        preference: "clamscan",
      });
      this.logger.log("ClamAV inicializado correctamente");
    } catch (err) {
      this.logger.warn(
        `ClamAV no disponible: ${(err as Error).message}. Escaneo deshabilitado.`,
      );
      this.scanner = null;
    }
    return this.scanner;
  }

  async scan(buffer: Buffer): Promise<void> {
    const scanner = await this.getScanner();

    if (!scanner) {
      if (process.env.NODE_ENV === "production") {
        throw new UnprocessableEntityException(
          "Servicio antivirus no disponible. Contacte al administrador.",
        );
      }
      this.logger.warn("ClamAV no disponible — omitiendo escaneo en desarrollo");
      return;
    }

    const tempPath = join(tmpdir(), `av_${uuidv4()}`);
    try {
      writeFileSync(tempPath, buffer);
      const { isInfected, viruses } = await scanner.isInfected(tempPath);
      if (isInfected) {
        const detected = Array.isArray(viruses) ? viruses.join(", ") : "desconocida";
        throw new UnprocessableEntityException(
          `Archivo rechazado: amenaza detectada (${detected})`,
        );
      }
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {}
    }
  }
}
