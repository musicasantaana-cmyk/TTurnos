
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, View, Person, ShiftRecord, ShiftType, InventoryItem, DeliveryRecord } from './types';
import { loadState, saveState, escapeCsvField, shareFile } from './services/storage';
import { TRIAL_DAYS, MS_PER_DAY, MAX_REPORTS_DAYS, ACTIVATION_CODE, MAX_PERSONNEL_LIMIT } from './constants';
import { LicenseGuard } from './components/LicenseGuard';
import { Scanner } from './components/Scanner';
import logoUrl from './src/assets/images/promo_ambiental_logo_1780671403616.png';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const ShiftEditModal: React.FC<{
  context: { personKey: string; dateStr: string };
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onClose: () => void;
}> = ({ context, state, setState, onClose }) => {
  const person = state.personnel.find(p => p.key === context.personKey);
  const dayShifts = state.shifts
    .filter(s => s.personKey === context.personKey && s.dateStr === context.dateStr)
    .sort((a, b) => a.timestamp - b.timestamp);

  const [inTime, setInTime] = useState<string>('');
  const [outTime, setOutTime] = useState<string>('');
  const [inShiftId, setInShiftId] = useState<string | null>(null);
  const [outShiftId, setOutShiftId] = useState<string | null>(null);

  useEffect(() => {
    // Basic pair assumption (first IN, last OUT)
    const inShift = dayShifts.find(s => s.type === 'INICIO');
    const outShift = dayShifts.find(s => s.type === 'FIN');

    if (inShift) {
      setInShiftId(inShift.id);
      const d = new Date(inShift.timestamp);
      setInTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
    if (outShift) {
      setOutShiftId(outShift.id);
      const d = new Date(outShift.timestamp);
      setOutTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
  }, [context]);

  const handleSave = () => {
    setState(prev => {
      let newShifts = [...prev.shifts];
      const selectedDateParts = context.dateStr.split('-');
      const year = parseInt(selectedDateParts[0]);
      const month = parseInt(selectedDateParts[1]) - 1;
      const day = parseInt(selectedDateParts[2]);

      // Handle IN shift
      if (inTime) {
        const [hours, minutes] = inTime.split(':').map(Number);
        const timestamp = new Date(year, month, day, hours, minutes).getTime();
        
        if (inShiftId) {
          // Update existing
          newShifts = newShifts.map(s => s.id === inShiftId ? { ...s, timestamp } : s);
        } else {
          // Create new
          newShifts.push({
            id: Date.now().toString() + "-in",
            personKey: context.personKey,
            type: 'INICIO',
            timestamp,
            dateStr: context.dateStr
          });
        }
      } else if (inShiftId) {
        // Delete if empty
        newShifts = newShifts.filter(s => s.id !== inShiftId);
      }

      // Handle OUT shift
      if (outTime) {
        const [hours, minutes] = outTime.split(':').map(Number);
        const timestamp = new Date(year, month, day, hours, minutes).getTime();
        
        if (outShiftId) {
          // Update existing
          newShifts = newShifts.map(s => s.id === outShiftId ? { ...s, timestamp } : s);
        } else {
          // Create new
          newShifts.push({
            id: Date.now().toString() + "-out",
            personKey: context.personKey,
            type: 'FIN',
            timestamp,
            dateStr: context.dateStr
          });
        }
      } else if (outShiftId) {
        // Delete if empty
        newShifts = newShifts.filter(s => s.id !== outShiftId);
      }

      return { ...prev, shifts: newShifts };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[6000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-black text-gblack text-center mb-1">
          {person ? `${person.nombre} ${person.apellido}` : 'Colaborador'}
        </h3>
        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 text-center mb-6">
          Modificar turno del {context.dateStr}
        </p>
        
        <div className="space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Hora de Entrada (INICIO)</label>
            <input 
              type="time" 
              value={inTime} 
              onChange={(e) => setInTime(e.target.value)}
              className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] uppercase font-black text-orange-500 tracking-widest block">Hora de Salida (FIN)</label>
            <input 
              type="time" 
              value={outTime} 
              onChange={(e) => setOutTime(e.target.value)}
              className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-orange-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onClose}
            className="py-4 text-xs font-black uppercase text-slate-500 hover:text-slate-800 tracking-widest"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            className="bg-ggreen text-white font-black py-4 rounded-xl shadow-lg shadow-ggreen/20 active:scale-95 transition-all text-xs tracking-widest uppercase"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// Importación dinámica de Capacitor para evitar errores en entorno web puro
const requestNativePermissions = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Camera } = await import('@capacitor/camera');
      const status = await Camera.checkPermissions();
      if (status.camera !== 'granted') {
        await Camera.requestPermissions({ permissions: ['camera'] });
      }
    }
  } catch (e) {
    console.warn("Capacitor no está disponible en este entorno:", e);
  }
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(loadState());
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerContext, setScannerContext] = useState<'shift' | 'supply'>('shift');
  const [pendingScanResult, setPendingScanResult] = useState<string | null>(null);
  const [editingPersonKey, setEditingPersonKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [licenseCodeInput, setLicenseCodeInput] = useState('');
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Shift edit modal state
  const [editingShiftContext, setEditingShiftContext] = useState<{personKey: string, dateStr: string} | null>(null);
  
  // Deletion modal state
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [supplyForm, setSupplyForm] = useState<{name: string, quantity: string}>({name: '', quantity: ''});
  const [deliverForm, setDeliverForm] = useState<{itemName: string, quantity: string, personKey?: string}>({itemName: '', quantity: ''});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [enrollmentForm, setEnrollmentForm] = useState<Partial<Person>>({});
  
  // Indicators form state
  const [indSelectedPerson, setIndSelectedPerson] = useState<string>('');
  const [indStartDate, setIndStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [indEndDate, setIndEndDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Solicitud de permisos nativos al montar la aplicación (Crítico para APK)
  useEffect(() => {
    requestNativePermissions();
  }, []);

  // Persistencia robusta: Se guarda en cada cambio de estado
  useEffect(() => {
    const cutoff = Date.now() - (MAX_REPORTS_DAYS * MS_PER_DAY);
    const filteredShifts = state.shifts.filter(s => s.timestamp > cutoff);
    
    if (filteredShifts.length !== state.shifts.length) {
      const newState = { ...state, shifts: filteredShifts };
      setState(newState);
      saveState(newState);
    } else {
      saveState(state);
    }
  }, [state]);

  // Listener para cierres forzados del sistema operativo (Android/iOS)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveState(state);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', () => saveState(state));
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', () => saveState(state));
    };
  }, [state]);

  const isLicenseExpired = useMemo(() => {
    if (state.isActivated) return false;
    const diff = Date.now() - state.installDate;
    return diff > TRIAL_DAYS * MS_PER_DAY;
  }, [state.isActivated, state.installDate]);

  const daysRemaining = useMemo(() => {
    if (state.isActivated) return null;
    const diff = Date.now() - state.installDate;
    const remaining = TRIAL_DAYS - Math.floor(diff / MS_PER_DAY);
    return remaining > 0 ? remaining : 0;
  }, [state.isActivated, state.installDate]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayShifts = state.shifts.filter(s => s.dateStr === today);
    const registeredKeys = new Set(todayShifts.map(s => s.personKey));
    
    const activeKeys = new Set();
    const statusMap = new Map<string, ShiftType>();
    
    todayShifts.sort((a, b) => a.timestamp - b.timestamp).forEach(s => {
      statusMap.set(s.personKey, s.type);
    });
    statusMap.forEach((status, key) => { if (status === 'INICIO') activeKeys.add(key); });

    return {
      activeCount: activeKeys.size,
      unregisteredCount: state.personnel.length - registeredKeys.size,
      totalCount: state.personnel.length,
      occupancyPercentage: (state.personnel.length / MAX_PERSONNEL_LIMIT) * 100
    };
  }, [state.shifts, state.personnel]);

  const unregisteredInDate = useMemo(() => {
    const shiftsInDate = state.shifts.filter(s => s.dateStr === selectedDate);
    const keysWithActivity = new Set(shiftsInDate.map(s => s.personKey));
    return state.personnel.filter(p => !keysWithActivity.has(p.key));
  }, [state.shifts, state.personnel, selectedDate]);

  const handleActivate = () => {
    setState(prev => ({ ...prev, isActivated: true }));
    setCurrentView(View.DASHBOARD);
  };

  const handleManualActivation = (e: React.FormEvent) => {
    e.preventDefault();
    if (licenseCodeInput === ACTIVATION_CODE) {
      handleActivate();
      setLicenseCodeInput('');
    } else {
      alert("Código de activación incorrecto.");
    }
  };

  const handleScan = (data: string) => {
    setPendingScanResult(data);
    setShowScanner(false);
    
    if (scannerContext === 'supply') {
      const existing = state.personnel.find(p => p.key === data);
      if (existing) {
        setDeliverForm(prev => ({ ...prev, personKey: data }));
        setCurrentView(View.DELIVER_SUPPLY);
      } else {
        alert("Personal no encontrado en la base de datos.");
      }
      return;
    }

    const existing = state.personnel.find(p => p.key === data);
    if (existing) {
      setCurrentView(View.SHIFT_ACTION);
    } else {
      const parts = data.split(',');
      setEnrollmentForm({
        key: data,
        nombre: parts[1] || '',
        apellido: parts[2] || '',
        cedula: parts[3] || parts[0] || '',
        area: '',
        cargo: ''
      });
      setCurrentView(View.ENROLLMENT);
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newPersonnel: Person[] = [];
      let skipped = 0;
      let limitReached = false;

      lines.forEach((line, index) => {
        if (index === 0 || !line.trim() || limitReached) return;
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (matches && matches.length >= 4) {
          const clean = (s: string) => s.replace(/^"|"$/g, '').trim();
          const key = clean(matches[0]);
          if (state.personnel.some(p => p.key === key)) {
            skipped++;
            return;
          }
          if ((state.personnel.length + newPersonnel.length) >= MAX_PERSONNEL_LIMIT) {
            limitReached = true;
            return;
          }
          newPersonnel.push({
            key,
            nombre: clean(matches[1]),
            apellido: clean(matches[2]),
            cedula: clean(matches[3]),
            area: clean(matches[4] || ''),
            cargo: clean(matches[5] || '')
          });
        }
      });

      if (newPersonnel.length > 0) {
        setState(prev => ({ ...prev, personnel: [...prev.personnel, ...newPersonnel] }));
        alert(`Éxito: ${newPersonnel.length} registros importados de Control de turno.`);
      } else if (limitReached) {
        alert(`Error: Se alcanzó el límite de ${MAX_PERSONNEL_LIMIT} usuarios.`);
      } else {
        alert("No se encontraron registros nuevos o el formato es incorrecto.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addShift = (type: ShiftType) => {
    if (!pendingScanResult) return;
    const now = new Date();
    const newShift: ShiftRecord = {
      id: crypto.randomUUID(),
      personKey: pendingScanResult,
      timestamp: now.getTime(),
      type,
      dateStr: now.toISOString().slice(0, 10)
    };
    setState(prev => ({ ...prev, shifts: [...prev.shifts, newShift] }));
    setPendingScanResult(null);
    setCurrentView(View.DASHBOARD);
  };

  const handleEnrollmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPerson = enrollmentForm as Person;
    if (!newPerson.key) return;
    if (state.personnel.length >= MAX_PERSONNEL_LIMIT) {
      alert(`Atención: Ha llegado al límite de ${MAX_PERSONNEL_LIMIT} usuarios.`);
      return;
    }
    if (state.personnel.some(p => p.key === newPerson.key)) {
      setCurrentView(View.CONFLICT);
      return;
    }
    setState(prev => ({ ...prev, personnel: [...prev.personnel, newPerson] }));
    setCurrentView(View.PERSONNEL);
    setPendingScanResult(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = enrollmentForm as Person;
    setState(prev => ({
      ...prev,
      personnel: prev.personnel.map(p => p.key === updated.key ? updated : p)
    }));
    setCurrentView(View.PERSONNEL);
    setEditingPersonKey(null);
  };

  const requestDeletePerson = (person: Person) => {
    setPersonToDelete(person);
    setDeleteReason('');
  };

  const confirmDeletePerson = () => {
    if (!personToDelete) return;
    if (!deleteReason.trim()) {
      alert("Debe ingresar un motivo para eliminar el registro.");
      return;
    }
    
    // Si necesitas guardar el motivo en reportes lo puedes hacer en el setState
    setState(prev => ({ 
      ...prev, 
      personnel: prev.personnel.filter(p => p.key !== personToDelete.key) 
    }));
    
    if (currentView === View.CONFLICT) setCurrentView(View.DASHBOARD);
    setPersonToDelete(null);
    setDeleteReason('');
  };

  const startEditing = (person: Person) => {
    setEnrollmentForm(person);
    setEditingPersonKey(person.key);
    setCurrentView(View.EDIT_PERSON);
  };

  const getShiftPairs = (personKey: string, dateStr: string) => {
    const dayShifts = state.shifts
      .filter(s => s.personKey === personKey && s.dateStr === dateStr)
      .sort((a, b) => a.timestamp - b.timestamp);
    const pairs: { start?: ShiftRecord, end?: ShiftRecord }[] = [];
    let currentPair: { start?: ShiftRecord, end?: ShiftRecord } = {};
    dayShifts.forEach(s => {
      if (s.type === 'INICIO') {
        if (currentPair.start) pairs.push(currentPair);
        currentPair = { start: s };
      } else if (s.type === 'FIN') {
        currentPair.end = s;
        pairs.push(currentPair);
        currentPair = {};
      }
    });
    if (currentPair.start) pairs.push(currentPair);
    return pairs;
  };

  const handleResetApp = () => {
    // Generar archivo maestro de backup
    exportMasterDatabase();

    // Si hay correo configurado, intentar enviar por correo local
    if (state.backupConfig?.email) {
      const prefix = state.backupConfig.prefix || 'CTP';
      const mailtoLink = `mailto:${state.backupConfig.email}?subject=Respaldo Archivo Maestro ${prefix} - ${new Date().toISOString().slice(0, 10)}&body=Por favor adjunta el archivo CSV que acabas de descargar. El sistema se ha reiniciado correctamente.`;
      setTimeout(() => {
        window.location.href = mailtoLink;
      }, 500);
    }

    // Limpiar toda la data de la app guardando config
    setState(prev => ({
      ...prev,
      personnel: [],
      shifts: [],
      absences: [],
      deliveries: [],
      inventory: []
    }));
    setShowResetConfirm(false);
    
    // Mostramos feedback de react en cuanto se pueda o simplemente asume completado
    alert("Aplicación reiniciada a cero correctamente.");
  };

  const exportMasterDatabase = () => {
    let output = "=== PERSONAL ===\nKEY_MAESTRA,NOMBRE,APELLIDO,CEDULA,AREA,CARGO\n";
    output += state.personnel.map(p => 
      `${escapeCsvField(p.key)},${escapeCsvField(p.nombre)},${escapeCsvField(p.apellido)},${escapeCsvField(p.cedula)},${escapeCsvField(p.area)},${escapeCsvField(p.cargo)}`
    ).join('\n');
    
    output += "\n\n=== TURNOS ===\nKEY_MAESTRA,TIPO,FECHA_HORA\n";
    output += state.shifts.map(s =>
      `${escapeCsvField(s.personKey)},${escapeCsvField(s.type)},${escapeCsvField(new Date(s.timestamp).toISOString())}`
    ).join('\n');

    output += "\n\n=== INASISTENCIAS ===\nKEY_MAESTRA,FECHA,MOTIVO\n";
    output += (state.absences || []).map(a =>
      `${escapeCsvField(a.personKey)},${escapeCsvField(a.dateStr)},${escapeCsvField(a.reason)}`
    ).join('\n');

    output += "\n\n=== ENTREGAS INSUMOS ===\nKEY_MAESTRA,INSUMO,CANTIDAD,FECHA_HORA\n";
    output += state.deliveries.map(d =>
      `${escapeCsvField(d.personKey)},${escapeCsvField(d.itemName)},${d.quantity},${escapeCsvField(new Date(d.timestamp).toISOString())}`
    ).join('\n');
    
    const prefix = state.backupConfig?.prefix || 'CTP';
    shareFile(output, `${prefix}_Backup_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  const getAbsenceStats = (dateStr: string) => {
    const nomina = state.personnel.length;
    let operativosCount = 0;
    
    // Contadores por causal
    const counts: Record<string, number> = {};
    absenceReasons.forEach(r => counts[r] = 0);

    state.personnel.forEach(p => {
       const hasInScan = state.shifts.some(s => s.personKey === p.key && s.dateStr === dateStr && s.type === 'INICIO');
       if (hasInScan) {
          operativosCount++;
       } else {
          // Es faltante, buscar justificación
          const savedAbsence = (state.absences || []).find(a => a.personKey === p.key && a.dateStr === dateStr);
          const reason = savedAbsence?.reason || 'AUS - AUSENCIA SIN JUSTIFICAR';
          
          if (counts[reason] !== undefined) {
             counts[reason]++;
          }
       }
    });

    return { nomina, operativosCount, counts };
  };

  const exportDetailedReport = () => {
    let output = "=== REPORTE TURNOS ===\nNOMBRE,APELLIDO,CEDULA,AREA,CARGO,FECHA_INICIO,HORA_INICIO,FECHA_FIN,HORA_FIN,TOTAL_HORAS\n";
    let csvRows: string[] = [];
    state.personnel.forEach(p => {
      const pairs = getShiftPairs(p.key, selectedDate);
      pairs.forEach(pair => {
        const startDate = pair.start ? new Date(pair.start.timestamp).toLocaleDateString() : '-';
        const startTime = pair.start ? new Date(pair.start.timestamp).toLocaleTimeString() : '-';
        const endDate = pair.end ? new Date(pair.end.timestamp).toLocaleDateString() : '-';
        const endTime = pair.end ? new Date(pair.end.timestamp).toLocaleTimeString() : '-';
        const diff = (pair.start && pair.end) ? (pair.end.timestamp - pair.start.timestamp) / (1000 * 60 * 60) : 0;
        csvRows.push(`${escapeCsvField(p.nombre)},${escapeCsvField(p.apellido)},${escapeCsvField(p.cedula)},${escapeCsvField(p.area)},${escapeCsvField(p.cargo)},${startDate},${startTime},${endDate},${endTime},${diff.toFixed(2)}`);
      });
    });
    output += csvRows.join('\n');
    
    output += "\n\n=== REPORTE INASISTENCIAS ===\nNOMBRE,APELLIDO,CEDULA,CARGO,FECHA,MOTIVO\n";
    const absencesRows = (state.absences || []).filter(a => a.dateStr === selectedDate).map(a => {
       const p = state.personnel.find(person => person.key === a.personKey);
       return `${escapeCsvField(p?.nombre || 'Desconocido')},${escapeCsvField(p?.apellido || '')},${escapeCsvField(p?.cedula || '')},${escapeCsvField(p?.cargo || '')},${escapeCsvField(a.dateStr)},${escapeCsvField(a.reason)}`;
    }).join('\n');
    output += absencesRows;

    output += "\n\n=== REPORTE ENTREGAS INSUMOS ===\nNOMBRE,APELLIDO,CEDULA,INSUMO,CANTIDAD,FECHA,HORA\n";
    const deliveriesRows = state.deliveries.map(d => {
       const p = state.personnel.find(person => person.key === d.personKey);
       const dDate = new Date(d.timestamp).toLocaleDateString();
       const dTime = new Date(d.timestamp).toLocaleTimeString();
       return `${escapeCsvField(p?.nombre || 'Desconocido')},${escapeCsvField(p?.apellido || '')},${escapeCsvField(p?.cedula || '')},${escapeCsvField(d.itemName)},${d.quantity},${dDate},${dTime}`;
    }).join('\n');
    
    output += "\n" + deliveriesRows;
    const prefix = state.backupConfig?.prefix || 'CTP';
    shareFile(output, `${prefix}_Report_${selectedDate}.csv`, 'text/csv');
  };

  const renderBottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 bg-gblack border-t border-slate-800 flex justify-around items-center h-20 px-2 z-[100] safe-area-bottom">
      <button onClick={() => setCurrentView(View.DASHBOARD)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${currentView === View.DASHBOARD ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-home text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Inicio</span>
      </button>
      <button onClick={() => setCurrentView(View.PERSONNEL)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${currentView === View.PERSONNEL ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-users-gear text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Personal</span>
      </button>
      <button onClick={() => setCurrentView(View.REPORTS)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${[View.REPORTS, View.REPORTS_ATTENDANCE, View.REPORTS_SHIFT].includes(currentView) ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-file-invoice text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Reportes</span>
      </button>
      <button onClick={() => setCurrentView(View.INDICATORS)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${[View.INDICATORS, View.INDICATORS_SETTINGS].includes(currentView) ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-chart-line text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Indicadores</span>
      </button>
      <button onClick={() => setCurrentView(View.SUPPLIES)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${[View.SUPPLIES, View.NEW_SUPPLY, View.DELIVER_SUPPLY].includes(currentView) ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-box text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Insumos</span>
      </button>
    </nav>
  );

  const renderDashboard = () => (
    <div className="p-6 pb-24 flex flex-col items-center gap-10 animate-in fade-in duration-500">
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-full border-2 border-ggreen flex items-center justify-center bg-ggreen/10">
             <i className="fas fa-broom text-ggreen"></i>
           </div>
           <h1 className="text-xl font-black text-gblack tracking-tight brand-font"><span className="text-ggreen">control</span>turno</h1>
        </div>
        <div className="bg-ggreen px-3 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-sm">PANEL CONTROL</div>
      </div>
      
      <div className="w-full grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden transition-all active:scale-95">
          <div className="absolute top-0 right-0 w-16 h-16 bg-ggreen/10 rounded-bl-3xl -mr-4 -mt-4"></div>
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1 relative z-10">En Turno</span>
          <span className="text-4xl font-black text-gblack relative z-10">{stats.activeCount}</span>
        </div>
        <button 
          onClick={() => { setCurrentView(View.REPORTS); setShowUnregistered(true); }}
          className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden text-left transition-all active:scale-95"
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-3xl -mr-4 -mt-4"></div>
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1 relative z-10">Ausentes</span>
          <span className="text-4xl font-black text-red-500 relative z-10">{stats.unregisteredCount}</span>
        </button>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden col-span-2 lg:col-span-1">
          <div className="absolute top-0 right-0 w-16 h-16 bg-slate-100 rounded-bl-3xl -mr-4 -mt-4"></div>
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1 relative z-10">Total Base</span>
          <span className="text-4xl font-black text-gblack relative z-10">{stats.totalCount}</span>
        </div>
      </div>

      <button
        onClick={() => setShowScanner(true)}
        className="w-72 h-72 rounded-full bg-ggreen hover:opacity-90 text-white shadow-[0_20px_50px_rgba(141,190,63,0.3)] flex flex-col items-center justify-center gap-4 transition-all active:scale-95 border-[12px] border-white group"
      >
        <i className="fas fa-expand text-5xl mb-1 group-hover:scale-110 transition-transform"></i>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-black tracking-tighter uppercase">LECTOR QR</span>
          <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Marcar Registro</span>
        </div>
      </button>

      {daysRemaining !== null && daysRemaining <= 3 && (
        <div className="bg-red-50 p-5 rounded-3xl w-full border border-red-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center">
             <i className="fas fa-shield-halved text-lg"></i>
          </div>
          <p className="text-[10px] text-red-700 font-black uppercase leading-relaxed tracking-tight">
            ALERTA LICENCIA: El periodo de prueba vence en {daysRemaining} días.
          </p>
        </div>
      )}
      
      {!state.isActivated && (
        <button 
          onClick={() => setCurrentView(View.SETTINGS)}
          className="bg-gblack p-5 rounded-3xl w-full border border-slate-800 flex items-center gap-4 shadow-xl active:scale-95 transition-all"
        >
          <div className="w-10 h-10 bg-ggreen rounded-xl flex items-center justify-center text-white">
             <i className="fas fa-key text-sm"></i>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed text-left flex-1">
            VERSIÓN NO ACTIVADA. <span className="text-white underline">PULSE PARA ACTIVAR SU COPIA CTP</span>.
          </p>
          <i className="fas fa-chevron-right text-slate-600"></i>
        </button>
      )}
    </div>
  );

  const renderPersonnel = () => (
    <div className="p-6 pb-24 space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-gblack leading-none mb-3">Base de Personal</h2>
          <div className="flex flex-col gap-1 w-48">
             <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-slate-400">
                <span>Capacidad del Sistema</span>
                <span>{state.personnel.length}/{MAX_PERSONNEL_LIMIT}</span>
             </div>
             <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${stats.occupancyPercentage > 90 ? 'bg-red-500' : 'bg-ggreen'}`} style={{ width: `${stats.occupancyPercentage}%` }}></div>
             </div>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleCsvImport} accept=".csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-white text-ggreen rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 transition-all active:scale-90" title="Importar">
            <i className="fas fa-file-import"></i>
          </button>
          <button onClick={exportMasterDatabase} className="w-12 h-12 bg-ggreen text-white rounded-2xl flex items-center justify-center shadow-lg shadow-ggreen/20 transition-all active:scale-90" title="Exportar">
            <i className="fas fa-share-nodes"></i>
          </button>
        </div>
      </div>
      
      <div className="grid gap-4">
        {state.personnel.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-slate-200">
            <i className="fas fa-users-slash text-slate-200 text-4xl mb-4"></i>
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Sin colaboradores registrados</p>
          </div>
        ) : (
          state.personnel.map(p => (
            <div key={p.key} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-ggreen"></div>
              <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-gblack text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg">
                  {p.nombre[0]}{p.apellido[0]}
                </div>
                <div>
                  <h3 className="font-black text-gblack leading-tight text-lg tracking-tight">{p.nombre} {p.apellido}</h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[9px] font-black text-ggreen bg-ggreen/5 px-2.5 py-1 rounded-lg uppercase border border-ggreen/10">
                      {p.cargo || 'General'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 tracking-tighter">
                      C.C: {p.cedula}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEditing(p)} className="w-11 h-11 rounded-2xl text-slate-300 hover:text-ggreen transition-all active:scale-90">
                  <i className="fas fa-pen text-sm"></i>
                </button>
                <button onClick={() => requestDeletePerson(p)} className="w-11 h-11 rounded-2xl text-slate-200 hover:text-red-500 transition-all active:scale-90">
                  <i className="fas fa-trash-alt text-sm"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderReportsHub = () => (
    <div className="p-6 pb-24 space-y-4 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-black text-gblack mb-1">Módulo Reportes</h2>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">General, Asistencia, Indicadores e Insumos</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
         <button onClick={() => setCurrentView(View.REPORTS_SHIFT)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center text-xl"><i className="fas fa-table-list"></i></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gblack">Reporte de Turno</span>
         </button>
         
         <button onClick={() => setCurrentView(View.REPORTS_ATTENDANCE)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center text-xl"><i className="fas fa-clipboard-user"></i></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gblack">Asistencia Diario</span>
         </button>
         
         <button onClick={() => setCurrentView(View.INDICATORS)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center">
            <div className="w-12 h-12 bg-ggreen/10 text-ggreen rounded-full flex items-center justify-center text-xl"><i className="fas fa-chart-line"></i></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gblack">Indicadores Personal</span>
         </button>
         
         <button onClick={() => setCurrentView(View.SUPPLIES)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 active:scale-95 transition-all text-center">
            <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center text-xl"><i className="fas fa-box"></i></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gblack">Insumos y Entrega</span>
         </button>
         
         <button onClick={() => exportDetailedReport()} className="bg-slate-900 p-5 rounded-3xl shadow-xl flex flex-col items-center gap-3 active:scale-95 transition-all text-center">
            <div className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center text-xl"><i className="fas fa-file-csv"></i></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Reporte General Diurno</span>
         </button>
      </div>
    </div>
  );

  const absenceReasons = [
    'RTM - RESTRICCIONES',
    'AUS - AUSENCIA SIN JUSTIFICAR',
    'PNR - PERMISO NO REMUNERADO',
    'MED - PERMISO MEDICO',
    'PRL - PERMISO LABORAL',
    'ACC - INCAP. POR ACCIDENTE DE TRABAJO',
    'INC - INCAP. POR ENFERMEDAD GENERAL',
    'PXC - PERMISO POR CALAMIDAD',
    'FAM - PERMISO POR DÍA DE LA FAMILIA',
    'NDL - NO DEBÍA LABORAR',
    'SAN - SANCIÓN',
    'VAC - VACACIONES',
    'LCL - LICENCIA DE LUTO',
    'RETIRO',
    'TRASLADO',
    'VACANTES'
  ];

  const handleReasonChange = (personKey: string, reason: string) => {
    setState(prev => {
       const existingAbsences = prev.absences || [];
       const filtered = existingAbsences.filter(a => !(a.personKey === personKey && a.dateStr === selectedDate));
       if (reason) {
          filtered.push({
             id: Date.now().toString(),
             personKey,
             dateStr: selectedDate,
             reason
          });
       }
       return { ...prev, absences: filtered };
    });
  };

  const renderReportsAttendance = () => (
    <div className="p-6 pb-24 space-y-6 animate-in slide-in-from-right duration-300">
      <div className="flex items-center gap-4">
        <button onClick={() => setCurrentView(View.REPORTS)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
          <i className="fas fa-arrow-left"></i>
        </button>
        <div>
          <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Asistencia</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Detalle control turno</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
         <div className="w-10 h-10 bg-ggreen/10 text-ggreen rounded-xl flex items-center justify-center">
            <i className="fas fa-calendar-alt"></i>
         </div>
         <div className="flex-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar Fecha</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-transparent font-black text-gblack outline-none text-base" />
         </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
         <button onClick={() => setShowUnregistered(false)} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!showUnregistered ? 'bg-white text-gblack shadow-sm' : 'text-slate-400'}`}>Registrados</button>
         <button onClick={() => setShowUnregistered(true)} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${showUnregistered ? 'bg-white text-red-500 shadow-sm' : 'text-slate-400'}`}>Faltantes</button>
      </div>

      {!showUnregistered ? (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                  <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Horario</th>
                  <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {state.personnel.map(p => {
                  const pairs = getShiftPairs(p.key, selectedDate);
                  if (pairs.length === 0) return null;
                  return pairs.map((pair, idx) => (
                    <tr 
                      key={`${p.key}-${idx}`} 
                      className="hover:bg-slate-50/50 cursor-pointer active:bg-slate-100 transition-colors"
                      onClick={() => setEditingShiftContext({ personKey: p.key, dateStr: selectedDate })}
                    >
                      <td className="p-4">
                        <div className="font-black text-gblack text-sm">{p.nombre}</div>
                        <div className="text-[8px] text-slate-400 font-black uppercase tracking-widest">{p.cargo}</div>
                      </td>
                      <td className="p-4 text-[10px] font-mono leading-tight">
                        <div className="text-ggreen font-bold">IN: {pair.start ? new Date(pair.start.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}</div>
                        <div className="text-orange-600 font-bold">OUT: {pair.end ? new Date(pair.end.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}</div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-base font-black text-ggreen tracking-tighter">
                          {pair.start && pair.end ? ((pair.end.timestamp - pair.start.timestamp) / (1000 * 60 * 60)).toFixed(2) : '0.00'}
                        </span>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {unregisteredInDate.length === 0 ? (
            <div className="bg-ggreen/5 p-12 rounded-[2rem] text-center border-2 border-dashed border-ggreen/10">
               <i className="fas fa-check-circle text-ggreen text-3xl mb-4"></i>
               <p className="text-ggreen font-black uppercase text-[10px] tracking-widest">¡Asistencia completa hoy!</p>
            </div>
          ) : (
            unregisteredInDate.map(p => {
               const savedAbsence = state.absences?.find(a => a.personKey === p.key && a.dateStr === selectedDate);
               return (
                  <div key={p.key} className="bg-white p-4 rounded-[2rem] shadow-sm border-l-4 border-l-red-400 border border-slate-100 flex flex-col gap-3">
                     <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center font-black">{p.nombre[0]}{p.apellido[0]}</div>
                       <div className="flex-1">
                          <h3 className="font-black text-gblack text-sm">{p.nombre} {p.apellido}</h3>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{p.cargo || 'LOGISTICA'}</p>
                       </div>
                     </div>
                     <div className="pt-2 border-t border-slate-50">
                        <select
                          className="w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-[10px] font-bold text-gblack outline-none focus:border-red-400 transition-colors"
                          value={savedAbsence?.reason || ''}
                          onChange={(e) => handleReasonChange(p.key, e.target.value)}
                        >
                           <option value="">-- Seleccionar Causa de Ausencia --</option>
                           {absenceReasons.map(r => (
                              <option key={r} value={r}>{r}</option>
                           ))}
                        </select>
                     </div>
                  </div>
               );
            })
          )}
        </div>
      )}
    </div>
  );

  const reportRef = useRef<HTMLDivElement>(null);

  const handleShare = async (type: 'pdf' | 'image' | 'csv') => {
    setShowShareOptions(false);
    
    if (type === 'csv') {
      const stats = getAbsenceStats(selectedDate);
      let output = `ASISTENCIA DIARIA CENTRO OPERATIVO B 9\nFecha,${selectedDate}\n\n`;
      output += `CONCEPTO,CANTIDAD,PORCENTAJE\n`;
      output += `PLAN OPERATIVO,${stats.nomina},\n`;
      output += `NOMINA,${stats.nomina},\n`;
      
      absenceReasons.forEach(r => {
        const count = stats.counts[r];
        const percentage = stats.nomina > 0 ? ((count / stats.nomina) * 100).toFixed(1) : '0.0';
        output += `${escapeCsvField(r)},${count},${percentage}%\n`;
      });
      
      const operativosPct = stats.nomina > 0 ? ((stats.operativosCount / stats.nomina) * 100).toFixed(1) : '0.0';
      output += `OPERATIVOS,${stats.operativosCount},${operativosPct}%\n`;
      
      shareFile(output, `Reporte_Turno_${selectedDate}.csv`, 'text/csv');
      return;
    }

    if (!reportRef.current) return;
    
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      
      if (type === 'image') {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Reporte_Turno_${selectedDate}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      } else if (type === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`Reporte_Turno_${selectedDate}.pdf`);
      }
    } catch (e) {
      console.error(e);
      alert("Error al generar el documento.");
    }
  };

  const renderReportsShift = () => {
     const stats = getAbsenceStats(selectedDate);
     
     return (
        <div className="p-6 pb-24 space-y-6 animate-in slide-in-from-right duration-300">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentView(View.REPORTS)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
              <i className="fas fa-arrow-left"></i>
            </button>
            <div>
              <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Reporte Turno</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Indicadores de asistencia</p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
             <div className="w-10 h-10 bg-ggreen/10 text-ggreen rounded-xl flex items-center justify-center">
                <i className="fas fa-calendar-alt"></i>
             </div>
             <div className="flex-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar Fecha</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-transparent font-black text-gblack outline-none text-base" />
             </div>
          </div>
          
          <div ref={reportRef} className="bg-white shadow-lg border border-slate-200 text-xs overflow-hidden" style={{fontFamily: "Arial, sans-serif"}}>
             <div className="bg-[#A4D65E] text-center font-bold text-gray-800 p-2 uppercase border-b border-white">
                Asistencia Diaria Centro Operativo
             </div>
             <div className="bg-[#B5E66A] text-center text-white py-1 italic border-b border-[#A4D65E]">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
             </div>
             
             <div className="grid grid-cols-12 text-center text-[10px] font-bold">
                <div className="col-span-8 bg-gray-100 py-1 border-b border-r border-gray-300 text-gray-700">PLAN OPERATIVO</div>
                <div className="col-span-2 bg-gray-100 py-1 border-b border-r border-gray-300 text-gray-800">{stats.nomina}</div>
                <div className="col-span-2 bg-gray-100 border-b border-gray-300 flex items-center justify-center"><i className="fas fa-chart-pie text-[#A4D65E]"></i></div>
                
                <div className="col-span-8 bg-gray-200 py-1 border-b border-r border-gray-300 text-gray-700">NOMINA</div>
                <div className="col-span-2 bg-gray-200 py-1 border-b border-r border-gray-300 text-gray-800">{stats.nomina}</div>
                <div className="col-span-2 bg-gray-200 border-b border-gray-300"></div>
                
                {absenceReasons.map((r, i) => {
                   const count = stats.counts[r];
                   const pct = stats.nomina > 0 ? (count / stats.nomina * 100).toFixed(1) : '0,0';
                   const bgColor = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                   let valBgColor = bgColor;
                   if (count > 0) {
                      if (r.includes('AUSENCIA') || r.includes('VACANTES')) valBgColor = 'bg-red-500 text-white';
                      else if (r.includes('VACACIONES')) valBgColor = 'bg-[#A4D65E] text-white';
                      else if (r.includes('ENFERMEDAD') || r.includes('INCAP')) valBgColor = 'bg-amber-400 text-white';
                      else valBgColor = 'bg-gray-300';
                   }
                   
                   return (
                      <React.Fragment key={r}>
                         <div className={`col-span-8 text-left pl-2 py-1 border-b border-r border-gray-300 text-gray-600 ${bgColor}`}>{r}</div>
                         <div className={`col-span-2 py-1 border-b border-r border-gray-300 font-bold ${valBgColor}`}>{count}</div>
                         <div className={`col-span-2 py-1 border-b border-gray-300 text-gray-600 ${count > 0 ? 'bg-blue-400 text-white font-bold' : bgColor}`}>{pct}%</div>
                      </React.Fragment>
                   );
                })}
                
                <div className="col-span-8 bg-[#A4D65E] font-bold text-white py-1 border-r border-white text-right pr-4">OPERATIVOS</div>
                <div className="col-span-2 bg-yellow-400 font-bold text-gray-800 py-1 border-r border-white">{stats.operativosCount}</div>
                <div className="col-span-2 bg-blue-500 font-bold text-white py-1">{stats.nomina > 0 ? (stats.operativosCount/stats.nomina*100).toFixed(1) : '0,0'}%</div>
             </div>
          </div>
          
          <div className="relative">
             <button onClick={() => setShowShareOptions(!showShareOptions)} className="w-full bg-gblack text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                <i className="fas fa-share-nodes"></i> Compartir Reporte
             </button>
             
             {showShareOptions && (
                <div className="absolute bottom-full mb-3 inset-x-0 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col z-10 animate-in slide-in-from-bottom-2">
                   <button onClick={() => handleShare('pdf')} className="p-4 text-left font-bold text-gblack hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50">
                      <i className="fas fa-file-pdf text-red-500 text-lg"></i> Exportar como PDF
                   </button>
                   <button onClick={() => handleShare('image')} className="p-4 text-left font-bold text-gblack hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50">
                      <i className="fas fa-file-image text-blue-500 text-lg"></i> Exportar como Imagen
                   </button>
                   <button onClick={() => handleShare('csv')} className="p-4 text-left font-bold text-gblack hover:bg-slate-50 flex items-center gap-3">
                      <i className="fas fa-file-csv text-ggreen text-lg"></i> Exportar como CSV
                   </button>
                </div>
             )}
          </div>
        </div>
     );
  };

  const renderSettings = () => (
    <div className="p-6 pb-24 space-y-6 animate-in fade-in slide-in-from-right-10 duration-500">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={() => setCurrentView(View.DASHBOARD)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
          <i className="fas fa-arrow-left"></i>
        </button>
        <h2 className="text-2xl font-black text-gblack tracking-tight">Sistema CTP</h2>
      </div>

      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 text-center">
        <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-3xl mb-6 shadow-inner ${state.isActivated ? 'bg-ggreen/10 text-ggreen' : 'bg-red-50 text-red-600'}`}>
          <i className={state.isActivated ? "fas fa-check-circle" : "fas fa-key"}></i>
        </div>
        <h3 className="text-xl font-black text-gblack mb-1 uppercase tracking-tight brand-font"><span className="text-ggreen">control</span>turno PRO</h3>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-8">{state.isActivated ? 'Uso Profesional Activado' : `Versión de prueba: ${daysRemaining} días`}</p>
        {!state.isActivated && (
          <form onSubmit={handleManualActivation} className="space-y-4">
            <input type="password" inputMode="numeric" placeholder="••••" value={licenseCodeInput} onChange={(e) => setLicenseCodeInput(e.target.value)} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-2xl font-black tracking-widest focus:ring-8 focus:ring-ggreen/10 outline-none transition-all" />
            <button type="submit" className="w-full bg-ggreen text-white font-black py-5 rounded-2xl shadow-xl shadow-ggreen/20 active:scale-95 transition-all uppercase tracking-widest text-xs">Activar Licencia CTP</button>
          </form>
        )}
      </div>

      <div className="bg-gblack p-6 rounded-[2.5rem] shadow-xl">
        <h4 className="text-white font-black text-sm uppercase tracking-widest mb-4">Estado del Sistema</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className="text-slate-500 uppercase">Instalado en:</span>
            <span className="text-slate-300">{new Date(state.installDate).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold border-t border-slate-800 pt-3">
            <span className="text-slate-500 uppercase">Capacidad Máxima:</span>
            <span className="text-ggreen uppercase">{MAX_PERSONNEL_LIMIT} Colaboradores</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold border-t border-slate-800 pt-3">
            <span className="text-slate-500 uppercase">Respaldo Automático:</span>
            <span className="text-blue-400 uppercase">Activo (Local)</span>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-3">
            <i className="fas fa-database text-ggreen"></i>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-gblack">Copia de Seguridad</p>
               <p className="text-[8px] font-bold text-slate-400">Exportar base Control de turno</p>
            </div>
         </div>
         <button onClick={exportMasterDatabase} className="bg-ggreen/10 text-ggreen px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-90 transition-all">Compartir</button>
      </div>

      <button onClick={() => setCurrentView(View.BACKUP_SETTINGS)} className="w-full bg-white p-6 rounded-3xl border border-slate-100 flex items-center justify-between group hover:border-ggreen/30 transition-all">
         <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
               <i className="fas fa-cloud-upload-alt text-lg"></i>
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-gblack mb-1">Backup Automático</p>
               <p className="text-[8px] font-bold text-slate-400 leading-tight">Configurar envío al correo en CSV</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
            {state.backupConfig?.active && (
               <span className="w-2 h-2 rounded-full bg-ggreen"></span>
            )}
            <i className="fas fa-chevron-right text-slate-300 group-hover:text-ggreen transition-colors"></i>
         </div>
      </button>

      <button onClick={() => setShowResetConfirm(true)} className="w-full bg-red-50 p-6 rounded-3xl border border-red-100 flex items-center justify-between group active:scale-95 transition-all text-left mt-6">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
               <i className="fas fa-triangle-exclamation text-lg"></i>
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">Borrar Todos Los Datos</p>
               <p className="text-[8px] font-bold text-red-400 leading-tight">Eliminar registros y reportes</p>
            </div>
         </div>
         <i className="fas fa-chevron-right text-red-300 group-hover:text-red-500 transition-colors"></i>
      </button>

    </div>
  );

  const calculateIndicators = () => {
    if (!indSelectedPerson || !indStartDate || !indEndDate) return null;
    
    // Check if end date is before start date
    if (indEndDate < indStartDate) return null;

    const personShifts = state.shifts.filter(s => s.personKey === indSelectedPerson && s.dateStr >= indStartDate && s.dateStr <= indEndDate).sort((a,b) => a.timestamp - b.timestamp);
    const shiftsByDate: Record<string, ShiftRecord[]> = {};
    personShifts.forEach(s => {
      if(!shiftsByDate[s.dateStr]) shiftsByDate[s.dateStr] = [];
      shiftsByDate[s.dateStr].push(s);
    });
    
    let totalActualHours = 0;
    let totalExpectedHours = 0;
    let daysCount = 0;
    let daysWorkedCount = 0;
    const chartData: any[] = [];
    
    const [sY, sM, sD] = indStartDate.split('-').map(Number);
    let currentDate = new Date(sY, sM - 1, sD);
    const [eY, eM, eD] = indEndDate.split('-').map(Number);
    const endDate = new Date(eY, eM - 1, eD);
    
    while(currentDate <= endDate) {
      const dateStr = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');
      const dayOfWeek = currentDate.getDay(); // 0-6 (Sun-Sat)
      
      const config = state.scheduleConfig?.[dayOfWeek] || { start: '07:00', end: '14:00', active: true };
      let expectedHours = 0;
      if (config.active) {
        const [startH, startM] = config.start.split(':').map(Number);
        const [endH, endM] = config.end.split(':').map(Number);
        expectedHours = (endH + endM/60) - (startH + startM/60);
        if (expectedHours < 0) expectedHours += 24; 
      }
      
      totalExpectedHours += expectedHours;
      daysCount++;
      
      const dayShifts = shiftsByDate[dateStr] || [];
      let dayActualHours = 0;
      let lastIn: number | null = null;
      dayShifts.forEach(s => {
        if (s.type === 'INICIO') {
          lastIn = s.timestamp;
        } else if (s.type === 'FIN' && lastIn !== null) {
          dayActualHours += (s.timestamp - lastIn) / (1000 * 60 * 60);
          lastIn = null;
        }
      });
      if (dayActualHours > 0) {
          daysWorkedCount++;
      }
      totalActualHours += dayActualHours;
      
      chartData.push({
        date: String(currentDate.getDate()).padStart(2, '0') + '/' + String(currentDate.getMonth() + 1).padStart(2, '0'),
        Esperadas: Number(expectedHours.toFixed(1)),
        Reales: Number(dayActualHours.toFixed(1))
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
      totalActualHours,
      totalExpectedHours,
      avgHoursPerDay: daysWorkedCount > 0 ? totalActualHours / daysWorkedCount : 0,
      compliancePercentage: totalExpectedHours > 0 ? (totalActualHours / totalExpectedHours) * 100 : 0,
      chartData
    };
  };

  const renderIndicators = () => {
    const indicators = calculateIndicators();
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    return (
      <div className="p-6 pb-24 space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
             <button onClick={() => setCurrentView(View.INDICATORS_SETTINGS)} className="w-12 h-12 bg-slate-50 border-2 border-slate-100 rounded-xl flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:text-ggreen hover:border-ggreen/30">
               <i className="fas fa-cog text-xl"></i>
             </button>
             <div>
                <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Indicadores</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Rendimiento Laboral</p>
             </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-5">
           <div className="space-y-2">
             <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Seleccionar Personal</label>
             <select 
               value={indSelectedPerson} 
               onChange={(e) => setIndSelectedPerson(e.target.value)}
               className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none appearance-none"
             >
               <option value="">-- Seleccione una persona --</option>
               {state.personnel.map(p => (
                 <option key={p.key} value={p.key}>{p.nombre} {p.apellido} ({p.cedula})</option>
               ))}
             </select>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Fecha Inicial</label>
                 <input 
                   type="date" 
                   value={indStartDate} 
                   onChange={(e) => setIndStartDate(e.target.value)}
                   className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-xs font-bold text-gblack focus:border-ggreen outline-none"
                 />
              </div>
              <div className="space-y-2">
                 <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Fecha Final</label>
                 <input 
                   type="date" 
                   value={indEndDate} 
                   onChange={(e) => setIndEndDate(e.target.value)}
                   className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-xs font-bold text-gblack focus:border-ggreen outline-none"
                 />
              </div>
           </div>
        </div>

        {indicators && (
          <div className="space-y-4">
             <div className="bg-gblack text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col items-center justify-center py-10">
                <div className="absolute top-0 right-0 w-32 h-32 bg-ggreen rounded-bl-full opacity-10"></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cumplimiento Global</span>
                <div className="flex items-end gap-2">
                   <h3 className={`text-6xl font-black tracking-tighter ${indicators.compliancePercentage >= 100 ? 'text-ggreen' : indicators.compliancePercentage >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                     {indicators.compliancePercentage.toFixed(1)}
                   </h3>
                   <span className="text-2xl font-bold pb-2">%</span>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center">
                   <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-3">
                     <i className="fas fa-clock text-lg"></i>
                   </div>
                   <span className="text-3xl font-black text-gblack tracking-tight">{indicators.totalActualHours.toFixed(1)}<span className="text-sm">h</span></span>
                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Horas Trabajadas</span>
                </div>
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center">
                   <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-3">
                     <i className="fas fa-calendar-check text-lg"></i>
                   </div>
                   <span className="text-3xl font-black text-gblack tracking-tight">{indicators.avgHoursPerDay.toFixed(1)}<span className="text-sm">h</span></span>
                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Promedio / Día</span>
                </div>
             </div>

             <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 mt-4">
                <h3 className="text-xs font-black text-gblack uppercase tracking-widest mb-4">Rendimiento (Horas)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={indicators.chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                      <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="Esperadas" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Reales" fill="#84CC16" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
             
             <div className="bg-slate-100 p-5 rounded-[2rem] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Horas Esperadas Rango</span>
                <span className="text-lg font-black text-gblack">{indicators.totalExpectedHours.toFixed(1)} h</span>
             </div>
          </div>
        )}
      </div>
    );
  };

  const renderIndicatorsSettings = () => {
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    
    // In order to not directly mutate state, we create a copy setter
    const updateSchedule = (dayIndex: number, field: 'start' | 'end' | 'active', value: any) => {
      const newConfig = { ...state.scheduleConfig };
      newConfig[dayIndex] = { ...newConfig[dayIndex], [field]: value };
      setState(prev => ({ ...prev, scheduleConfig: newConfig }));
    };

    return (
      <div className="p-6 pb-24 space-y-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentView(View.INDICATORS)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Configuración</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Rangos de Horario</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
           <p className="text-xs text-slate-500 leading-relaxed font-medium">Configure los horarios esperados por día para calcular correctamente los indicadores de cumplimiento.</p>
           
           <div className="space-y-4">
             {dayNames.map((dayName, index) => {
               const config = state.scheduleConfig?.[index] || { start: '07:00', end: '14:00', active: true };
               return (
                 <div key={index} className="flex flex-col gap-2 p-4 bg-slate-50 border-2 border-slate-100 rounded-xl">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-xs font-black text-gblack uppercase tracking-widest">{dayName}</span>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={config.active} onChange={(e) => updateSchedule(index, 'active', e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-ggreen"></div>
                     </label>
                   </div>
                   {config.active && (
                     <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="text-[8px] uppercase font-black text-slate-400 tracking-widest block mb-1">Entrada</label>
                          <input type="time" value={config.start} onChange={(e) => updateSchedule(index, 'start', e.target.value)} className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs font-bold focus:border-ggreen outline-none"/>
                        </div>
                        <div className="flex-1">
                          <label className="text-[8px] uppercase font-black text-slate-400 tracking-widest block mb-1">Salida</label>
                          <input type="time" value={config.end} onChange={(e) => updateSchedule(index, 'end', e.target.value)} className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs font-bold focus:border-ggreen outline-none"/>
                        </div>
                     </div>
                   )}
                 </div>
               );
             })}
           </div>
        </div>
      </div>
    );
  };

  const renderBackupSettings = () => {
    const updateBackupConfig = (field: 'active' | 'email' | 'prefix', value: any) => {
      setState(prev => ({
        ...prev,
        backupConfig: {
          ...prev.backupConfig,
          [field]: value
        }
      }));
    };

    return (
      <div className="p-6 pb-24 space-y-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentView(View.SETTINGS)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Backup Nube</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Configuración de Drive</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
           <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
             <div>
                <span className="text-xs font-black text-gblack uppercase tracking-widest block mb-1">Activar Envío Automático</span>
                <span className="text-[10px] font-bold text-slate-400 block leading-tight">Sube CSV diariamente</span>
             </div>
             <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={state.backupConfig?.active || false} onChange={(e) => updateBackupConfig('active', e.target.checked)} />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ggreen"></div>
             </label>
           </div>

           <div className="space-y-4">
             <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Correo Electrónico (Google Drive)</label>
                <input 
                  type="email" 
                  value={state.backupConfig?.email || ''} 
                  onChange={(e) => updateBackupConfig('email', e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
                />
             </div>
             
             <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Nombre Centro Operativo (Prefijo)</label>
                <input 
                  type="text" 
                  value={state.backupConfig?.prefix || 'CTP'} 
                  onChange={(e) => updateBackupConfig('prefix', e.target.value)}
                  placeholder="Ej. BOGOTA_SUR"
                  className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
                />
             </div>

             <div className="p-4 bg-slate-100 rounded-xl mt-4">
               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Formato Archivo Final:</span>
               <span className="text-xs font-mono text-slate-800 font-bold">{state.backupConfig?.prefix || 'CTP'}_{new Date().toISOString().slice(0, 10)}.csv</span>
             </div>
             
             <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed pt-2">
               Nota: El acceso definitivo a Drive OAuth y el envío automatizado por cron se habilitará luego como insumo de Inteligencia de Negocios en Línea.
             </p>
           </div>
        </div>
      </div>
    );
  };

  const renderSupplies = () => {
    return (
      <div className="p-6 pb-24 space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-ggreen/10 border-2 border-ggreen rounded-xl flex items-center justify-center text-ggreen">
               <i className="fas fa-box text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Insumos</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Control de elementos</p>
             </div>
          </div>
          <button onClick={() => setCurrentView(View.NEW_SUPPLY)} className="w-10 h-10 bg-ggreen text-white rounded-xl shadow-lg shadow-ggreen/20 flex items-center justify-center active:scale-90 transition-all">
             <i className="fas fa-plus"></i>
          </button>
        </div>

        <div className="bg-gblack p-6 rounded-[2rem] shadow-xl text-center active:scale-95 transition-all cursor-pointer" onClick={() => {
           setScannerContext('supply');
           setShowScanner(true);
        }}>
           <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center text-white mx-auto mb-4 border border-white/10">
             <i className="fas fa-hand-holding-box text-2xl"></i>
           </div>
           <h3 className="text-lg font-black text-white uppercase tracking-widest">Entregar Artículo</h3>
           <p className="text-[10px] text-slate-400 font-bold tracking-widest">Escanear código de usuario</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
           <h3 className="text-xs font-black text-gblack uppercase tracking-widest mb-4">Inventario Actual</h3>
           {state.inventory.length === 0 ? (
             <p className="text-xs text-slate-400 font-bold text-center py-4 uppercase tracking-widest">No hay insumos</p>
           ) : (
             <div className="space-y-3">
               {state.inventory.map(item => (
                 <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-xl">
                   <div className="font-bold text-gblack">{item.name}</div>
                   <div className="font-black text-ggreen text-lg">{item.quantity}</div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    );
  };

  const renderNewSupply = () => {
    const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (!supplyForm.name || !supplyForm.quantity) return;
      
      const newId = Date.now().toString();
      setState(prev => ({
        ...prev,
        inventory: [...prev.inventory, { id: newId, name: supplyForm.name, quantity: parseInt(supplyForm.quantity) }]
      }));
      setSupplyForm({name: '', quantity: ''});
      setCurrentView(View.SUPPLIES);
    };

    return (
      <div className="p-6 pb-24 space-y-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentView(View.SUPPLIES)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black text-gblack mb-0 leading-tight">Nuevo Ingreso</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Agregar al inventario</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
           <div className="space-y-2">
              <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Nombre del Artículo</label>
              <input 
                type="text" 
                required
                value={supplyForm.name} 
                onChange={(e) => setSupplyForm(prev => ({...prev, name: e.target.value}))}
                placeholder="Ej. Guantes"
                className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
              />
           </div>
           <div className="space-y-2">
              <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Cantidad</label>
              <input 
                type="number" 
                required
                min="1"
                value={supplyForm.quantity} 
                onChange={(e) => setSupplyForm(prev => ({...prev, quantity: e.target.value}))}
                placeholder="10"
                className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
              />
           </div>
           <button type="submit" className="w-full bg-ggreen text-white font-black py-4 rounded-xl shadow-xl shadow-ggreen/20 active:scale-95 transition-all tracking-widest uppercase text-xs">
              Guardar Insumo
           </button>
        </form>
      </div>
    );
  };

  const renderDeliverSupply = () => {
    const person = state.personnel.find(p => p.key === deliverForm.personKey);
    if (!person) return null;

    const handleDeliver = (e: React.FormEvent) => {
      e.preventDefault();
      if (!deliverForm.itemName || !deliverForm.quantity || !deliverForm.personKey) return;
      
      const itemToUpdate = state.inventory.find(i => i.id === deliverForm.itemName);
      const deliveryQty = parseInt(deliverForm.quantity);
      
      if (!itemToUpdate || itemToUpdate.quantity < deliveryQty) {
        alert("Cantidad insuficiente en inventario.");
        return;
      }
      
      const newInventory = state.inventory.map(i => {
        if (i.id === deliverForm.itemName) {
          return { ...i, quantity: i.quantity - deliveryQty };
        }
        return i;
      });
      
      const record: DeliveryRecord = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        personKey: deliverForm.personKey,
        itemName: itemToUpdate.name,
        quantity: deliveryQty
      };

      setState(prev => ({
        ...prev,
        inventory: newInventory,
        deliveries: [...prev.deliveries, record]
      }));
      setDeliverForm({itemName: '', quantity: ''});
      setCurrentView(View.SUPPLIES);
      setScannerContext('shift'); // reset
    };

    return (
      <div className="p-6 pb-24 space-y-6 animate-in zoom-in-95 duration-300">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl text-center border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-32 bg-gblack -z-10"></div>
          <div className="flex items-center gap-4 mb-4 text-white">
            <button onClick={() => setCurrentView(View.SUPPLIES)} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all">
              <i className="fas fa-arrow-left"></i>
            </button>
            <span className="text-xs font-black uppercase tracking-widest">Entrega de elementos</span>
          </div>
          <div className="mt-8">
            <div className="w-24 h-24 bg-white text-ggreen rounded-3xl flex items-center justify-center mx-auto mb-4 text-4xl font-black shadow-2xl border-8 border-white">
              {person.nombre[0]}{person.apellido[0]}
            </div>
            <h2 className="text-2xl font-black text-gblack tracking-tight">{person.nombre} {person.apellido}</h2>
            <h3 className="text-sm font-bold text-slate-400 mt-1">{person.cargo}</h3>
          </div>
          
          <form onSubmit={handleDeliver} className="mt-8 space-y-4 text-left">
             <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Seleccionar Artículo</label>
                <select 
                  required
                  value={deliverForm.itemName} 
                  onChange={(e) => setDeliverForm(prev => ({...prev, itemName: e.target.value}))}
                  className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none appearance-none"
                >
                  <option value="">-- Elija un insumo --</option>
                  {state.inventory.filter(i => i.quantity > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.name} (Disp: {i.quantity})</option>
                  ))}
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-ggreen tracking-widest block">Cantidad a Entregar</label>
                <input 
                  type="number" 
                  required
                  min="1"
                  value={deliverForm.quantity} 
                  onChange={(e) => setDeliverForm(prev => ({...prev, quantity: e.target.value}))}
                  className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-ggreen outline-none"
                />
             </div>
             <button type="submit" className="w-full bg-ggreen text-white font-black py-4 rounded-xl shadow-xl shadow-ggreen/20 active:scale-95 transition-all tracking-widest uppercase mt-4 text-xs">
                Confirmar Entrega
             </button>
          </form>
        </div>
      </div>
    );
  };

  const renderConflict = () => {
    const existing = state.personnel.find(p => p.key === (enrollmentForm.key || pendingScanResult));
    if (!existing) return null;
    return (
      <div className="p-6 animate-in zoom-in-95 duration-300">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-ggreen/20 text-center">
          <div className="w-20 h-20 bg-ggreen/10 text-ggreen rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
            <i className="fas fa-id-badge text-3xl"></i>
          </div>
          <h2 className="text-2xl font-black text-gblack tracking-tight leading-tight uppercase">Usuario Registrado</h2>
          <div className="bg-slate-50 p-6 rounded-3xl mb-10 border border-slate-100 text-left flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl font-black shadow-sm">{existing.nombre[0]}</div>
            <div>
              <div className="font-black text-gblack text-lg">{existing.nombre} {existing.apellido}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">{existing.cargo}</div>
            </div>
          </div>
          <div className="grid gap-3">
             <button onClick={() => startEditing(existing)} className="w-full bg-ggreen text-white font-black py-5 rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95">
                <i className="fas fa-user-pen"></i> EDITAR DATOS
             </button>
             <button onClick={() => requestDeletePerson(existing)} className="w-full bg-red-50 text-red-600 font-black py-4 rounded-2xl flex items-center justify-center gap-3 border border-red-100 active:scale-95">
                <i className="fas fa-trash"></i> BORRAR REGISTRO
             </button>
             <button onClick={() => { setCurrentView(View.DASHBOARD); setPendingScanResult(null); }} className="w-full bg-slate-100 text-slate-500 font-bold py-3 rounded-2xl mt-4 text-[10px] uppercase">VOLVER</button>
          </div>
        </div>
      </div>
    );
  };

  const renderForm = (isEdit: boolean = false) => (
    <div className="p-6 pb-32 animate-in zoom-in-95 duration-300">
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100">
        <div className="flex items-center gap-5 mb-8">
           <div className={`w-16 h-16 ${isEdit ? 'bg-gblack' : 'bg-ggreen'} text-white rounded-[1.5rem] flex items-center justify-center text-3xl shadow-xl`}>
              <i className={isEdit ? "fas fa-user-pen" : "fas fa-user-plus"}></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-gblack tracking-tight brand-font">{isEdit ? 'Editar Datos' : 'Inscripción CTP'}</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Base de Datos Central</p>
           </div>
        </div>
        <form onSubmit={isEdit ? handleEditSubmit : handleEnrollmentSubmit} className="space-y-4">
          <div className="bg-gblack p-5 rounded-2xl mb-4 border border-ggreen/20">
            <label className="text-[9px] uppercase font-black text-ggreen tracking-widest mb-1 block">Llave Maestra CTP</label>
            <div className="text-xs font-mono text-white break-all leading-tight font-bold">{enrollmentForm.key}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
              <input required type="text" value={enrollmentForm.nombre || ''} onChange={e => setEnrollmentForm({...enrollmentForm, nombre: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-ggreen/10 outline-none text-gblack font-black text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellido</label>
              <input required type="text" value={enrollmentForm.apellido || ''} onChange={e => setEnrollmentForm({...enrollmentForm, apellido: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-ggreen/10 outline-none text-gblack font-black text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Documento Cédula</label>
            <input required type="text" inputMode="numeric" value={enrollmentForm.cedula || ''} onChange={e => setEnrollmentForm({...enrollmentForm, cedula: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-ggreen/10 outline-none text-gblack font-black text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Área</label>
              <input type="text" value={enrollmentForm.area || ''} onChange={e => setEnrollmentForm({...enrollmentForm, area: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-ggreen/10 outline-none text-gblack font-black text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo</label>
              <input type="text" value={enrollmentForm.cargo || ''} onChange={e => setEnrollmentForm({...enrollmentForm, cargo: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-4 focus:ring-ggreen/10 outline-none text-gblack font-black text-sm" />
            </div>
          </div>
          <div className="pt-6 flex flex-col gap-3">
            <button type="submit" className={`w-full ${isEdit ? 'bg-gblack' : 'bg-ggreen'} text-white font-black py-5 rounded-2xl shadow-2xl active:scale-95 text-xs uppercase tracking-widest`}>
              {isEdit ? 'ACTUALIZAR DATOS' : 'GUARDAR EN BASE CTP'}
            </button>
            <button type="button" onClick={() => setCurrentView(View.PERSONNEL)} className="w-full bg-slate-100 text-slate-400 font-bold py-3 rounded-2xl text-[9px] uppercase tracking-widest">CANCELAR</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderShiftAction = () => {
    const person = state.personnel.find(p => p.key === pendingScanResult);
    if (!person) return null;
    return (
      <div className="p-6 pb-24 animate-in slide-in-from-bottom-12 duration-500">
        <div className="bg-white p-10 rounded-[4rem] shadow-2xl border border-slate-100 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-40 bg-gblack -z-10"></div>
          <div className="mt-8">
            <div className="w-32 h-32 bg-white text-ggreen rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 text-5xl font-black shadow-2xl border-[12px] border-white active:scale-110 transition-transform">
              {person.nombre[0]}{person.apellido[0]}
            </div>
            <h2 className="text-3xl font-black text-gblack tracking-tight leading-none brand-font"><span className="text-ggreen">control</span>turno</h2>
            <h3 className="text-xl font-bold text-slate-400 mt-1">{person.nombre} {person.apellido}</h3>
            <div className="mt-8 mb-12 flex flex-col items-center gap-1">
               <span className="text-[10px] font-black uppercase tracking-widest bg-ggreen text-white px-5 py-2 rounded-2xl shadow-lg shadow-ggreen/10">{person.cargo || 'LOGÍSTICA'}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 max-w-sm mx-auto">
            <button onClick={() => addShift('INICIO')} className="bg-ggreen text-white text-xl font-black py-8 rounded-[2rem] shadow-2xl shadow-ggreen/20 flex items-center justify-center gap-4 transition-all active:scale-95">
              <i className="fas fa-play text-sm"></i> ENTRADA TURNO
            </button>
            <button onClick={() => addShift('FIN')} className="bg-gblack text-white text-xl font-black py-8 rounded-[2rem] shadow-2xl shadow-slate-300 flex items-center justify-center gap-4 transition-all active:scale-95">
              <i className="fas fa-stop text-sm"></i> SALIDA TURNO
            </button>
          </div>
          <button onClick={() => { setPendingScanResult(null); setCurrentView(View.DASHBOARD); }} className="mt-12 text-slate-400 font-black uppercase text-[10px] tracking-widest active:text-slate-600 transition-colors">DESCARTAR</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-ggreen/10 relative overflow-x-hidden pb-20">
      {isLicenseExpired && <LicenseGuard onActivate={handleActivate} />}
      
      <header className="bg-gblack p-4 text-white flex items-center gap-3 shadow-2xl sticky top-0 z-[1000] rounded-b-3xl">
         <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 border-2 border-ggreen rounded-xl flex items-center justify-center font-black shadow-lg shadow-ggreen/10 overflow-hidden relative bg-white">
               <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
            </div>
            <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">Control de</span>
               <span className="text-sm font-black text-white uppercase tracking-widest leading-none">Personal CTP</span>
            </div>
         </div>
         <button onClick={() => setCurrentView(View.SETTINGS)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-white transition-all active:scale-90">
            <i className="fas fa-cog"></i>
         </button>
      </header>

      <main className="max-w-2xl mx-auto min-h-screen">
        {currentView === View.DASHBOARD && renderDashboard()}
        {currentView === View.PERSONNEL && renderPersonnel()}
        {currentView === View.REPORTS && renderReportsHub()}
        {currentView === View.REPORTS_ATTENDANCE && renderReportsAttendance()}
        {currentView === View.REPORTS_SHIFT && renderReportsShift()}
        {currentView === View.SETTINGS && renderSettings()}
        {currentView === View.ENROLLMENT && renderForm(false)}
        {currentView === View.EDIT_PERSON && renderForm(true)}
        {currentView === View.SHIFT_ACTION && renderShiftAction()}
        {currentView === View.CONFLICT && renderConflict()}
        {currentView === View.INDICATORS && renderIndicators()}
        {currentView === View.INDICATORS_SETTINGS && renderIndicatorsSettings()}
        {currentView === View.BACKUP_SETTINGS && renderBackupSettings()}
        {currentView === View.SUPPLIES && renderSupplies()}
        {currentView === View.NEW_SUPPLY && renderNewSupply()}
        {currentView === View.DELIVER_SUPPLY && renderDeliverSupply()}
      </main>

      {renderBottomNav()}
      {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      
      {personToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <h3 className="text-xl font-black text-gblack text-center mb-2 tracking-tight">Eliminar Personal</h3>
            <p className="text-xs text-slate-500 font-bold text-center mb-6">
              ¿Está seguro de eliminar a <span className="text-gblack font-black">{personToDelete.nombre} {personToDelete.apellido}</span> de la base de datos principal?
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-[9px] uppercase font-black text-red-500 tracking-widest block">Motivo de eliminación</label>
                <select 
                  value={deleteReason} 
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold text-gblack focus:border-red-400 outline-none transition-colors appearance-none"
                >
                  <option value="">-- Seleccione un motivo --</option>
                  <option value="RETIRO - FINALIZACIÓN CONTRATO">RETIRO - FINALIZACIÓN CONTRATO</option>
                  <option value="RETIRO - RENUNCIA">RETIRO - RENUNCIA</option>
                  <option value="TRASLADO OTRO CENTRO">TRASLADO OTRO CENTRO</option>
                  <option value="ERROR DE REGISTRO">ERROR DE REGISTRO</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => { setPersonToDelete(null); setDeleteReason(''); }}
                className="py-4 text-xs font-black uppercase text-slate-500 hover:text-slate-800 tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeletePerson}
                className="bg-red-500 text-white font-black py-4 rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all text-xs tracking-widest uppercase"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {editingShiftContext && (
        <ShiftEditModal 
          context={editingShiftContext} 
          state={state} 
          setState={setState} 
          onClose={() => setEditingShiftContext(null)} 
        />
      )}
      
      {showResetConfirm && (
        <div className="fixed inset-0 z-[6000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
              <i className="fas fa-radiation"></i>
            </div>
            <h3 className="text-xl font-black text-gblack text-center mb-2 tracking-tight">Reiniciar Sistema</h3>
            <p className="text-xs text-slate-500 font-bold text-center mb-6 leading-relaxed">
              ¿Está seguro de <span className="text-red-500">eliminar todos los registros y reportes</span>? Esto devolverá la app a cero.
              <br/><br/>
              Antes de borrar, se generará y descargará automáticamente un archivo Maestro de Respaldo CSV.
            </p>
            
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={handleResetApp}
                className="w-full bg-red-50 text-red-600 border border-red-100 font-black py-4 rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all text-[10px] tracking-widest uppercase flex items-center justify-center gap-2"
              >
                <i className="fas fa-cloud-arrow-down text-base"></i> Respaldo & Borrar
              </button>
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="w-full bg-slate-100/50 text-slate-500 font-black py-4 rounded-xl shadow-sm active:scale-95 transition-all text-xs tracking-widest uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MARCA DE AGUA VISIBLE Y FIJA SOBRE TODO */}
      <div className="fixed bottom-24 right-4 text-[9px] font-black text-slate-950 uppercase pointer-events-none z-[5000] tracking-widest brand-font drop-shadow-md bg-white/10 px-2 py-1 rounded-full backdrop-blur-sm border border-white/10">
        creado por Enrique Forero
      </div>
    </div>
  );
};

export default App;
