
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, View, Person, ShiftRecord, ShiftType } from './types';
import { loadState, saveState, escapeCsvField, shareFile } from './services/storage';
import { TRIAL_DAYS, MS_PER_DAY, MAX_REPORTS_DAYS, ACTIVATION_CODE, MAX_PERSONNEL_LIMIT } from './constants';
import { LicenseGuard } from './components/LicenseGuard';
import { Scanner } from './components/Scanner';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(loadState());
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingScanResult, setPendingScanResult] = useState<string | null>(null);
  const [editingPersonKey, setEditingPersonKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [licenseCodeInput, setLicenseCodeInput] = useState('');
  const [showUnregistered, setShowUnregistered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [enrollmentForm, setEnrollmentForm] = useState<Partial<Person>>({});

  // Persistencia robusta: Se guarda en cada cambio de estado
  useEffect(() => {
    // Purga de reportes (60 días). La base de personal (2000 registros) es permanente.
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
        alert(`Éxito: ${newPersonnel.length} registros importados de GateGourmet.`);
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

  const deletePerson = (key: string) => {
    if (confirm("¿ESTÁ SEGURO DE ELIMINAR ESTE REGISTRO?\n\nEsta acción borrará al colaborador de GateGourmet de la base de datos principal de forma permanente.")) {
      setState(prev => ({ ...prev, personnel: prev.personnel.filter(p => p.key !== key) }));
      if (currentView === View.CONFLICT) setCurrentView(View.DASHBOARD);
    }
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

  const exportMasterDatabase = () => {
    if (state.personnel.length === 0) {
      alert("No hay personal para exportar.");
      return;
    }
    const header = "KEY_MAESTRA,NOMBRE,APELLIDO,CEDULA,AREA,Cargo\n";
    const body = state.personnel.map(p => 
      `${escapeCsvField(p.key)},${escapeCsvField(p.nombre)},${escapeCsvField(p.apellido)},${escapeCsvField(p.cedula)},${escapeCsvField(p.area)},${escapeCsvField(p.cargo)}`
    ).join('\n');
    shareFile(header + body, `GGT_Database_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  const exportDetailedReport = () => {
    const header = "NOMBRE,APELLIDO,CEDULA,AREA,Cargo,FECHA_INICIO,HORA_INICIO,FECHA_FIN,HORA_FIN,TOTAL_HORAS\n";
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
    shareFile(header + csvRows.join('\n'), `GGT_Report_${selectedDate}.csv`, 'text/csv');
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
      <button onClick={() => setCurrentView(View.REPORTS)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${currentView === View.REPORTS ? 'text-ggreen scale-110' : 'text-slate-500 opacity-60'}`}>
        <i className="fas fa-file-invoice text-2xl mb-1"></i>
        <span className="text-[10px] font-black uppercase tracking-wider">Reportes</span>
      </button>
    </nav>
  );

  const renderDashboard = () => (
    <div className="p-6 pb-24 flex flex-col items-center gap-10 animate-in fade-in duration-500">
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-full border-2 border-ggreen flex items-center justify-center overflow-hidden">
             <div className="w-5 h-[2px] bg-ggreen"></div>
           </div>
           <h1 className="text-xl font-black text-gblack tracking-tight brand-font"><span className="text-ggreen">gate</span>gourmet</h1>
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
            VERSIÓN NO ACTIVADA. <span className="text-white underline">PULSE PARA ACTIVAR SU COPIA GGT</span>.
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
                <button onClick={() => deletePerson(p.key)} className="w-11 h-11 rounded-2xl text-slate-200 hover:text-red-500 transition-all active:scale-90">
                  <i className="fas fa-trash-alt text-sm"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="p-6 pb-24 space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-gblack mb-1">Reportes GGT</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Asistencia Diaria</p>
        </div>
        <button onClick={exportDetailedReport} className="bg-gblack text-white px-5 py-3 rounded-2xl font-black text-[10px] flex items-center gap-2 shadow-2xl active:scale-95">
          <i className="fas fa-share-nodes"></i> DESCARGAR CSV
        </button>
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
         <button onClick={() => setShowUnregistered(true)} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${showUnregistered ? 'bg-white text-red-500 shadow-sm' : 'text-slate-400'}`}>Sin Registro</button>
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
                    <tr key={`${p.key}-${idx}`} className="hover:bg-slate-50/50">
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
            unregisteredInDate.map(p => (
              <div key={p.key} className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-l-red-400 border border-slate-100 flex items-center gap-4">
                 <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-lg font-black">{p.nombre[0]}{p.apellido[0]}</div>
                 <div className="flex-1">
                    <h3 className="font-black text-gblack text-sm">{p.nombre} {p.apellido}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{p.cargo || 'LOGISTICA'}</p>
                 </div>
                 <div className="bg-red-50 text-red-600 text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">AUSENTE</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="p-6 pb-24 space-y-6 animate-in fade-in slide-in-from-right-10 duration-500">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={() => setCurrentView(View.DASHBOARD)} className="w-10 h-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 active:scale-90 transition-all">
          <i className="fas fa-arrow-left"></i>
        </button>
        <h2 className="text-2xl font-black text-gblack tracking-tight">Sistema GGT</h2>
      </div>

      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 text-center">
        <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-3xl mb-6 shadow-inner ${state.isActivated ? 'bg-ggreen/10 text-ggreen' : 'bg-red-50 text-red-600'}`}>
          <i className={state.isActivated ? "fas fa-check-circle" : "fas fa-key"}></i>
        </div>
        <h3 className="text-xl font-black text-gblack mb-1 uppercase tracking-tight brand-font"><span className="text-ggreen">gate</span>gourmet PRO</h3>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-8">{state.isActivated ? 'Uso Profesional Activado' : `Versión de prueba: ${daysRemaining} días`}</p>
        {!state.isActivated && (
          <form onSubmit={handleManualActivation} className="space-y-4">
            <input type="password" inputMode="numeric" placeholder="••••" value={licenseCodeInput} onChange={(e) => setLicenseCodeInput(e.target.value)} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-2xl font-black tracking-widest focus:ring-8 focus:ring-ggreen/10 outline-none transition-all" />
            <button type="submit" className="w-full bg-ggreen text-white font-black py-5 rounded-2xl shadow-xl shadow-ggreen/20 active:scale-95 transition-all uppercase tracking-widest text-xs">Activar Licencia GGT</button>
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
               <p className="text-[8px] font-bold text-slate-400">Exportar base GateGourmet</p>
            </div>
         </div>
         <button onClick={exportMasterDatabase} className="bg-ggreen/10 text-ggreen px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-90 transition-all">Compartir</button>
      </div>
    </div>
  );

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
             <button onClick={() => deletePerson(existing.key)} className="w-full bg-red-50 text-red-600 font-black py-4 rounded-2xl flex items-center justify-center gap-3 border border-red-100 active:scale-95">
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
              <h2 className="text-2xl font-black text-gblack tracking-tight brand-font">{isEdit ? 'Editar Datos' : 'Inscripción GGT'}</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Base de Datos Central</p>
           </div>
        </div>
        <form onSubmit={isEdit ? handleEditSubmit : handleEnrollmentSubmit} className="space-y-4">
          <div className="bg-gblack p-5 rounded-2xl mb-4 border border-ggreen/20">
            <label className="text-[9px] uppercase font-black text-ggreen tracking-widest mb-1 block">Llave Maestra GGT</label>
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
              {isEdit ? 'ACTUALIZAR DATOS' : 'GUARDAR EN BASE GGT'}
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
            <h2 className="text-3xl font-black text-gblack tracking-tight leading-none brand-font"><span className="text-ggreen">gate</span>gourmet</h2>
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
    <div className="min-h-screen bg-slate-50 selection:bg-ggreen/10 relative overflow-x-hidden">
      {isLicenseExpired && <LicenseGuard onActivate={handleActivate} />}
      
      <header className="bg-gblack p-4 text-white flex items-center gap-3 shadow-2xl sticky top-0 z-[1000] rounded-b-3xl">
         <div className="w-10 h-10 border-2 border-ggreen rounded-xl flex items-center justify-center font-black shadow-lg shadow-ggreen/10 text-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-ggreen/10"></div>
            <span className="relative z-10 text-ggreen">g</span>
         </div>
         <div className="flex-1">
            <span className="text-sm font-black tracking-widest uppercase block leading-none brand-font"><span className="text-ggreen">gate</span>gourmet</span>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Control de Personal GGT</span>
         </div>
         <button onClick={() => setCurrentView(View.SETTINGS)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-white transition-all active:scale-90">
            <i className="fas fa-cog"></i>
         </button>
      </header>

      <main className="max-w-2xl mx-auto min-h-screen">
        {currentView === View.DASHBOARD && renderDashboard()}
        {currentView === View.PERSONNEL && renderPersonnel()}
        {currentView === View.REPORTS && renderReports()}
        {currentView === View.SETTINGS && renderSettings()}
        {currentView === View.ENROLLMENT && renderForm(false)}
        {currentView === View.EDIT_PERSON && renderForm(true)}
        {currentView === View.SHIFT_ACTION && renderShiftAction()}
        {currentView === View.CONFLICT && renderConflict()}
      </main>

      {renderBottomNav()}
      {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      
      {/* MARCA DE AGUA VISIBLE */}
      <div className="fixed bottom-24 right-4 text-[9px] font-black text-slate-400/50 uppercase pointer-events-none z-[1000] tracking-widest brand-font drop-shadow-sm">
        creado por Enrique Forero
      </div>
    </div>
  );
};

export default App;
