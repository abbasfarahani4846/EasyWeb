/**
 * Element Picker Bridge for Background Service Worker
 */
const pickerResults = new Map();

export function setPickerResult(tabId, result) {
  if (!tabId) return;
  pickerResults.set(tabId, result);
}

export function popPickerResult(tabId) {
  if (!tabId) return null;
  const result = pickerResults.get(tabId) || null;
  pickerResults.delete(tabId);
  return result;
}
