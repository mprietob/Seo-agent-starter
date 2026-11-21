import { Fault } from '../gabi/service.js';
import { projectZeroRankPrompts } from './zerorank-content.js';
export interface PromptReader { read(key: string, resource: 'prompts'): Promise<unknown>; }
export interface ClinicZeroRankStatus { state: 'not_configured' | 'wrong_workspace' | 'ready'; prompts: number; }
// A workspace is accepted only when its monitored prompts contain a configured
// clinic marker. This prevents a valid key for another site polluting the panel.
export async function clinicZeroRankStatus(reader: PromptReader, key: string | undefined, siteId: string, markers: string[], capturedAt: string): Promise<ClinicZeroRankStatus> {
  if (!key) return { state: 'not_configured', prompts: 0 };
  if (!markers.length || markers.some(marker => !marker.trim())) throw new Fault('invalid_upstream_response');
  const rows = projectZeroRankPrompts(siteId, await reader.read(key, 'prompts'), capturedAt);
  const normalized = markers.map(marker => marker.toLocaleLowerCase('es-ES'));
  const matched = rows.filter(row => normalized.some(marker => row.prompt.toLocaleLowerCase('es-ES').includes(marker)));
  return matched.length ? { state: 'ready', prompts: matched.length } : { state: 'wrong_workspace', prompts: 0 };
}
