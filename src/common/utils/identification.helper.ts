/**
 * Central identification validation helper.
 * Handles cédula (10 digits), RUC (13 digits), and pasaporte (alphanumeric 5-20 chars).
 *
 * Rules:
 *   es_pasaporte=true  → validates pasaporte field only, ignores cedulaORuc
 *   es_pasaporte=false → validates cedulaORuc by length: 10=cédula, 13=RUC
 */

export interface IdentificationError {
  success: false;
  codigo: string;
  mensaje: string;
  campo: string;
}

export interface IdentificationResult {
  valid: boolean;
  error?: IdentificationError;
}

/** Cédula: must be exactly 10 numeric digits. */
export function validateCedulaFormat(value: string): IdentificationResult {
  if (!/^\d{10}$/.test(value)) {
    return {
      valid: false,
      error: {
        success: false,
        codigo: 'VALIDACION_CEDULA',
        mensaje: 'La cédula debe contener exactamente 10 dígitos numéricos',
        campo: 'cedula',
      },
    };
  }
  return { valid: true };
}

/** RUC: must be exactly 13 numeric digits. */
export function validateRucFormat(value: string): IdentificationResult {
  if (!/^\d{13}$/.test(value)) {
    return {
      valid: false,
      error: {
        success: false,
        codigo: 'VALIDACION_RUC',
        mensaje: 'El RUC debe contener exactamente 13 dígitos numéricos',
        campo: 'ruc',
      },
    };
  }
  return { valid: true };
}

/** Pasaporte: alphanumeric, 5–20 characters. */
export function validatePasaporteFormat(value: string): IdentificationResult {
  if (!/^[a-zA-Z0-9]{5,20}$/.test(value)) {
    return {
      valid: false,
      error: {
        success: false,
        codigo: 'VALIDACION_PASAPORTE',
        mensaje: 'El pasaporte debe ser alfanumérico y tener entre 5 y 20 caracteres',
        campo: 'pasaporte',
      },
    };
  }
  return { valid: true };
}

/**
 * Validates an identification document given the es_pasaporte flag.
 * Returns { valid: true } when the value is absent and not required.
 */
export function validateIdentificacion(options: {
  cedulaORuc?: string;
  esPasaporte?: boolean;
  pasaporte?: string;
}): IdentificationResult {
  const { cedulaORuc, esPasaporte, pasaporte } = options;

  if (esPasaporte) {
    if (!pasaporte) {
      return {
        valid: false,
        error: {
          success: false,
          codigo: 'VALIDACION_PASAPORTE',
          mensaje: 'El pasaporte debe ser alfanumérico y tener entre 5 y 20 caracteres',
          campo: 'pasaporte',
        },
      };
    }
    return validatePasaporteFormat(pasaporte);
  }

  // No cedulaORuc and not passport — skip (DTO required validators handle missing values)
  if (!cedulaORuc) return { valid: true };

  if (cedulaORuc.length === 10) return validateCedulaFormat(cedulaORuc);
  if (cedulaORuc.length === 13) return validateRucFormat(cedulaORuc);

  // Wrong length — show cédula error if digits only, otherwise RUC/cédula ambiguous
  if (/^\d+$/.test(cedulaORuc)) {
    return {
      valid: false,
      error: {
        success: false,
        codigo: cedulaORuc.length < 10 || cedulaORuc.length === 11 || cedulaORuc.length === 12
          ? 'VALIDACION_CEDULA'
          : 'VALIDACION_RUC',
        mensaje: cedulaORuc.length < 13
          ? 'La cédula debe contener exactamente 10 dígitos numéricos'
          : 'El RUC debe contener exactamente 13 dígitos numéricos',
        campo: cedulaORuc.length < 13 ? 'cedula' : 'ruc',
      },
    };
  }

  // Contains non-numeric characters — treat as cédula error
  return {
    valid: false,
    error: {
      success: false,
      codigo: 'VALIDACION_CEDULA',
      mensaje: 'La cédula debe contener exactamente 10 dígitos numéricos',
      campo: 'cedula',
    },
  };
}
