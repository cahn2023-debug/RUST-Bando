/**
 * Vietnamese Search Utilities
 * Provides tone-insensitive search optimized for Vietnamese text
 */

/**
 * Removes Vietnamese tones from text for search normalization
 */
export const removeVietnameseTones = (str: string): string => {
  if (!str) return '';
  
  let normalized = str.normalize('NFC');
  
  // Replace Vietnamese characters with base characters
  const replacements: [RegExp, string][] = [
    [/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a'],
    [/[èéẹẻẽêềếệểễ]/g, 'e'],
    [/[ìíịỉĩ]/g, 'i'],
    [/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o'],
    [/[ùúụủũưừứựửữ]/g, 'u'],
    [/[ỳýỵỷỹ]/g, 'y'],
    [/[đ]/g, 'd'],
    [/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, 'A'],
    [/[ÈÉẸẺÊỀẾỆỂỄ]/g, 'E'],
    [/[ÌÍỊỈĨ]/g, 'I'],
    [/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, 'O'],
    [/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, 'U'],
    [/[ỲÝỴỶỸ]/g, 'Y'],
    [/[Đ]/g, 'D'],
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Remove combining diacritical marks
  normalized = normalized.replace(/[\u0300-\u036f]/g, '');

  return normalized;
};

/**
 * Checks if a value matches a search query (tone-insensitive)
 */
export const matchesSearchQuery = (value: any, query: string): boolean => {
  if (!query || !value) return false;
  
  const valueStr = String(value).toLowerCase();
  const queryLower = query.toLowerCase();
  const queryNoTone = removeVietnameseTones(queryLower);
  const valueNoTone = removeVietnameseTones(valueStr);

  // Check both original and tone-removed versions
  return valueStr.includes(queryLower) || valueNoTone.includes(queryNoTone);
};

/**
 * Filters an array of objects based on a search query across multiple fields
 */
export const filterBySearchQuery = <T extends Record<string, any>>(
  items: T[],
  query: string,
  searchFields: (keyof T)[]
): T[] => {
  if (!query.trim()) return items;

  return items.filter(item => {
    return searchFields.some(field => {
      const value = item[field];
      return matchesSearchQuery(value, query);
    });
  });
};

/**
 * Highlights matching text in a string (for UI display)
 */
export const highlightMatch = (text: string, query: string): string => {
  if (!query || !text) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-300 text-black px-0.5 rounded">$1</mark>');
};
