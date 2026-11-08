// Run the frontend on :3100 and an isolated headless Chrome with --remote-debugging-port=9223.
// All backend requests are mocked; this check never writes camera or incident data.
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const tabs = await (await fetch('http://localhost:9223/json/list')).json();
  const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      message.error ? reject(Error(message.error.message)) : resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`Timeout: ${method}`)); }, 30000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error(`Not ready: ${expression}`);
  };
  const click = async text => {
    assert(await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.focus(); button.click(); return true; })()`), `Missing button: ${text}`);
  };
  try {
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const role = sessionStorage.getItem('test-role') || 'admin';
      const user = { id: 1, username: 'operator', name: 'Alex Morgan', email: 'operator@example.test', role, active: true };
      if (location.pathname !== '/login') {
        localStorage.setItem('sentinel_auth_token', 'ui-test');
        localStorage.setItem('sentinel_user_profile', JSON.stringify(user));
      } else { localStorage.clear(); }
      const camera = { id: 1, name: 'North entrance', location: 'Main building', status: 'OFFLINE', stream_url: 'test', is_simulation: true, ai_enabled: true, sampling_rate: 2, sensitivity: .25, pre_buffer_seconds: 8, post_buffer_seconds: 8 };
      const incident = { id: 1, public_id: 'INC-001', camera_id: 1, camera_name: camera.name, category: 'Suspected violence', severity: 'High', peak_confidence: .91, average_confidence: .8, detected_at: '2026-11-08T10:00:00Z', status: 'AWAITING_REVIEW', clip_status: 'FAILED' };
      const realFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = String(input);
        if (!url.startsWith('http://localhost:5000/')) return realFetch(input, init);
        let data = null;
        if (url.endsWith('/auth/me')) data = user;
        else if (url.endsWith('/auth/users')) data = [user];
        else if (url.endsWith('/cameras')) data = [camera, { ...camera, id: 2, name: 'South corridor' }];
        else if (url.includes('/incidents/1')) data = incident;
        else if (url.includes('/incidents')) data = [incident];
        else if (url.endsWith('/cameras/simulations')) data = [];
        else if (url.endsWith('/reports/summary')) data = { total_alerts: 12, confirmed_violence: 3, false_positives: 4, needs_review: 2, awaiting_review: 3, false_positive_rate: 44, by_camera: { Entrance: 8, Corridor: 4 }, by_severity: { High: 8, Medium: 4 }, by_category: { Fighting: 12 } };
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      };
      window.EventSource = class { close() {} };
    ` });
    for (const width of [1440, 768, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      for (const route of ['/login', '/', '/history', '/reports', '/users']) {
        await send('Page.navigate', { url: `http://localhost:3100${route}` });
        await until(`location.pathname === ${JSON.stringify(route)} && !!document.querySelector('${route === '/login' ? 'form' : '#main-content'}')`);
        await until(`document.readyState === 'complete'`);
        assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Horizontal overflow: ${route} at ${width}px`);
        if (route !== '/login') assert(await evaluate('document.querySelectorAll("nav a").length === 4'), 'Admin navigation');
        if (width === 1440 && (route === '/' || route === '/login')) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(`.next/ui-${route === '/' ? 'dashboard' : 'login'}.png`, Buffer.from(shot.data, 'base64'));
        }
        if (route === '/') {
          await click('Add camera');
          await until('!!document.querySelector("dialog[open]")');
          assert(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), 'Initial dialog focus');
          for (let i = 0; i < 15; i++) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            assert(await evaluate('document.querySelector("dialog").contains(document.activeElement) || document.activeElement === document.body'), 'Dialog focus must not reach background controls');
          }
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await until('!document.querySelector("dialog[open]")');
          assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Add camera', 'Restored focus');
          await click('Review Incident');
          await until('!!document.querySelector("dialog[open]")');
          assert(await evaluate('document.querySelector("dialog").textContent.includes("Clip unavailable")'), 'Failed clip presentation');
        }
        if (route === '/users') {
          await click('Add New User');
          await until('!!document.querySelector("dialog[open]")');
          assert(await evaluate('document.querySelector("dialog").getBoundingClientRect().width <= innerWidth'), 'Responsive user dialog');
        }
        console.log(`PASS ${route} at ${width}px`);
      }
    }
    for (const [role, count] of [['supervisor', 3], ['security', 2]]) {
      await evaluate(`sessionStorage.setItem('test-role', '${role}')`);
      await send('Page.navigate', { url: 'http://localhost:3100/' });
      await until('!!document.querySelector("#main-content")');
      assert.equal(await evaluate('document.querySelectorAll("nav a").length'), count, `${role} navigation`);
      assert(await evaluate('![...document.querySelectorAll("button")].some(b => b.textContent.includes("Add camera"))'), 'Restricted camera action');
      console.log(`PASS ${role} permissions`);
    }
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
