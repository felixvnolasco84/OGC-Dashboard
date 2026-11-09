import { readFile, writeFile } from 'node:fs/promises';

const [watchPath, sendPath, outputPath, senderId, accountId] = process.argv.slice(2);
if (!watchPath || !sendPath || !outputPath || !/^\d+$/.test(senderId || '') || !/^\d+$/.test(accountId || '')) throw new Error('Usage: node build-make-events.mjs <watch-export.json> <send-export.json> <output.json> <phone-number-id> <waba-id>');
const reference = JSON.parse(await readFile(watchPath, 'utf8'));
const sendReference = JSON.parse(await readFile(sendPath, 'utf8'));
const flatten = flow => flow.flatMap(module => [module, ...flatten(module.onerror || []), ...(module.routes || []).flatMap(route => flatten(route.flow))]);
const callbackReference = flatten(sendReference.flow).find(module => module.module === 'http:MakeRequest' && module.mapper.url.endsWith('/events'));
const watch = structuredClone(reference.flow.find(module => module.module === 'whatsapp-business-cloud:watchEvents2'));
const iteratorReference = reference.flow.find(module => module.module === 'builtin:BasicFeeder');
if (!watch || !iteratorReference || !callbackReference || callbackReference.parameters.authenticationType !== 'apiKeyConnection' || callbackReference.mapper.headers?.length) throw new Error('Reference requires native Watch Events, Iterator and a saved HTTP connection');
let nextId = 10;
const design = (x, y, name) => ({ designer: { x, y, name } });
const ignore = (x, y) => ({ id: nextId++, module: 'builtin:Ignore', version: 1, parameters: {}, mapper: {}, metadata: design(x, y, 'Terminar callback') });
function callback(body, x, y, name, retries = 2) {
  const module = structuredClone(callbackReference);
  module.id = nextId++;
  delete module.filter;
  delete module.onerror;
  delete module.metadata.setupValidation;
  module.mapper.allowRedirects = false;
  module.mapper.jsonStringBodyContent = body;
  module.metadata = { ...module.metadata, ...design(x, y, name) };
  if (retries) module.onerror = [callback(body, x + 300, y + 100, `${name} · Reintento`, retries - 1), ignore(x + 600, y + 100)];
  return module;
}
function iterator(id, array, y) {
  const module = structuredClone(iteratorReference);
  module.id = id;
  module.mapper.array = `{{ifempty(${watch.id}.${array}; emptyarray)}}`;
  module.metadata = { ...module.metadata, ...design(600, y, `Recorrer todos: ${array}`) };
  delete module.metadata.setupValidation;
  module.metadata.interface = watch.metadata.interface.find(field => field.name === array).spec.spec;
  return module;
}
function eventBody(payload, iteratorId) {
  return JSON.stringify({ ...payload, sender_id: `{{${watch.id}.metadata.phone_number_id}}`, occurred_at: '__EPOCH_MS__' })
    .replace(/\{\{[\s\S]*?\}\}/g, expression => expression.replace(/\\"/g, '"'))
    .replace('"__EPOCH_MS__"', `{{formatDate(${iteratorId}.timestamp; "x")}}`);
}
const states = iterator(2, 'statuses', 0);
const messages = iterator(3, 'messages', 500);
const statusCallback = callback(eventBody({
  kind: 'status', provider_message_id: '{{2.id}}',
  phone: '+{{replace(2.recipient_id; "/[^0-9]/g"; emptystring)}}', status: '{{2.status}}',
  // Meta can accept a message and then report a billing/eligibility failure.
  // Keep its operational diagnosis, bounded and JSON-escaped, in OGC.
  error: 'Meta {{ifempty(get(2.errors; "1.code"); "sin código")}}: {{escapeJSON(substring(ifempty(get(2.errors; "1.error_data.details"); ifempty(get(2.errors; "1.title"); "Sin detalles del proveedor")); 0; 420))}}',
}, 2), 900, 0, 'Registrar estado idempotente');
statusCallback.filter = { name: 'Estado admitido', conditions: ['sent', 'delivered', 'read', 'failed'].map(status => [{ a: '{{2.status}}', o: 'text:equal', b: status }]) };
const inboundCallback = callback(eventBody({ kind: 'inbound', phone: '+{{replace(3.from; "/[^0-9]/g"; emptystring)}}', text: 'BAJA' }, 3), 900, 500, 'Aplicar baja autorizada por el número');
inboundCallback.filter = { name: 'Solo texto BAJA', conditions: [[{ a: '{{3.type}}', o: 'text:equal', b: 'text' }, { a: '{{upper(trim(3.text.body))}}', o: 'text:equal', b: 'BAJA' }]] };
const router = { id: 4, module: 'builtin:BasicRouter', version: 1, mapper: null, metadata: design(300, 250, 'Estados y solicitudes de baja'), filter: { name: 'Solo cuenta y emisor de OGC', conditions: [[{ a: `{{${watch.id}.metadata.phone_number_id}}`, o: 'text:equal', b: senderId }, { a: `{{${watch.id}.id}}`, o: 'text:equal', b: accountId }]] }, routes: [{ flow: [states, statusCallback] }, { flow: [messages, inboundCallback] }] };
watch.metadata.designer = { x: 0, y: 250, name: 'WhatsApp · Mensajes y estados' };
const result = { name: reference.name, flow: [watch, router], metadata: structuredClone(reference.metadata) };
result.metadata.designer = { orphans: [] };
result.metadata.scenario.dlq = false;
result.metadata.scenario.roundtrips = 1;
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log('Prepared status and BAJA routes; all array items are iterated; timestamps use Unix milliseconds; no credential values included.');
