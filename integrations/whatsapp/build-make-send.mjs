import { readFile, writeFile } from 'node:fs/promises';

// Feed this script a blueprint exported from the configured development scenario.
// Connection references are preserved; credential values are never read or written.
const [referencePath, outputPath] = process.argv.slice(2);
if (!referencePath || !outputPath) {
  throw new Error('Usage: node build-make-send.mjs <reference.blueprint.json> <output.blueprint.json>');
}
const reference = JSON.parse(await readFile(referencePath, 'utf8'));
const templates = JSON.parse(await readFile(new URL('./templates.events-v2.json', import.meta.url), 'utf8'));
const copy = value => structuredClone(value);
const flatten = flow => flow.flatMap(module => [module, ...flatten(module.onerror || []), ...(module.routes || []).flatMap(route => flatten(route.flow))]);
const modules = flatten(reference.flow);
const hook = copy(modules.find(module => module.module === 'gateway:CustomWebHook'));
const claim = copy(modules.find(module => module.module === 'http:MakeRequest' && module.mapper.url.endsWith('/claim')));
const sendReference = modules.find(module => module.module === 'whatsapp-business-cloud:sendTemplateMessage');
const callbackReference = modules.find(module => module.module === 'http:MakeRequest' && module.mapper.url.endsWith('/events'));
if (!hook || !claim || !sendReference || !callbackReference) throw new Error('Reference requires webhook, claim, template send and events callback');
const origin = new URL(claim.mapper.url).origin;
if (new URL(callbackReference.mapper.url).origin !== origin || !origin.endsWith('.convex.site')) throw new Error('Claim and callback must use the same Convex HTTP origin');
for (const module of [claim, callbackReference]) {
  if (module.parameters.authenticationType !== 'apiKeyConnection' || !module.parameters.apiKeyAccount) throw new Error('A saved, scoped HTTP connection is required');
  if (module.mapper.headers?.length) throw new Error('Remove inline headers; credentials belong in the scoped connection');
}
if (templates.length !== 5 || new Set(templates.map(template => template.name)).size !== 5) throw new Error('Exactly five distinct templates are required');
for (const template of templates) {
  const body = template.components.find(component => component.type === 'BODY')?.text || '';
  if (template.language !== 'es_MX' || template.category !== 'UTILITY' || [...body.matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1]).join(',') !== '1,2,3,4,5,6,7,8,9' || template.components.some(component => component.type === 'BUTTONS')) throw new Error(`Invalid template contract: ${template.name}`);
}
let nextId = 10;
const allocate = () => nextId++;
const design = (x, y, name) => ({ designer: { x, y, name } });
// Make resolves {{...}} before parsing JSON. Quotes inside IML functions must
// stay literal; JSON escaping those quotes changes the function arguments.
const makeJson = value => JSON.stringify(value).replace(/\{\{[\s\S]*?\}\}/g, expression => expression.replace(/\\"/g, '"'));
const ignore = (x, y) => ({ id: allocate(), module: 'builtin:Ignore', version: 1, parameters: {}, mapper: {}, metadata: design(x, y, 'Terminar sin reenviar') });
const condition = (name, rules) => ({ name, conditions: [rules] });
const baseEvent = {
  sender_id: `{{${claim.id}.data.sender_id}}`,
  delivery_id: `{{${claim.id}.data.delivery_id}}`,
  attempt_token: `{{${claim.id}.data.attempt_token}}`,
};
function callback(payload, x, y, name, retries = 2) {
  const module = copy(callbackReference);
  module.id = allocate();
  delete module.filter;
  delete module.onerror;
  module.mapper.jsonStringBodyContent = makeJson({ ...baseEvent, ...payload });
  module.mapper.allowRedirects = false;
  module.metadata = { ...module.metadata, ...design(x, y, name) };
  delete module.metadata.setupValidation;
  // A failure retries this same callback only. It never re-enters WhatsApp.
  module.onerror = retries ? [callback(payload, x + 300, y + 110, `${name} · Reintento`, retries - 1), ignore(x + 600, y + 110)] : undefined;
  return module;
}
const unknown = { kind: 'error', outcome: 'unknown', retryable: false, error: 'No se pudo confirmar la aceptación del mensaje en WhatsApp' };
claim.mapper.allowRedirects = false;
delete claim.metadata.setupValidation;
hook.metadata.designer = { x: 0, y: 600, name: 'Entrada protegida · Solo delivery_id' };
claim.metadata.designer = { x: 300, y: 600, name: 'Reclamar una vez y revalidar acceso' };
const router = { id: 7, module: 'builtin:BasicRouter', version: 1, mapper: null, metadata: design(600, 600, 'Seleccionar plantilla autorizada'), filter: condition('Entrega autorizada', [{ a: `{{${claim.id}.data.send}}`, o: 'boolean:istrue' }]), routes: [] };
for (const [index, template] of templates.entries()) {
  const y = index * 500;
  const send = copy(sendReference);
  send.id = allocate();
  send.filter = condition(template.name, [{ a: `{{${claim.id}.data.template}}`, o: 'text:equal', b: template.name }]);
  send.mapper.messageTemplate = `${template.name}::${template.language}`;
  const bodyText = template.components.find(component => component.type === 'BODY').text;
  const hiddenName = Object.keys(send.mapper.body).find(name => name.startsWith('inputtext-'));
  if (!hiddenName) throw new Error('Reference requires a text template body');
  const hiddenText = bodyText.replace(/\{\{(\d+)\}\}/g, '{{{{$1}}}}');
  const fields = Array.from({ length: 9 }, (_, parameter) => ({ name: `body_${parameter}`, type: 'text', label: `{{${parameter + 1}}}`, required: true }));
  send.mapper.body = Object.fromEntries(fields.map((field, parameter) => [field.name, `{{get(${claim.id}.data.formatted_parameters; ${parameter + 1})}}`]));
  send.mapper.body[hiddenName] = hiddenText;
  delete send.mapper.buttons;
  send.metadata.designer = { x: 900, y, name: template.name };
  delete send.metadata.setupValidation;
  const bodySpec = { name: 'body', type: 'collection', label: 'Body', spec: [{ name: hiddenName, type: 'hidden', label: 'Text Template' }, ...fields] };
  send.metadata.expect = send.metadata.expect.filter(field => !['body', 'buttons'].includes(field.name));
  send.metadata.expect.push(bodySpec);
  send.metadata.restore.expect.messageTemplate = {
    label: `${template.name} (${template.language})`,
    nested: [{ ...bodySpec, spec: [{ type: 'html', label: `<pre>${bodyText}</pre>` }, { name: hiddenName, type: 'hidden', label: 'Text Template', default: hiddenText }, ...fields] }],
  };
  send.onerror = [callback(unknown, 1200, y + 170, 'Resultado incierto · Requiere revisión'), ignore(1500, y + 170)];
  const messageId = `{{get(${send.id}.messages; "1.id")}}`;
  const accepted = callback({ kind: 'accepted', provider_message_id: messageId }, 1500, y - 70, 'Registrar ID aceptado');
  accepted.filter = condition('WhatsApp devolvió ID', [{ a: messageId, o: 'exist' }, { a: messageId, o: 'text:notequal', b: '' }]);
  const noId = callback(unknown, 1500, y + 70, 'Respuesta sin ID · Requiere revisión');
  noId.filter = { name: 'Falta ID del proveedor', conditions: [[{ a: messageId, o: 'notexist' }], [{ a: messageId, o: 'text:equal', b: '' }]] };
  const resultRouter = { id: allocate(), module: 'builtin:BasicRouter', version: 1, mapper: null, metadata: design(1200, y - 70, 'Validar aceptación'), routes: [{ flow: [accepted] }, { flow: [noId] }] };
  router.routes.push({ flow: [send, resultRouter] });
}
const result = {
  name: reference.name,
  flow: [hook, claim, router],
  metadata: copy(reference.metadata),
};
result.metadata.designer = { orphans: [] };
result.metadata.scenario.dlq = false;
result.metadata.scenario.roundtrips = 1;
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(`Prepared ${templates.length} template branches; ${flatten(result.flow).length} modules; no credential values included.`);
