export interface FieldLocation {
    page: number;
    boundingBox: { left: number; top: number; width: number; height: number };
}
export interface SelectedField { confidence?: number; location?: FieldLocation }
export function parseField(json: string): SelectedField {
    if (!json.trim()) return {};
    let field: SelectedField;
    try { field = JSON.parse(json) as SelectedField; }
    catch { throw new Error('Selected field metadata is not valid JSON.'); }
    if (!field || typeof field !== 'object' || Array.isArray(field)) throw new Error('Selected field metadata must be an object.');
    if (field.confidence !== undefined && (typeof field.confidence !== 'number' || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1)) {
        throw new Error('Field confidence must be a number from 0 to 1.');
    }
    if (field.location == null) return { confidence: field.confidence };
    const { page, boundingBox: box } = field.location;
    if (!Number.isInteger(page) || page < 1) throw new Error('Field page must be a one-based positive integer.');
    if (!box || !['left', 'top', 'width', 'height'].every(key => {
        const value = box[key as keyof typeof box];
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
    }) || box.width <= 0 || box.height <= 0 || box.left + box.width > 1.000001 || box.top + box.height > 1.000001) {
        throw new Error('Field bounding box must have positive dimensions and fit within normalized page coordinates (0 to 1).');
    }
    return field;
}
export function normalizeDocument(value: string): string {
    return value.trim().replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '').replace(/\s/g, '');
}
export function decodeDocument(base64: string): Uint8Array {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) throw new Error('PDF content must be raw base64 or an application/pdf base64 data URL.');
    let raw: string;
    try { raw = atob(base64); } catch { throw new Error('PDF content contains invalid base64.'); }
    if (!raw.slice(0, 1024).includes('%PDF-')) throw new Error('Decoded content is not a PDF document.');
    return Uint8Array.from(raw, char => char.charCodeAt(0));
}
