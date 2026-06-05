const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusEl = document.getElementById('status');
const logOutput = document.getElementById('logOutput');
const sendPayloadBtn = document.getElementById('sendPayloadBtn');
const dumpBtn = document.getElementById('dumpBtn');
const messageType = document.getElementById('messageType');
const ccFields = document.getElementById('ccFields');
const noteFields = document.getElementById('noteFields');
const pcFields = document.getElementById('pcFields');
const buttonSelect = document.getElementById('buttonSelect');
const whenSelect = document.getElementById('whenSelect');
const channelInput = document.getElementById('channelInput');
const controllerInput = document.getElementById('controllerInput');
const valueInput = document.getElementById('valueInput');
const noteInput = document.getElementById('noteInput');
const velocityInput = document.getElementById('velocityInput');
const programInput = document.getElementById('programInput');

let port = null;
let writer = null;
let reader = null;
let keepReading = false;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logOutput.textContent += `[${timestamp}] ${message}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function updateStatus(text, isError = false) {
  statusEl.textContent = `Status: ${text}`;
  statusEl.style.color = isError ? '#f87171' : '#7dd3fc';
}

function formatMessagePayload() {
  const payload = {
    action: 'set',
    button: Number(buttonSelect.value),
    when: whenSelect.value,
  };

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

  if (payload.when === 'toggle') {
    payload.enabled = true;
    payload.messages_on = [msg];
    payload.messages_off = [];
  } else {
    payload.messages = [msg];
  }

  return payload;
}

function createReader(port) {
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();
  return { reader, readableStreamClosed };
}

async function createWriter(port) {
  const textEncoder = new TextEncoderStream();
  const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
  const writer = textEncoder.writable.getWriter();
  return { writer, writableStreamClosed };
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
    sendPayloadBtn.disabled = false;
    dumpBtn.disabled = false;
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
  if (reader) {
    try {
      await reader.cancel();
    } catch (error) {
      console.warn(error);
    }
    reader.releaseLock();
    reader = null;
  }
  if (writer) {
    try {
      await writer.close();
    } catch (error) {
      console.warn(error);
    }
    writer.releaseLock();
    writer = null;
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
  sendPayloadBtn.disabled = true;
  dumpBtn.disabled = true;
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

async function requestDump() {
  try {
    await sendPayload({ action: 'dump' });
  } catch (error) {
    log(`Dump request failed: ${error}`);
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
sendPayloadBtn.addEventListener('click', async () => {
  try {
    const payload = formatMessagePayload();
    await sendPayload(payload);
  } catch (error) {
    updateStatus('Send failed', true);
    log(error.message);
  }
});
dumpBtn.addEventListener('click', requestDump);
messageType.addEventListener('change', updateFieldsVisibility);

window.addEventListener('beforeunload', async () => {
  if (port) {
    await disconnect();
  }
});

updateFieldsVisibility();
