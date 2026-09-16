/**
 * Direction (RTL / LTR) Controller and Restoration
 */
import { DIRECTION_ATTR } from '../../shared/constants.js';

const directionSnapshots = new Map();

export function cleanDirection(node) {
  if (!node) return;
  node.removeAttribute(DIRECTION_ATTR);
  node.style.removeProperty('direction');
  node.style.removeProperty('text-align');
}

export function restoreAllDirections() {
  directionSnapshots.forEach((original, node) => {
    if (original === null) node.removeAttribute('dir');
    else node.setAttribute('dir', original);
    cleanDirection(node);
  });
  directionSnapshots.clear();

  document.querySelectorAll(`[${DIRECTION_ATTR}]`).forEach((node) => {
    cleanDirection(node);
  });
  cleanDirection(document.documentElement);
  if (document.body) cleanDirection(document.body);
}

export function applyDirectionToRoot(root, value) {
  if (!root) return;
  const isApplied = root.getAttribute('dir') === value && root.getAttribute(DIRECTION_ATTR) === value;
  if (!isApplied) {
    if (!directionSnapshots.has(root)) {
      directionSnapshots.set(root, root.getAttribute('dir'));
    }
    root.setAttribute('dir', value);
    root.setAttribute(DIRECTION_ATTR, value);
    root.style.setProperty('direction', value, 'important');
    root.style.setProperty('text-align', value === 'rtl' ? 'right' : 'left', 'important');
  }

  if (root === document.documentElement && document.body) {
    const isBodyApplied = document.body.getAttribute('dir') === value && document.body.getAttribute(DIRECTION_ATTR) === value;
    if (!isBodyApplied) {
      if (!directionSnapshots.has(document.body)) {
        directionSnapshots.set(document.body, document.body.getAttribute('dir'));
      }
      document.body.setAttribute('dir', value);
      document.body.setAttribute(DIRECTION_ATTR, value);
      document.body.style.setProperty('direction', value, 'important');
      document.body.style.setProperty('text-align', value === 'rtl' ? 'right' : 'left', 'important');
    }
  }
}
