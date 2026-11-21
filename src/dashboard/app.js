const byId = id => document.getElementById(id);
const select = byId('site-select'), content = byId('content'), notice = byId('notice');
const detail = byId('evidence-detail'), initialDetail = detail.firstElementChild.cloneNode(true);
let generation = 0, controller = new AbortController(), evidenceController = new AbortController();
const messages = {
  unauthenticated: 'Tu acceso de demostración ha terminado. Abre el sitio de nuevo.',
  not_found_or_forbidden: 'Esta información no está disponible para el sitio seleccionado.',
  dependency_unavailable: 'No se han podido consultar los datos. Vuelve a intentarlo en unos momentos.',
  invalid_upstream_response: 'No hemos podido verificar la respuesta. No mostraremos datos incompletos.',
  invalid_request: 'No se ha podido completar la consulta. Prueba a abrir el sitio de nuevo.'
};
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function showNotice(text, error = false) {
  notice.textContent = text; notice.className = error ? 'notice error' : 'notice'; notice.hidden = !text;
}
function busy(value) {
  select.disabled = value; byId('refresh').disabled = value; byId('open-site').disabled = value;
  byId('logout').disabled = value; byId('main').setAttribute('aria-busy', String(value));
}
function clear() {
  content.hidden = true; byId('idea-list').replaceChildren(); detail.replaceChildren(initialDetail.cloneNode(true));
  byId('site-name').textContent = ''; byId('site-domain').textContent = ''; byId('idea-count').textContent = '—';
  byId('checked-at').textContent = ''; evidenceController.abort();
}
async function json(path, body, signal = controller.signal) {
  let response;
  try { response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  }); } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('No se ha podido contactar con el servidor local. Comprueba que siga en marcha y vuelve a intentarlo.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('No hemos podido interpretar la respuesta. Vuelve a abrir el sitio.'); }
  if (!response.ok) throw new Error(messages[result.code] ?? 'No se ha podido abrir la vista. Comprueba que el servidor local siga en marcha.');
  return result;
}
function read(operation, payload = {}, signal) {
  return json('/dashboard/read', { record_type: 'Command', schema_version: '1.0.0', request_id: crypto.randomUUID(), operation, payload }, signal);
}
function date(value) {
  if (!value) return 'Sin fecha de observación';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
async function openEvidence(id) {
  const current = generation;
  evidenceController.abort(); evidenceController = new AbortController();
  const evidenceSignal = evidenceController.signal;
  detail.replaceChildren(node('p', 'Consultando la evidencia…', 'empty-list'));
  try {
    const evidence = await read('evidence.read', { evidence_id: id }, AbortSignal.any([controller.signal, evidenceSignal]));
    if (current !== generation || evidenceSignal.aborted) return;
    const container = node('div', undefined, 'evidence-content');
    container.append(node('p', evidence.summary));
    const facts = node('dl', undefined, 'evidence-facts');
    const source = { synthetic: 'Datos de ejemplo', dispatchseo: 'DispatchSEO', gsc: 'Search Console', github: 'GitHub' }[evidence.source] ?? 'Fuente no indicada';
    const freshness = { unknown: 'No confirmada', fresh: 'Vigente según su fuente', stale: 'Necesita actualización' }[evidence.freshness] ?? 'No confirmada';
    const classification = { observation: 'Observación', inference: 'Interpretación', recommendation: 'Recomendación' }[evidence.classification] ?? 'Sin clasificar';
    for (const [label, value] of [['FUENTE', source], ['TIPO DE INFORMACIÓN', classification], ['FRESCURA', freshness], ['OBSERVACIÓN', date(evidence.observed_at)], ['CAPTURA REGISTRADA', date(evidence.captured_at)]]) {
      const fact = node('div'); fact.append(node('dt', label), node('dd', value)); facts.append(fact);
    }
    container.append(facts); detail.replaceChildren(container);
    byId('evidence').scrollIntoView({ block: 'nearest' });
  } catch (error) {
    if (current !== generation || evidenceSignal.aborted || controller.signal.aborted) return;
    detail.replaceChildren(node('p', error.message || 'No se ha podido leer la evidencia.', 'empty-list'));
  }
}
function renderIdeas(ideas) {
  const list = byId('idea-list'); list.replaceChildren();
  if (!ideas.length) { list.append(node('p', 'No hay ideas pendientes en esta consulta. Puedes actualizar para volver a comprobarlo.', 'empty-list')); return; }
  for (const idea of ideas) {
    const article = node('article', undefined, 'idea');
    const type = { guide: 'Guía', tool: 'Herramienta', backlink: 'Enlaces', update: 'Actualización' }[idea.type] ?? 'Idea';
    article.append(node('span', `${type} · Pendiente de revisión`, 'idea-meta'), node('h3', idea.title), node('p', idea.rationale));
    if (!idea.evidence_refs.length) article.append(node('span', 'Esta idea todavía no tiene evidencia vinculada.', 'muted-note'));
    idea.evidence_refs.forEach((id, index) => {
      const button = node('button', idea.evidence_refs.length === 1 ? 'Ver evidencia →' : `Ver evidencia ${index + 1} →`, 'evidence-button');
      button.type = 'button'; button.addEventListener('click', () => openEvidence(id)); article.append(button);
    });
    list.append(article);
  }
}
async function load(newSession) {
  generation++; const current = generation; controller.abort(); controller = new AbortController();
  clear(); busy(true); showNotice('Consultando el sitio…'); byId('open-site').hidden = true;
  try {
    if (newSession) await json('/dashboard/session', { site: select.value });
    const [site, ideas] = await Promise.all([read('site.read'), read('ideas.list', { status: 'pending', limit: 100 })]);
    if (current !== generation) return;
    byId('site-name').textContent = site.name; byId('site-domain').textContent = site.domain;
    byId('site-status').textContent = site.status === 'active' ? 'Sitio activo' : 'Sitio suspendido';
    byId('idea-count').textContent = String(ideas.length); renderIdeas(ideas);
    byId('checked-at').textContent = `Última lectura · ${new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
    content.hidden = false; byId('logout').hidden = false; showNotice('');
  } catch (error) {
    if (current !== generation || controller.signal.aborted) return;
    clear(); showNotice(error.message || 'No se han podido cargar los datos.', true); byId('open-site').hidden = false;
  } finally { if (current === generation) busy(false); }
}
select.addEventListener('change', () => load(true));
byId('refresh').addEventListener('click', () => load(false));
byId('open-site').addEventListener('click', () => load(true));
byId('logout').addEventListener('click', async () => {
  generation++; controller.abort(); controller = new AbortController(); clear(); busy(true);
  let closed = false;
  try { await json('/dashboard/logout', {}); closed = true; showNotice('Vista cerrada. Puedes volver a abrir un sitio de ejemplo.'); }
  catch { showNotice('No se ha podido cerrar el acceso en el servidor. Reintenta cerrar la vista.', true); }
  finally { busy(false); byId('logout').hidden = closed; byId('refresh').disabled = true; byId('open-site').hidden = false; }
});
(async () => {
  try {
    const config = await json('/dashboard/config');
    if (config.mode !== 'synthetic' || !config.sites.length) throw new Error('La demostración no está disponible.');
    select.replaceChildren(...config.sites.map(site => { const option = node('option', site.label); option.value = site.key; return option; }));
    await load(true);
  } catch (error) { showNotice(error.message || 'No se ha podido abrir la demostración.', true); }
})();
