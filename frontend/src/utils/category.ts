// frontend/src/utils/category.ts
// Single source of truth for document category normalization.
// Import this instead of copy-pasting the logic in each page.

export const CATEGORY_OPTIONS = [
  'All',
  'Quality Manual',
  'Procedure',
  'Work Instruction',
  'Support Document',
  'Outside Document',
  'Operation Standard',
  'Form',
  'Report',
] as const;

export type DocumentCategory = typeof CATEGORY_OPTIONS[number];

/** Normalize raw category/level strings from the DB into a display label */
export function normalizeCategory(value: string): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'qm' || text.includes('quality manual')) return 'Quality Manual';
  if (text === 'qp' || text.includes('procedure'))      return 'Procedure';
  if (text === 'wi' || text.includes('work instruction')) return 'Work Instruction';
  if (text.includes('support'))                         return 'Support Document';
  if (text.includes('outside'))                         return 'Outside Document';
  if (text.includes('operation standard'))              return 'Operation Standard';
  if (text === 'fm' || text.includes('form'))           return 'Form';
  if (text.includes('report'))                          return 'Report';
  return String(value || '').trim();
}

/** Map a normalized category to its IATF level ID (L1–L4) */
export function getLevelId(category: string): string {
  switch (category) {
    case 'Quality Manual':     return 'L1';
    case 'Procedure':          return 'L2';
    case 'Work Instruction':
    case 'Support Document':
    case 'Outside Document':
    case 'Operation Standard': return 'L3';
    case 'Form':
    case 'Report':             return 'L4';
    default:                   return 'UNKNOWN';
  }
}
