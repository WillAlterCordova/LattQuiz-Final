import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export function QuotaExhaustedBanner() {
  const [isQuotaExhausted, setIsQuotaExhausted] = React.useState(false);

  React.useEffect(() => {
    // Check if session has hit quota
    const checkStatus = () => {
      const exhausted = sessionStorage.getItem('QUOTA_EXHAUSTED') === 'true';
      setIsQuotaExhausted(exhausted);
    };

    checkStatus();
    window.addEventListener('storage', checkStatus);
    // Custom event for same-window updates
    window.addEventListener('quota_exceeded', checkStatus);
    
    return () => {
      window.removeEventListener('storage', checkStatus);
      window.removeEventListener('quota_exceeded', checkStatus);
    };
  }, []);

  if (!isQuotaExhausted) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-neon-pink text-black px-4 py-2 flex items-center justify-between gap-4 font-black italic animate-in slide-in-from-top duration-500 shadow-[0_4px_20px_rgba(255,0,255,0.4)]">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 animate-pulse" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 leading-none">
          <span className="text-xs uppercase tracking-tighter sm:text-sm">LÍMITE DE PROCESAMIENTO EXCEDIDO</span>
          <span className="text-[10px] opacity-70 uppercase font-mono tracking-tighter hidden sm:inline">| MODO DE EMERGENCIA ACTIVO</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden md:block text-[9px] uppercase max-w-[300px] leading-tight text-black/60 mr-4">
          Google ha pausado el servidor. Si estás en PLAN BLAZE, revisa tu "Tope de Presupuesto" en Billing. Si eres SPARK, has superado las 50k lecturas.
        </p>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => {
            sessionStorage.removeItem('QUOTA_EXHAUSTED');
            window.location.reload();
          }}
          className="bg-black text-neon-pink hover:bg-black/80 h-7 text-[10px] font-black uppercase shadow-lg border border-neon-pink/20"
        >
          <RefreshCw className="mr-1 h-3 w-3" /> RECONECTAR
        </Button>
      </div>
    </div>
  );
}
