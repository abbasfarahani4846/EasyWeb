/**
 * YouTube playbackRate and ad-skip regression test.
 *
 * Verifies that the YouTube scriptlet never resets user-selected playbackRate
 * (e.g. 2x via mouse hold or speed menu) during normal playback or DOM mutations,
 * and correctly speeds up and restores rate during actual ad segments.
 */
import assert from 'node:assert/strict';
import { youtubeSkipAds } from '../src/inject/index.js';

let passed = 0;
function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  passed++;
}

class MockClassList {
  constructor(names = []) {
    this._set = new Set(names);
  }
  add(name) { this._set.add(name); }
  delete(name) { this._set.delete(name); }
  contains(name) { return this._set.has(name); }
}

// Minimal DOM mock
class MockElement {
  constructor(tag, className = '') {
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList(className.split(' ').filter(Boolean));
    this.children = [];
    this.childElementCount = 0;
    this.muted = false;
    this.playbackRate = 1;
    this.duration = 100;
    this.currentTime = 0;
    this.paused = false;
  }
  querySelector(sel) {
    if (sel.includes('video') && this.tagName !== 'VIDEO') {
      return this.children.find((c) => c.tagName === 'VIDEO') || null;
    }
    return null;
  }
}

const mockVideo = new MockElement('video');
const mockPlayer = new MockElement('div', 'html5-video-player');
mockPlayer.children.push(mockVideo);

let observerCallback = null;
globalThis.MutationObserver = class {
  constructor(cb) {
    observerCallback = cb;
  }
  observe() {}
  disconnect() {}
};

globalThis.document = {
  readyState: 'complete',
  querySelector(sel) {
    if (sel === '.html5-video-player') return mockPlayer;
    if (sel === 'video') return mockVideo;
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener() {}
};

const state = { enabled: true };
youtubeSkipAds(state);

// 1. User sets playback rate to 2x (e.g. mouse hold or speed menu)
mockVideo.playbackRate = 2;

// 2. DOM mutations occur on player (e.g. controls hide/show, HUD, subtitle)
assert.ok(observerCallback, 'observer callback installed');
observerCallback();
check('playbackRate stays 2x on DOM mutation', mockVideo.playbackRate, 2);

// 3. Periodic attach / mutation must not reset it either
observerCallback();
check('playbackRate stays 2x on repeated mutation', mockVideo.playbackRate, 2);

// 4. Ad starts: player gets 'ad-showing'
mockPlayer.classList.add('ad-showing');
observerCallback();
check('ad speeds up to 16x', mockVideo.playbackRate, 16);
check('ad is muted', mockVideo.muted, true);

// 5. Ad ends: 'ad-showing' removed
mockPlayer.classList.delete('ad-showing');
observerCallback();
check('playbackRate restored to 2x after ad', mockVideo.playbackRate, 2);
check('video unmuted after ad', mockVideo.muted, false);

// 6. Normal DOM mutation after ad finished
observerCallback();
check('playbackRate remains 2x after ad finishes and DOM mutates', mockVideo.playbackRate, 2);

console.log(`youtube-playback.test.mjs: ${passed} passed, 0 failed`);
process.exit(0);
