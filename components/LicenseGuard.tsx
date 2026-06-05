
import React, { useState } from 'react';
import { ACTIVATION_CODE } from '../constants';

interface LicenseGuardProps {
  onActivate: () => void;
}

export const LicenseGuard: React.FC<LicenseGuardProps> = ({ onActivate }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code === ACTIVATION_CODE) {
      onActivate();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleCancel = () => {
    window.location.href = "about:blank";
  };

  return (
    <div className="fixed inset-0 bg-gblack flex items-center justify-center z-[2000] p-4 text-white overflow-y-auto">
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full text-gblack border-t-[12px] border-ggreen my-auto">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-white border-2 border-ggreen rounded-full flex items-center justify-center shadow-lg overflow-hidden relative">
            <img src="/src/assets/images/promo_ambiental_logo_1780671403616.png" alt="CTP Logo" className="w-full h-full object-contain p-2" />
          </div>
        </div>
        
        <h2 className="text-2xl font-black text-center mb-2 tracking-tight uppercase brand-font text-gblack">Control de Personal CTP</h2>
        <p className="text-slate-400 text-[10px] font-black uppercase text-center tracking-widest mb-6">Filtro de Seguridad</p>
        
        <div className="bg-red-50 p-5 rounded-3xl mb-6 border border-red-100">
          <p className="text-red-700 text-[11px] font-black uppercase leading-tight text-center">
            EL PERIODO DE PRUEBA HA FINALIZADO. INGRESE SU CÓDIGO DE ACTIVACIÓN.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••"
              className={`w-full p-6 border-2 rounded-[1.5rem] text-center text-4xl font-black tracking-[0.5em] focus:ring-8 focus:ring-ggreen/10 outline-none transition-all ${error ? 'border-red-500 bg-red-50 animate-shake' : 'border-slate-100 bg-slate-50'}`}
            />
            {error && <p className="text-red-600 text-[10px] mt-3 text-center font-black uppercase tracking-widest">Código No Válido</p>}
          </div>
          
          <button
            type="submit"
            className="w-full bg-gblack hover:opacity-90 text-white font-black py-5 rounded-2xl shadow-2xl transition-all active:scale-[0.97] text-sm uppercase tracking-widest"
          >
            ACTIVAR SISTEMA
          </button>
          
          <button
            type="button"
            onClick={handleCancel}
            className="w-full bg-slate-50 text-slate-400 font-bold py-3 rounded-xl transition-colors text-[10px] uppercase tracking-widest"
          >
            SALIR
          </button>
        </form>
      </div>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};
