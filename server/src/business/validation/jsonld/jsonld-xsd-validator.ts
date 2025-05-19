export function validateXsdInteger(literal: string | number): boolean {
    const str = typeof literal === 'string' ? literal : String(literal);
    return /^-?\d+$/.test(str);
}

export function validateXsdDecimal(literal: string | number): boolean {
    const str = typeof literal === 'string' ? literal : String(literal);
    return /^-?\d+(\.\d+)?$/.test(str);
}

export function validateXsdFloat(literal: string | number): boolean {
    const str = typeof literal === 'string' ? literal : String(literal);
    return /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(str);
}

export function validateXsdDouble(literal: string | number): boolean {
    return validateXsdFloat(literal);
}

export function validateXsdDate(literal: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(literal);
}

export function validateXsdBoolean(literal: string | number | boolean): boolean {
    const str = String(literal).toLowerCase();
    return /^(true|false|1|0)$/.test(str);
}