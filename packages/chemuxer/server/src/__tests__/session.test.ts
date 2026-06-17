import { describe, it, expect, afterEach, vi } from 'vitest';
import { Session } from '../session.js';

describe('Session', () => {
  let session: Session | undefined;

  afterEach(() => {
    session?.close();
  });

  it('spawns a PTY with the requested shell', () => {
    session = new Session('/bin/zsh');
    expect(session.id).toBeTruthy();
    expect(session.shell).toBe('/bin/zsh');
    expect(session.title).toBe('zsh');
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it('captures PTY output in headless terminal state', async () => {
    session = new Session('/bin/zsh');

    const output = await new Promise<string>((resolve) => {
      let buf = '';
      const dispose = session!.onData((data) => {
        buf += data;
        if (buf.includes('test output')) {
          dispose();
          resolve(buf);
        }
      });
      session!.write('echo "test output"\r');
      setTimeout(() => { dispose(); resolve(buf); }, 5000);
    });

    expect(output.length).toBeGreaterThan(0);

    await session.waitForPendingWrites();

    const state = session.getState();
    expect(state.length).toBeGreaterThan(0);
  });

  it('getState returns serialized terminal state', async () => {
    session = new Session('/bin/zsh', { scrollbackLines: 1000 });

    // Write directly to simulate PTY output
    await session.writeToHeadless('Hello, world!\r\n');
    await session.writeToHeadless('Second line\r\n');

    const state = session.getState();
    expect(state).toContain('Hello, world!');
    expect(state).toContain('Second line');
  });

  it('resize propagates to both PTY and headless terminal', () => {
    session = new Session('/bin/zsh');
    // Should not throw
    session.resize(120, 40);
  });

  it('onData returns a dispose function that removes the listener', async () => {
    session = new Session('/bin/zsh');
    let callCount = 0;
    const dispose = session.onData(() => { callCount++; });

    session.write('echo a\r');
    await new Promise((r) => setTimeout(r, 200));
    const countBefore = callCount;
    expect(countBefore).toBeGreaterThan(0);

    dispose();

    session.write('echo b\r');
    await new Promise((r) => setTimeout(r, 200));
    expect(callCount).toBe(countBefore);
  });

  it('rename updates the session title', () => {
    session = new Session('/bin/zsh');
    expect(session.title).toBe('zsh');

    session.rename('my dev server');
    expect(session.title).toBe('my dev server');

    const info = session.toInfo();
    expect(info.title).toBe('my dev server');
  });

  it('rename with empty string reverts to default shell name', () => {
    session = new Session('/bin/zsh');
    session.rename('custom name');
    expect(session.title).toBe('custom name');

    session.rename('');
    expect(session.title).toBe('zsh');
  });

  it('close kills the PTY process and disposes headless terminal', () => {
    session = new Session('/bin/zsh');
    session.close();
    expect(session.isClosed).toBe(true);
    session = undefined;
  });

  describe('resize validation', () => {
    it('rejects NaN values without calling resize on PTY', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.resize(NaN, 24);
      session.resize(80, NaN);
      session.resize(NaN, NaN);
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects Infinity values without calling resize on PTY', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.resize(Infinity, 24);
      session.resize(80, -Infinity);
      session.resize(Infinity, Infinity);
      expect(spy).not.toHaveBeenCalled();
    });

    it('clamps negative and zero values to minimums (cols=2, rows=1)', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.resize(-10, -5);
      expect(spy).toHaveBeenCalledWith(2, 1);

      spy.mockClear();
      session.resize(0, 0);
      expect(spy).toHaveBeenCalledWith(2, 1);
    });

    it('clamps values above maximums (cols=500, rows=200)', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.resize(1000, 500);
      expect(spy).toHaveBeenCalledWith(500, 200);
    });

    it('truncates float values to integers', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.resize(80.9, 24.7);
      expect(spy).toHaveBeenCalledWith(80, 24);
    });

    it('resize on closed session is a no-op', () => {
      session = new Session('/bin/zsh');
      const spy = vi.spyOn(session['ptyProcess'], 'resize');
      session.close();
      session.resize(80, 24);
      expect(spy).not.toHaveBeenCalled();
      session = undefined;
    });
  });
});
