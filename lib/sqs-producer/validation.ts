
export function isString(value: any): boolean {
    return typeof value === 'string' || value instanceof String;
}

export function isObject(value: any): boolean {
    return value && typeof value === 'object' && value instanceof Object;
}

export function isMessageAttributeValid(messageAttribute: any): boolean {
    if (!messageAttribute.DataType) {
        throw new Error('A MessageAttribute must have a DataType key');
    }
    if (!isString(messageAttribute.DataType)) {
        throw new Error('The DataType key of a MessageAttribute must be a String');
    }
    return true;
}
