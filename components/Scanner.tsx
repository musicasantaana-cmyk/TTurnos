
import React, { useEffect, useRef, useState } from 'react';

declare const Html5Qrcode: any;

interface ScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const regionId = "qr-reader-target";

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(regionId);
    scannerRef.current = html5QrCode;

    const config = { 
      fps: 15, 
      qrbox: { width: 280, height: 280 },
      aspectRatio: 1.0 
    };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText: string) => {
        html5QrCode.stop().then(() => {
          onScan(decodedText);
        }).catch(() => {
          onScan(decodedText);
        });
      },
      (errorMessage: string) => {}
    ).then(() => {
      setIsReady(true);
    }).catch((err: any) => {
      setError("No se pudo acceder a la cámara. Verifique los permisos.");
      console.error(err);
    });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((e: any) => console.error(e));
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-gblack z-[1000] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden relative shadow-2xl">
        <div className="bg-gblack p-4 flex justify-between items-center text-white border-b border-white/5">
          <span className="font-bold flex items-center gap-2 brand-font">
            <i className="fas fa-camera text-ggreen"></i>
            LECTOR <span className="text-ggreen">CTP</span>
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="relative aspect-square bg-black">
          <div id={regionId} className="w-full h-full"></div>
          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gblack/80">
              <div className="w-10 h-10 border-4 border-ggreen border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Iniciando Cámara...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-red-900/90 p-6 text-center">
              <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
              <p className="font-bold mb-2 uppercase text-xs">Error de Sistema</p>
              <p className="text-sm opacity-90">{error}</p>
              <button onClick={onClose} className="mt-6 bg-white text-red-600 px-6 py-2 rounded-full font-bold">CERRAR</button>
            </div>
          )}
          
          {isReady && (
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
              <div className="w-full h-full border-2 border-ggreen/50 rounded-sm relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-ggreen"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-ggreen"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-ggreen"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-ggreen"></div>
                <div className="absolute top-0 left-0 w-full h-[2px] bg-ggreen animate-[scan_2s_infinite]"></div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 text-center bg-white">
          <p className="text-gblack font-black text-lg mb-1 brand-font uppercase">Control de Paso</p>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Escanee el código para validar la asistencia.</p>
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        #${regionId} video {
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
};
