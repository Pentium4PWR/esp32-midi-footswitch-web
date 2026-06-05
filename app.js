const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');
const logOutput = document.getElementById('logOutput');
const messageType = document.getElementById('messageType');
const ccFields = document.getElementById('ccFields');
const noteFields = document.getElementById('noteFields');
const pcFields = document.getElementById('pcFields');
const buttonTabs = document.getElementById('buttonTabs');
const whenSelect = document.getElementById('whenSelect');
const channelInput = document.getElementById('channelInput');
const controllerInput = document.getElementById('controllerInput');
const valueInput = document.getElementById('valueInput');
const noteInput = document.getElementById('noteInput');
const velocityInput = document.getElementById('velocityInput');
const programInput = document.getElementById('programInput');
const loadBtn = document.getElementById('loadBtn');
const programBtn = document.getElementById('programBtn');
const addMessageBtn = document.getElementById('addMessageBtn');
const toggleSettings = document.getElementById('toggleSettings');
const toggleEnabled = document.getElementById('toggleEnabled');
const toggleStageSelect = document.getElementById('toggleStageSelect');
const messageList = document.getElementById('messageList');
const deleteMessageBtn = document.getElementById('deleteMessageBtn');
const configStatus = document.getElementById('configStatus');
const summaryPanel = document.getElementById('summaryPanel');

let selectedButton = '1';

let port = null;
let writer = null;
let reader = null;
let readableStreamClosed = null;
let writableStreamClosed = null;
let keepReading = false;
let responseListeners = [];
let deviceConfig = createEmptyConfig();
let selectedMessageIndex = -1;

function createEmptyConfig() {
  const buttons = {};
  for (let i = 1; i <= 6; i += 1) {
    buttons[String(i)] = {
      press: [],
      release: [],
      toggle: {
        enabled: false,
        state: false,
        press_on: [],
        press_off: [],
      },
    };
  }
  return { buttons };
}

