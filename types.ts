
export interface Person {
  key: string; // The raw QR data (KEY_MAESTRA)
  nombre: string;
  apellido: string;
  cedula: string;
  area: string;
  cargo: string; // Added field
}

export type ShiftType = 'INICIO' | 'FIN';

export interface ShiftRecord {
  id: string;
  personKey: string;
  timestamp: number;
  type: ShiftType;
  dateStr: string; // YYYY-MM-DD for grouping
}

export interface AppState {
  personnel: Person[];
  shifts: ShiftRecord[];
  installDate: number;
  isActivated: boolean;
}

export enum View {
  DASHBOARD = 'dashboard',
  PERSONNEL = 'personnel',
  REPORTS = 'reports',
  SETTINGS = 'settings',
  ENROLLMENT = 'enrollment',
  SHIFT_ACTION = 'shift_action',
  EDIT_PERSON = 'edit_person',
  CONFLICT = 'conflict'
}
