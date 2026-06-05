
import { AppState, Person, ShiftRecord, DaySchedule, BackupConfig, InventoryItem, DeliveryRecord } from '../types';
import { STORAGE_KEY } from '../constants';

const defaultScheduleConfig: Record<number, DaySchedule> = {
  0: { start: '08:00', end: '15:00', active: true },
  1: { start: '08:00', end: '15:00', active: true },
  2: { start: '08:00', end: '15:00', active: true },
  3: { start: '08:00', end: '15:00', active: true },
  4: { start: '08:00', end: '15:00', active: true },
  5: { start: '08:00', end: '15:00', active: true },
  6: { start: '08:00', end: '15:00', active: true },
};

const defaultBackupConfig: BackupConfig = {
  active: false,
  email: '',
  prefix: 'CTP'
};

const initialState: AppState = {
  personnel: [],
  shifts: [],
  inventory: [],
  deliveries: [],
  absences: [],
  installDate: Date.now(),
  isActivated: false,
  scheduleConfig: defaultScheduleConfig,
  backupConfig: defaultBackupConfig
};

export const loadState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialState;
  try {
    const parsed = JSON.parse(stored);
    // Asegurar que las listas existan para evitar errores de renderizado
    return {
      ...initialState,
      ...parsed,
      personnel: parsed.personnel || [],
      shifts: parsed.shifts || [],
      inventory: parsed.inventory || [],
      deliveries: parsed.deliveries || [],
      absences: parsed.absences || [],
      scheduleConfig: parsed.scheduleConfig || defaultScheduleConfig,
      backupConfig: parsed.backupConfig || defaultBackupConfig
    };
  } catch (e) {
    return initialState;
  }
};

export const saveState = (state: AppState) => {
  // Guardado inmediato en localStorage para evitar pérdida de datos por cierre inesperado
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

/**
 * Escapa campos para CSV (envuelve en comillas si contienen comas o comillas)
 */
export const escapeCsvField = (field: any = '') => {
  const f = String(field || '').replace(/"/g, '""');
  return `"${f}"`;
};

/**
 * Comparte o descarga un archivo basado en las capacidades del navegador
 * Optimizado para Android WebView y navegadores móviles.
 */
export const shareFile = async (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });

  // Intento de uso de Web Share API (Ideal para Android/iOS)
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: fileName,
        text: 'Base de datos CTP Personal'
      });
      return;
    } catch (err) {
      console.warn('Compartir falló, usando descarga estándar', err);
    }
  }

  // Fallback a descarga estándar para navegadores que no soportan share
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