function normalizeConfig(rawConfig) {
  const config = createEmptyConfig();
  if (!rawConfig || typeof rawConfig !== 'object') {
    return config;
  }

  if (rawConfig.buttons && typeof rawConfig.buttons === 'object') {
    Object.keys(rawConfig.buttons).forEach((key) => {
      if (!config.buttons[key]) {
        return;
      }
      const bn = rawConfig.buttons[key];
      if (Array.isArray(bn.press)) {
        config.buttons[key].press = bn.press.map((item) => ({ ...item }));
      }
      if (Array.isArray(bn.release)) {
        config.buttons[key].release = bn.release.map((item) => ({ ...item }));
      }
      if (bn.toggle && typeof bn.toggle === 'object') {
        if (typeof bn.toggle.enabled === 'boolean') {
          config.buttons[key].toggle.enabled = bn.toggle.enabled;
        }
        if (typeof bn.toggle.state === 'boolean') {
          config.buttons[key].toggle.state = bn.toggle.state;
        }
        if (Array.isArray(bn.toggle.press_on)) {
          config.buttons[key].toggle.press_on = bn.toggle.press_on.map((item) => ({ ...item }));
        }
        if (Array.isArray(bn.toggle.press_off)) {
          config.buttons[key].toggle.press_off = bn.toggle.press_off.map((item) => ({ ...item }));
        }
      }
    });
  }
  return config;
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logOutput.textContent += `[${timestamp}] ${message}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function updateStatus(text, isError = false) {
  statusEl.textContent = `Status: ${text}`;
  statusEl.style.color = isError ? '#f87171' : '#7dd3fc';
}

function buildMessageObject() {
  const type = messageType.value;
  const msg = { type, channel: Number(channelInput.value) };
  if (type === 'cc') {
    msg.controller = Number(controllerInput.value);
    msg.value = Number(valueInput.value);
  } else if (type === 'noteOn' || type === 'noteOff') {
    msg.note = Number(noteInput.value);
    msg.velocity = Number(velocityInput.value);
  } else if (type === 'pc') {
    msg.program = Number(programInput.value);
  }
  return msg;
}

function getSelectedButtonKey() {
  return selectedButton;
}

function formatMessagePayload() {
  const payload = {
    action: 'set',
    button: Number(getSelectedButtonKey()),
    when: whenSelect.value,
  };

  const msg = buildMessageObject();
  if (payload.when === 'toggle') {
    payload.enabled = true;
    payload.messages_on = [msg];
    payload.messages_off = [];
  } else {
    payload.messages = [msg];
  }

  return payload;
}

function formatDisplay(msg) {
  const t = msg.type || '?';
  const ch = msg.channel ?? 1;
  if (t === 'cc') {
    return `CC ch${ch} ctrl${msg.controller ?? 0} val${msg.value ?? 0}`;
  }
  if (t === 'noteOn' || t === 'noteOff') {
    return `${t} ch${ch} note${msg.note ?? 0} vel${msg.velocity ?? 0}`;
  }
  if (t === 'pc') {
    return `PC ch${ch} prog${msg.program ?? 0}`;
  }
  return JSON.stringify(msg);
}

function getCurrentButtonConfig() {
  const buttonKey = getSelectedButtonKey();
  if (!deviceConfig.buttons[buttonKey]) {
    deviceConfig.buttons[buttonKey] = {
      press: [],
      release: [],
      toggle: { enabled: false, state: false, press_on: [], press_off: [] },
    };
  }
  return deviceConfig.buttons[buttonKey];
}

function getCurrentSection() {
  const buttonConfig = getCurrentButtonConfig();
  const when = whenSelect.value;
  if (when === 'toggle') {
    return {
      when,
      enabled: buttonConfig.toggle.enabled,
      stage: toggleStageSelect.value,
      messages: buttonConfig.toggle[toggleStageSelect.value],
      toggleConfig: buttonConfig.toggle,
    };
  }
  return {
    when,
    enabled: false,
    messages: buttonConfig[when],
    toggleConfig: buttonConfig.toggle,
  };
}

function updateMessageList() {
  const section = getCurrentSection();
  messageList.innerHTML = '';
  section.messages.forEach((msg, idx) => {
    const option = document.createElement('option');
    option.value = String(idx);
    option.textContent = formatDisplay(msg);
    messageList.appendChild(option);
  });
  deleteMessageBtn.disabled = section.messages.length === 0;
}

function updateSectionControls() {
  const section = getCurrentSection();
  if (whenSelect.value === 'toggle') {
    toggleSettings.classList.remove('hidden');
    toggleEnabled.checked = section.enabled;
  } else {
    toggleSettings.classList.add('hidden');
  }
  updateMessageList();
}

function updateConfigStatus(message) {
  configStatus.textContent = `Config: ${message}`;
}

function markActiveButtonTab(buttonKey) {
  const tabs = buttonTabs.querySelectorAll('[data-button]');
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.button === buttonKey);
  });
}

function setSelectedButton(buttonKey) {
  if (!deviceConfig.buttons[buttonKey]) {
    deviceConfig.buttons[buttonKey] = {
      press: [],
      release: [],
      toggle: { enabled: false, state: false, press_on: [], press_off: [] },
    };
  }
  selectedButton = buttonKey;
  markActiveButtonTab(buttonKey);
  refreshCurrentSection();
  updateConfigStatus(`button ${buttonKey} selected`);
}

function formatSectionMessages(messages) {
  return messages.length > 0 ? messages.map(formatDisplay).join('; ') : 'none';
}

function renderConfigSummary() {
  ensureDeviceConfigLoaded();
  summaryPanel.innerHTML = '';
  const order = ['4', '5', '6', '1', '2', '3'];
  order.forEach((buttonKey) => {
    const buttonConfig = deviceConfig.buttons[buttonKey];
    const item = document.createElement('div');
    item.className = 'summary-item';
    if (buttonKey === selectedButton) {
      item.classList.add('selected');
    }

    const heading = document.createElement('h3');
    heading.textContent = `Footswitch ${buttonKey}`;
    const press = document.createElement('p');
    press.textContent = `Press: ${formatSectionMessages(buttonConfig.press)}`;
    const release = document.createElement('p');
    release.textContent = `Release: ${formatSectionMessages(buttonConfig.release)}`;
    const toggleText = buttonConfig.toggle.enabled ? 'enabled' : 'disabled';
    const toggleState = typeof buttonConfig.toggle.state === 'boolean' ? ` (${buttonConfig.toggle.state ? 'on' : 'off'})` : '';
    const toggle = document.createElement('p');
    toggle.textContent = `Toggle: ${toggleText}${toggleState}`;

    item.append(heading, press, release, toggle);

    if (buttonConfig.toggle.enabled) {
      const actions = document.createElement('div');
      actions.className = 'summary-actions';
      const pressOn = document.createElement('span');
      pressOn.textContent = `ON: ${formatSectionMessages(buttonConfig.toggle.press_on)}`;
      const pressOff = document.createElement('span');
      pressOff.textContent = `OFF: ${formatSectionMessages(buttonConfig.toggle.press_off)}`;
      actions.append(pressOn, pressOff);
      item.appendChild(actions);
    }

    summaryPanel.appendChild(item);
  });
}

function setSectionEnabled(enabled) {
  const section = getCurrentButtonConfig();
  if (whenSelect.value === 'toggle') {
    section.toggle.enabled = enabled;
    renderConfigSummary();
  }
}

function addMessageToSection() {
  const section = getCurrentSection();
  const msg = buildMessageObject();
  section.messages.push(msg);
  updateMessageList();
  renderConfigSummary();
}

function deleteSelectedMessage() {
  const section = getCurrentSection();
  const selectedIndex = Number(messageList.value);
  if (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= section.messages.length) {
    return;
  }
  section.messages.splice(selectedIndex, 1);
  updateMessageList();
  renderConfigSummary();
}

function refreshCurrentSection() {
  updateSectionControls();
  renderConfigSummary();
}

function ensureToggleStageVisibility() {
  if (whenSelect.value === 'toggle') {
    toggleStageSelect.parentElement.classList.remove('hidden');
  } else {
    toggleStageSelect.parentElement.classList.add('hidden');
  }
}

function updateGuiFromConfig() {
  markActiveButtonTab(selectedButton);
  updateSectionControls();
  renderConfigSummary();
}

function ensureDeviceConfigLoaded() {
  if (!deviceConfig || !deviceConfig.buttons) {
    deviceConfig = createEmptyConfig();
  }
}

function createReader(port) {
  const textDecoder = new TextDecoderStream();
  readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();
  return { reader };
}

async function createWriter(port) {
  const textEncoder = new TextEncoderStream();
  writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
  const writer = textEncoder.writable.getWriter();
  return { writer };
}

function dispatchResponse(line) {
  for (let i = 0; i < responseListeners.length; i += 1) {
    const listener = responseListeners[i];
    try {
      if (listener.predicate(line)) {
        listener.resolve(line);
        responseListeners.splice(i, 1);
        i -= 1;
      }
    } catch (error) {
      console.warn('Response listener error', error);
    }
  }
}

function addResponseListener(predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const listener = { predicate, resolve, reject };
    responseListeners.push(listener);

    const timer = setTimeout(() => {
      const idx = responseListeners.indexOf(listener);
      if (idx >= 0) {
        responseListeners.splice(idx, 1);
      }
      reject(new Error('Response timeout'));
    }, timeout);

    listener.resolve = (line) => {
      clearTimeout(timer);
      resolve(line);
    };
  });
}

async function readLoop() {
  keepReading = true;
  let buffer = '';

  while (keepReading && reader) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer += value;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            log(`RX: ${line}`);
            dispatchResponse(line);
          }
        }
      }
    } catch (error) {
      log(`Read error: ${error}`);
      break;
    }
  }
}

async function connect() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    const readerData = createReader(port);
    reader = readerData.reader;
    const writerData = await createWriter(port);
    writer = writerData.writer;

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    loadBtn.disabled = false;
    programBtn.disabled = false;
    addMessageBtn.disabled = false;
    updateStatus('Connected');
    log('Connected to device.');
    readLoop();
  } catch (error) {
    updateStatus('Connection failed', true);
    log(`Connect failed: ${error}`);
  }
}

async function disconnect() {
  keepReading = false;
  responseListeners.forEach((listener) => listener.reject(new Error('Disconnected')));
  responseListeners = [];

  if (reader) {
    try {
      await reader.cancel();
    } catch (error) {
      console.warn(error);
    }
    try {
      reader.releaseLock();
    } catch (error) {
      console.warn(error);
    }
    reader = null;
  }

  if (writer) {
    try {
      await writer.close();
    } catch (error) {
      console.warn(error);
    }
    try {
      writer.releaseLock();
    } catch (error) {
      console.warn(error);
    }
    writer = null;
  }

  if (readableStreamClosed) {
    try {
      await readableStreamClosed.catch(() => {});
    } catch (error) {
      console.warn(error);
    }
    readableStreamClosed = null;
  }

  if (writableStreamClosed) {
    try {
      await writableStreamClosed.catch(() => {});
    } catch (error) {
      console.warn(error);
    }
    writableStreamClosed = null;
  }

  if (port) {
    try {
      await port.close();
    } catch (error) {
      console.warn(error);
    }
    port = null;
  }
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  loadBtn.disabled = true;
  programBtn.disabled = true;
  addMessageBtn.disabled = true;
  updateStatus('Disconnected');
  log('Disconnected.');
}

async function sendPayload(payload) {
  if (!writer) {
    throw new Error('No serial writer available');
  }

  const line = JSON.stringify(payload) + '\n';
  try {
    await writer.write(line);
    log(`TX: ${line.trim()}`);
  } catch (error) {
    throw new Error(`Write failed: ${error}`);
  }
}

async function sendJsonCommand(payload, expectJson = false) {
  let responsePromise = null;
  if (expectJson) {
    responsePromise = addResponseListener((raw) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          JSON.parse(trimmed);
          return true;
        } catch (error) {
          return false;
        }
      }
      return false;
    }, 5000);
  }

  await sendPayload(payload);
  if (!expectJson) {
    return null;
  }

  const line = await responsePromise;
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error}`);
  }
}

