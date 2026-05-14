import { BadRequestException } from "@nestjs/common";

/**
 * Strips dangerous patterns and characters from string inputs.
 * Throws BadRequestException if injection patterns are detected.
 */
export function sanitizeInput(value: string): string {
  if (typeof value !== "string") return value;

  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /alert\s*\(/i,
    /eval\s*\(/i,
    /document\./i,
    /window\./i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(value)) {
      throw new BadRequestException("El valor contiene contenido no permitido");
    }
  }

  return value.replace(/[<>"'`&;(){}[\]/\\=%+#$@!*^|]/g, "").trim();
}

/**
 * Validates an Ecuadorian cédula (10 digits) using the Luhn-like algorithm.
 */
export function validateCedula(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;

  const province = parseInt(cedula.substring(0, 2), 10);
  if (province < 1 || province > 24) return false;

  const digits = cedula.split("").map(Number);
  const verifier = digits[9];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let val = digits[i];
    if (i % 2 === 0) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
  }

  const check = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return check === verifier;
}

/**
 * Validates an Ecuadorian RUC (13 digits).
 * Accepts natural person RUC (cédula + 001) and juridical person RUC.
 */
export function validateRuc(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false;

  const suffix = ruc.substring(10);
  if (!/^0{0,1}[1-9]{1}\d{0,1}$/.test(suffix) && suffix !== "001") return false;

  const thirdDigit = parseInt(ruc[2], 10);

  if (thirdDigit < 6) {
    // Natural person
    return validateCedula(ruc.substring(0, 10)) && ruc.substring(10) === "001";
  }

  return true;
}

/**
 * Validates either a cédula or RUC.
 */
export function validateCedulaOrRuc(value: string): boolean {
  return validateCedula(value) || validateRuc(value);
}
