import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Gift, Zap, Sparkles, RefreshCw, Eye, ShieldAlert, CheckCircle2, HelpCircle } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { motion, AnimatePresence } from 'motion/react';
import { RIDDLES_BY_THEME } from './TreasureMission';
import { Input } from '@/components/ui/input';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';

export type WildcardType = '50_50' | 'EXTRA_POINTS' | 'CHANGE_QUESTION' | 'REVEAL_ANSWER';

export const WILDCARDS: Record<WildcardType, { name: string, icon: any, color: string, description: string }> = {
  '50_50': { name: '50/50', icon: ShieldAlert, color: 'text-orange-500', description: 'Elimina una opción incorrecta' },
  'EXTRA_POINTS': { name: 'Puntos Extra', icon: Zap, color: 'text-yellow-500', description: '+25% de puntos en la siguiente respuesta' },
  'CHANGE_QUESTION': { name: 'Cambiar Pregunta', icon: RefreshCw, color: 'text-blue-500', description: 'Cambia la pregunta actual' },
  'REVEAL_ANSWER': { name: 'Revelar Respuesta', icon: Eye, color: 'text-neon-purple', description: 'Muestra la respuesta correcta' }
};

export function DailyReward() {
  const { user } = useAuthStore();
  const [showGame, setShowGame] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [wonWildcard, setWonWildcard] = useState<WildcardType | null>(null);
  const [step, setStep] = useState<'START' | 'QUESTION' | 'RESULT'>('START');

  useEffect(() => {
    if (!user) return;
    const checkEligibility = async () => {
      const uDoc = await getDoc(doc(db, 'users', user.uid));
      if (uDoc.exists()) {
        const data = uDoc.data();
        const last = data.lastDailyRewardAt || 0;
        const now = Date.now();
        // Eligible if more than 24 hours passed
        if (now - last > 24 * 60 * 60 * 1000) {
          setEligible(true);
        }
      }
      setLoading(false);
    };
    checkEligibility();
  }, [user]);

  const claimReward = async () => {
    if (!user) return;
    const types: WildcardType[] = ['50_50', 'EXTRA_POINTS', 'CHANGE_QUESTION', 'REVEAL_ANSWER'];
    const won = types[Math.floor(Math.random() * types.length)];
    
    try {
      const uRef = doc(db, 'users', user.uid);
      const uSnap = await getDoc(uRef);
      const currentWildcards = uSnap.data()?.wildcards || {};
      currentWildcards[won] = (currentWildcards[won] || 0) + 1;
      
      await updateDoc(uRef, {
        wildcards: currentWildcards,
        lastDailyRewardAt: Date.now()
      });
      
      setWonWildcard(won);
      setStep('RESULT');
      setEligible(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !eligible) return null;

  return (
    <div className="mb-8">
      <AnimatePresence>
        {!showGame ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="border-neon-purple bg-gradient-to-r from-neon-purple/10 to-transparent border-2 overflow-hidden relative">
              <Sparkles className="absolute top-2 right-2 text-neon-purple animate-pulse" />
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-neon-purple flex items-center gap-2">
                    <Gift className="w-6 h-6" /> ¡Recompensa Diaria Disponible!
                  </h3>
                  <p className="text-sm text-muted-foreground">Demuestra tu conocimiento hoy y gana un comodín sorpresa.</p>
                </div>
                <Button onClick={() => setShowGame(true)} className="bg-neon-purple hover:bg-neon-purple/80 text-white font-bold px-8 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                  OBTENER PREMIO
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <Card className="w-full max-w-md border-neon-purple bg-card shadow-[0_0_50px_rgba(168,85,247,0.2)]">
              <CardHeader className="text-center border-b border-border/50">
                <CardTitle className="text-2xl font-black text-neon-purple">DESAFÍO DIARIO</CardTitle>
              </CardHeader>
              <CardContent className="p-8 text-center space-y-6">
                {step === 'START' && (
                  <>
                    <div className="w-24 h-24 bg-neon-purple/10 rounded-full flex items-center justify-center mx-auto border-2 border-neon-purple shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                      <BrainCircuit className="w-12 h-12 text-neon-purple" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">¿Listo para el desafío?</p>
                      <p className="text-muted-foreground text-sm">Responde una pregunta rápida para ganar tu recompensa.</p>
                    </div>
                    <Button onClick={() => setStep('QUESTION')} className="w-full bg-neon-purple text-white font-bold h-12">EMPEZAR</Button>
                  </>
                )}

                {step === 'QUESTION' && (
                  <DailyQuestion onCorrect={claimReward} onWrong={() => setShowGame(false)} />
                )}

                {step === 'RESULT' && wonWildcard && (
                  <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="space-y-6">
                    <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-emerald-500">¡LOGRADO!</p>
                      <p className="font-bold text-lg mt-2">Has ganado: {WILDCARDS[wonWildcard].name}</p>
                      <p className="text-sm text-muted-foreground">{WILDCARDS[wonWildcard].description}</p>
                    </div>
                    <Button onClick={() => setShowGame(false)} className="w-full bg-emerald-500 text-white font-bold">CERRAR Y CONTINUAR</Button>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DailyQuestion({ onCorrect, onWrong }: { onCorrect: () => void, onWrong: () => void }) {
  const [q, setQ] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const allThemes = Object.values(RIDDLES_BY_THEME).flat();
    const randomRiddle = allThemes[Math.floor(Math.random() * allThemes.length)];
    setQ(randomRiddle);
  }, []);

  const handleVerify = () => {
    if (isProcessing || !answer.trim() || !q) return;
    setIsProcessing(true);
    
    const normalizedInput = answer.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const normalizedAnswer = q.a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    setTimeout(() => {
      if (normalizedInput.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedInput)) {
        playSound.success();
        onCorrect();
      } else {
        playSound.error();
        notify('Respuesta incorrecta. El acertijo ha cambiado.', 'error');
        onWrong();
      }
    }, 1000);
  };

  if (!q) return <div className="py-12 text-center animate-pulse opacity-30 italic">Materializando Acertijo...</div>;

  return (
    <div className="space-y-6 text-center">
      <div className="p-6 bg-secondary/30 rounded-2xl border border-divider">
         <HelpCircle className="w-8 h-8 text-neon-purple mx-auto mb-4 opacity-50" />
         <h4 className="font-bold text-lg italic leading-relaxed text-white">"{q.q}"</h4>
      </div>
      
      <div className="space-y-3">
         <Input 
           placeholder="TU RESPUESTA..." 
           value={answer}
           onChange={e => setAnswer(e.target.value)}
           onKeyDown={e => e.key === 'Enter' && handleVerify()}
           className="h-14 bg-background border-neon-purple/30 text-center font-black uppercase text-lg tracking-widest focus:border-neon-purple"
         />
         <Button 
           onClick={handleVerify}
           disabled={isProcessing || !answer.trim()}
           className="w-full h-12 bg-neon-purple text-white font-black italic tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.3)]"
         >
           DESBLOQUEAR RECOMPENSA
         </Button>
      </div>
    </div>
  );
}

function BrainCircuit(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .52 8.205 4 4 0 0 0 7.503-.5 3 3 0 0 0 3.49-5.517c.1-.186.1-.4 0-.6a3 3 0 0 0-3.49-5.517 4 4 0 0 0-7.503-.5 4 4 0 0 0-.52 8.205 4 4 0 0 0 2.526 5.77A3 3 0 1 0 12 19" />
      <path d="M9 13a4.5 4.5 0 0 0 3-4" />
      <path d="M6.003 5.125A3 3 0 1 0 12 5" />
      <path d="M12 19a3 3 0 1 0 5.997-.125" />
      <path d="M21.003 14.125A3 3 0 1 0 15 14" />
      <path d="M12 5c0 1 0 2 0 3" />
      <path d="M12 16c0 1 0 2 0 3" />
      <path d="M8 12c1 0 2 0 3 0" />
      <path d="M13 12c1 0 2 0 3 0" />
    </svg>
  );
}
