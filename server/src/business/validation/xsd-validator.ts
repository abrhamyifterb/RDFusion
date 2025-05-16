export function validateXsdInteger(literal: string): boolean {
    return /^"-?\d+"$/.test(literal);
}

export function validateXsdDecimal(literal: string): boolean {
    return /^"-?\d+(\.\d+)?"$/.test(literal);
}

export function validateXsdFloat(literal: string): boolean {
    return /^"-?\d+(\.\d+)?(e[-+]?\d+)?"$/i.test(literal);
}

export function validateXsdDouble(literal: string): boolean {
    return validateXsdFloat(literal);
}

export function validateXsdDate(literal: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(literal);
}

export function validateXsdBoolean(literal: string): boolean {
    return /^(true|false|1|0)$/.test(literal);
}