async function requestDump() {
  try {
    const config = await sendJsonCommand({ action: 'dump' }, true);
    deviceConfig = normalizeConfig(config);
    updateConfigStatus('loaded');
    log('Device configuration loaded.');
    log(JSON.stringify(config, null, 2));
    updateGuiFromConfig();
  } catch (error) {
    log(`Dump request failed: ${error}`);
  }
}

function buildProgramPayloads() {
  const payloads = [];
  for (let button = 1; button <= 6; button += 1) {
    const buttonKey = String(button);
    const buttonConfig = deviceConfig.buttons[buttonKey] || {
      press: [],
      release: [],
      toggle: { enabled: false, press_on: [], press_off: [] },
    };

    if (buttonConfig.press.length > 0) {
      payloads.push({
        label: `button ${button} press`,
        payload: { action: 'set', button, when: 'press', messages: buttonConfig.press },
      });
    } else {
      payloads.push({
        label: `button ${button} press`,
        payload: { action: 'clear', button, when: 'press' },
      });
    }

    if (buttonConfig.release.length > 0) {
      payloads.push({
        label: `button ${button} release`,
        payload: { action: 'set', button, when: 'release', messages: buttonConfig.release },
      });
    } else {
      payloads.push({
        label: `button ${button} release`,
        payload: { action: 'clear', button, when: 'release' },
      });
    }

    const shouldSetToggle = buttonConfig.toggle.enabled || buttonConfig.toggle.press_on.length > 0 || buttonConfig.toggle.press_off.length > 0;
    if (shouldSetToggle) {
      const togglePayload = { action: 'set', button, when: 'toggle', enabled: buttonConfig.toggle.enabled };
      if (buttonConfig.toggle.press_on.length > 0) {
        togglePayload.messages_on = buttonConfig.toggle.press_on;
      }
      if (buttonConfig.toggle.press_off.length > 0) {
        togglePayload.messages_off = buttonConfig.toggle.press_off;
      }
      payloads.push({ label: `button ${button} toggle`, payload: togglePayload });
    } else {
      payloads.push({
        label: `button ${button} toggle`,
        payload: { action: 'clear', button, when: 'toggle' },
      });
    }
  }
  return payloads;
}

