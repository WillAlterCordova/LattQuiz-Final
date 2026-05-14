import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, RefreshCw, X, Copy, CheckCircle2, ShieldX, Database, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import playSound from '../lib/sounds';

interface AlertDetails {
  title: string;
  message: string;
  recommendation: string;
  category: string;
  technical?: string;
}

export function SystemAlertModal() {
  const [alert, setAlert] = useState<AlertDetails | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleAlert = (event: CustomEvent<AlertDetails>) => {
      setAlert(event.detail);
      setIsOpen(true);
      playSound.error();
    };

    window.addEventListener('system-alert' as any, handleAlert);
    return () => window.removeEventListener('system-alert' as any, handleAlert);
  }, []);

  const close = () => {
    setIsOpen(false);
    setTimeout(() => setAlert(null), 300);
  };

  const copyToClipboard = () => {
    if (!alert) return;
    const text = `
ERROR: ${alert.title}
MESSAGE: ${alert.message}
RECOMMENDATION: ${alert.recommendation}
TECHNICAL: ${alert.technical || 'N/A'}
CONTEXT: ${window.location.href}
    `.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'DATABASE': return <Database className="w-8 h-8 text-neon-blue" />;
      case 'AUTH': return <ShieldX className="w-8 h-8 text-neon-pink" />;
      case 'AI': return <Zap className="w-8 h-8 text-neon-purple" />;
      default: return <ShieldAlert className="w-8 h-8 text-white" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && alert && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-black border-2 border-neon-pink/50 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(255,0,160,0.3)]"
          >
            {/* Header / Alert Banner */}
            <div className="bg-neon-pink/10 border-b border-neon-pink/20 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-neon-pink/20 rounded-2xl ring-1 ring-neon-pink/50 animate-pulse">
                  {getCategoryIcon(alert.category)}
                </div>
                <div>
                  <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">
                    {alert.title}
                  </h2>
                  <p className="text-[10px] font-bold text-neon-pink/60 uppercase tracking-[0.2em]">
                    Estado de Emergencia Nivel {alert.category === 'DATABASE' ? 'I' : 'II'}
                  </p>
                </div>
              </div>
              <button 
                onClick={close}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-white font-medium leading-relaxed">
                  {alert.message}
                </p>
              </div>

              <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/10 italic">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-neon-blue rounded-full animate-ping" />
                  <span className="text-[10px] font-black uppercase text-neon-blue tracking-widest">Protocolo de solución</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {alert.recommendation}
                </p>
              </div>

              {alert.technical && (
                <div className="space-y-2 opacity-40 hover:opacity-100 transition-opacity">
                   <p className="text-[9px] font-bold text-muted-foreground uppercase">Datos Técnicos</p>
                   <code className="block p-3 bg-secondary/50 rounded-lg text-[10px] font-mono whitespace-pre-wrap break-all">
                     {alert.technical}
                   </code>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-secondary/20 flex gap-3">
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
                className="flex-1 border-white/10 hover:bg-white/5 text-white font-black italic uppercase text-xs h-12"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Reiniciar Enlace
              </Button>
              <Button 
                onClick={copyToClipboard}
                className="flex-1 bg-neon-pink hover:bg-neon-pink/80 text-white font-black italic uppercase text-xs h-12"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copiado' : 'Reportar Falla'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
