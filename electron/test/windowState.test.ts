import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { restoredWindowSize } from '../src/windowState';

const SCREEN = { width: 1920, height: 1080 };
const MIN = { width: 800, height: 600 };
const DEFAULT = { width: 1280, height: 860 };

describe('main window size restore', () => {
  it('reopens at the saved size', () => {
    assert.deepEqual(
      restoredWindowSize({ width: 1500, height: 900, maximized: true }, SCREEN, MIN, DEFAULT),
      { width: 1500, height: 900, maximized: true },
    );
  });

  it('uses the default size when nothing was saved', () => {
    assert.deepEqual(restoredWindowSize(null, SCREEN, MIN, DEFAULT), { ...DEFAULT, maximized: false });
  });

  it('ignores values that are not numbers', () => {
    assert.deepEqual(
      restoredWindowSize({ width: '1500', height: null, maximized: 'yes' }, SCREEN, MIN, DEFAULT),
      { ...DEFAULT, maximized: false },
    );
  });

  it('never opens larger than the screen or smaller than the minimum', () => {
    assert.deepEqual(
      restoredWindowSize({ width: 3840, height: 100 }, SCREEN, MIN, DEFAULT),
      { width: 1920, height: 600, maximized: false },
    );
  });

  it('shrinks the default size to fit a small screen', () => {
    assert.deepEqual(restoredWindowSize(null, { width: 1024, height: 700 }, MIN, DEFAULT), {
      width: 1024,
      height: 700,
      maximized: false,
    });
  });
});