async function programDevice() {
  try {
    const payloads = buildProgramPayloads();
    updateStatus('Programming...');
    log('Programming started.');
    for (const { label, payload } of payloads) {
      log(`TX ${label}: ${JSON.stringify(payload)}`);
      await sendPayload(payload);
      const response = await addResponseListener((raw) => raw.trim().length > 0, 5000);
      log(`RX ${label}: ${response}`);
    }
    updateStatus('Programming complete');
    log('Programming completed.');
  } catch (error) {
    updateStatus('Programming failed', true);
    log(`Programming error: ${error}`);
  }
}

function updateFieldsVisibility() {
  const type = messageType.value;
  ccFields.classList.toggle('hidden', type !== 'cc');
  noteFields.classList.toggle('hidden', type !== 'noteOn' && type !== 'noteOff');
  pcFields.classList.toggle('hidden', type !== 'pc');
}

connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
loadBtn.addEventListener('click', requestDump);
programBtn.addEventListener('click', programDevice);
addMessageBtn.addEventListener('click', () => {
  try {
    addMessageToSection();
  } catch (error) {
    updateStatus('Add message failed', true);
    log(error.message);
  }
});
deleteMessageBtn.addEventListener('click', deleteSelectedMessage);
messageType.addEventListener('change', updateFieldsVisibility);
whenSelect.addEventListener('change', () => {
  refreshCurrentSection();
});
toggleStageSelect.addEventListener('change', () => {
  refreshCurrentSection();
});
buttonTabs.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-button]');
  if (!button) {
    return;
  }
  setSelectedButton(button.dataset.button);
});

toggleEnabled.addEventListener('change', () => {
  setSectionEnabled(toggleEnabled.checked);
});
messageList.addEventListener('change', () => {
  selectedMessageIndex = Number(messageList.value);
});

window.addEventListener('beforeunload', async () => {
  if (port) {
    await disconnect();
  }
});

updateFieldsVisibility();
updateSectionControls();
renderConfigSummary();
