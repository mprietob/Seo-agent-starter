export type ProjectId = 'clinica-marta-prieto' | 'pinturas-gabriel';
export interface Project { id: ProjectId; name: string; website: string; type: string; locales: string[]; wordpress: boolean; googleProperty: string | null; zeroRankEnv: string; }
export const projects: Record<ProjectId, Project> = {
  'clinica-marta-prieto': { id: 'clinica-marta-prieto', name: 'Clínica Marta Prieto', website: 'https://clinicamartaprieto.com/', type: 'Clínica dermatológica', locales: ['Ferrol', 'Madrid'], wordpress: true, googleProperty: 'https://clinicamartaprieto.com/', zeroRankEnv: 'CLINIC_ZERORANK_API_KEY' },
  'pinturas-gabriel': { id: 'pinturas-gabriel', name: 'Pinturas Gabriel', website: 'https://pinturasgabrielferrol.netlify.app/', type: 'Servicios locales de pintura', locales: ['Ferrol', 'Narón', 'Neda'], wordpress: false, googleProperty: null, zeroRankEnv: 'GABI_ZERORANK_API_KEY' }
};
export function project(id: string | undefined): Project { return projects[id as ProjectId] ?? projects['clinica-marta-prieto']; }
