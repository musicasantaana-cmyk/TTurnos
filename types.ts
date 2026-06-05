
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

export interface DaySchedule {
  start: string;
  end: string;
  active: boolean;
}

export interface BackupConfig {
  active: boolean;
  email: string;
  prefix: string;
}

export interface InventoryItem {
  id: string; // The item name or a slug
  name: string;
  quantity: number;
}

export interface DeliveryRecord {
  id: string;
  timestamp: number;
  personKey: string;
  itemName: string;
  quantity: number;
}

export interface AbsenceRecord {
  id: string;
  personKey: string;
  dateStr: string;
  reason: string;
}

export interface AppState {
  personnel: Person[];
  shifts: ShiftRecord[];
  inventory: InventoryItem[];
  deliveries: DeliveryRecord[];
  absences: AbsenceRecord[];
  installDate: number;
  isActivated: boolean;
  scheduleConfig: Record<number, DaySchedule>;
  backupConfig: BackupConfig;
}

export enum View {
  DASHBOARD = 'dashboard',
  PERSONNEL = 'personnel',
  REPORTS = 'reports',
  REPORTS_ATTENDANCE = 'reports_attendance',
  REPORTS_GENERAL = 'reports_general',
  REPORTS_SHIFT = 'reports_shift',
  SETTINGS = 'settings',
  ENROLLMENT = 'enrollment',
  SHIFT_ACTION = 'shift_action',
  EDIT_PERSON = 'edit_person',
  CONFLICT = 'conflict',
  INDICATORS = 'indicators',
  INDICATORS_SETTINGS = 'indicators_settings',
  BACKUP_SETTINGS = 'backup_settings',
  SUPPLIES = 'supplies',
  NEW_SUPPLY = 'new_supply',
  DELIVER_SUPPLY = 'deliver_supply'
}
