import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Rocket, ShieldCheck, Zap, X, BrainCircuit, Users } from 'lucide-react';
import { Button } from './ui/button';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';

interface WelcomeModalProps {
  user: any;
  onClose: () => void;
}

export function WelcomeModal({ user, onClose }: WelcomeModalProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const steps = [
    {
      title: "BIENVENIDO A LATQUIZ",
      subtitle: "La Red de Aprendizaje Gamificado",
      content: "Has sido reclutado para formar parte de la élite académica. LattQuiz no es solo una plataforma, es un simulador de alto rendimiento donde el conocimiento es tu arma más poderosa.",
      icon: BrainCircuit,
      color: "text-neon-blue",
      bgColor: "bg-neon-blue/10"
    },
    {
      title: "GAMIFICACIÓN TOTAL",
      subtitle: "Sube de nivel, gana wildcards",
      content: "Cada misión completada te otorga experiencia. Desbloquea comodines para sabotear a otros o protegerte en los eventos en vivo. ¡Lidera el ranking global!",
      icon: Zap,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10"
    },
    {
      title: "ALTO RENDIMIENTO",
      subtitle: "Monitoreo constante",
      content: "Nuestro motor analiza tu progreso en tiempo real. Mantén la integridad: el sistema detecta cambios de pestaña o uso de dispositivos externos. ¡Juega limpio!",
      icon: ShieldCheck,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    }
  ];

  const handleFinish = async () => {
    setLoading(true);
    try {
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          isFirstTime: false
        });
      }
      onClose();
    } catch (e) {
      console.error("Error setting welcome status", e);
      onClose();
    }
  };

  const current = steps[step];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-lg bg-card border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 w-full h-1 flex">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`flex-1 transition-all duration-500 ${i <= step ? 'bg-neon-blue' : 'bg-white/10'}`}
              />
            ))}
          </div>

          <div className="p-8 space-y-8">
            <div className="flex justify-center">
              <div className={`w-20 h-20 rounded-2xl ${current.bgColor} flex items-center justify-center relative group`}>
                <div className={`absolute inset-0 ${current.bgColor} blur-xl group-hover:blur-2xl transition-all`} />
                <current.icon className={`w-10 h-10 ${current.color} relative z-10`} />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black italic tracking-tighter text-foreground uppercase">{current.title}</h2>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${current.color}`}>{current.subtitle}</p>
            </div>

            <p className="text-sm text-center text-muted-foreground leading-relaxed italic px-4">
              "{current.content}"
            </p>

            <div className="flex gap-4 pt-4">
              {step > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => setStep(s => s - 1)}
                  className="flex-1 font-bold h-12 uppercase italic border-white/5"
                >
                  ATRÁS
                </Button>
              )}
              {step < steps.length - 1 ? (
                <Button 
                  onClick={() => setStep(s => s + 1)}
                  className="flex-1 bg-neon-blue text-black font-black h-12 uppercase italic shadow-[0_0_20px_rgba(0,243,255,0.3)]"
                >
                  SIGUIENTE
                </Button>
              ) : (
                <Button 
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black h-12 uppercase italic shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  {loading ? 'SINCRONIZANDO...' : '¡INICIAR MISIÓN!'}
                </Button>
              )}
            </div>
          </div>

          <div className="p-4 bg-secondary/20 border-t border-white/5 flex justify-center">
            <p className="text-[8px] font-mono uppercase tracking-[0.3em] opacity-40">Protocolo LattQuiz v4.0 Active</p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
