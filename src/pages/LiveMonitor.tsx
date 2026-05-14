import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, ShieldCheck, ShieldAlert, MessageSquare, ArrowLeft, RefreshCw, Trophy, Zap, Clock, TowerControl as Tower } from 'lucide-react';
import { doc, onSnapshot, collection, updateDoc, getDoc, setDoc, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { notify } from '../components/NeonNotification';
import playSound from '../lib/sounds';
import { useAuthStore } from '../store/auth';

export function LiveMonitor() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [quiz, setQuiz] = useState<any>(null);
  const [showExemptDialog, setShowExemptDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [exemptionMessage, setExemptionMessage] = useState('Has sido eximido de esta prueba por el docente.');

  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [globalRankingsEnabled, setGlobalRankingsEnabled] = useState(true);

  // Listen to global config
  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'global'), (snap) => {
      if (snap.exists()) {
        setGlobalRankingsEnabled(snap.data().rankingsEnabled !== false);
      }
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !user) return;

    // Load session
    const unsubSession = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as any;
        setSession(data);
        
        // Load quiz
        getDoc(doc(db, 'quizzes', data.quizId)).then(qSnap => {
          if (qSnap.exists()) setQuiz(qSnap.data());
        });
      } else {
        notify('Sesión no encontrada', 'error');
        navigate('/teacher/missions');
      }
    });

    // Load participants with limit to avoid quota issues in massive sessions
    let unsubP: () => void;
    
    if (session?.rankingsSuspended || !globalRankingsEnabled) {
      // If suspended, fetch once and don't listen
      const fetchOnce = async () => {
        try {
          const { getDocs } = await import('firebase/firestore');
          const snap = await getDocs(query(collection(db, `sessions/${sessionId}/participants`), limit(200)));
          setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {}
      };
      fetchOnce();
      unsubP = () => {};
    } else {
      unsubP = onSnapshot(query(collection(db, `sessions/${sessionId}/participants`), limit(200)), (snap) => {
        setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (error) => {
        console.warn('LiveMonitor participants listener failed:', error.message);
      });
    }

    return () => {
      unsubSession();
      unsubP();
    };
  }, [sessionId, user, navigate, session?.rankingsSuspended, globalRankingsEnabled]);

  const handleExemptStudent = async () => {
    if (!selectedStudent || !sessionId) return;
    
    try {
      const pRef = doc(db, `sessions/${sessionId}/participants`, selectedStudent.id);
      await updateDoc(pRef, {
        isExempt: true,
        exemptionMessage: exemptionMessage,
        status: 'EXEMPTED'
      });
      
      notify(`${selectedStudent.displayName} ha sido eximido.`, 'success');
      playSound.success();
      setShowExemptDialog(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error(error);
      notify('Error al eximir al alumno', 'error');
    }
  };

  const removeExemption = async (student: any) => {
     try {
        const pRef = doc(db, `sessions/${sessionId}/participants`, student.id);
        await updateDoc(pRef, {
          isExempt: false,
          exemptionMessage: null,
          status: 'ACTIVE'
        });
        notify(`Exención removida para ${student.displayName}`, 'success');
        playSound.click();
     } catch (e) {
        notify('Error al remover exención', 'error');
     }
  };

  if (!session || !quiz) return <div className="p-12 text-center font-mono animate-pulse">CARGANDO MONITOR NEURAL...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase text-white drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
            Monitor de Sesión En Vivo
          </h1>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-3 h-3 text-neon-blue" /> Actualización en tiempo real • {quiz.title}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
           <Badge className="bg-neon-blue/20 text-neon-blue border-neon-blue px-4 py-1 font-black">
             {participants.length} CONECTADOS
           </Badge>
           <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500 px-4 py-1 font-black">
             {participants.filter(p => !p.isExempt).length} ACTIVOS
           </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className={`bg-black/40 border-border/40 backdrop-blur-xl transition-all ${(session?.rankingsSuspended || !globalRankingsEnabled) ? 'opacity-50 grayscale' : ''}`}>
           <CardHeader>
              <CardTitle className="text-sm font-black uppercase text-neon-blue flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Líderes de la Misión {(session?.rankingsSuspended || !globalRankingsEnabled) && '(SUSPENDIDO)'}
              </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
              {(session?.rankingsSuspended || !globalRankingsEnabled) ? (
                <div className="py-10 text-center space-y-2">
                  <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto animate-pulse" />
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">Ranking Temporalmente Detenido</p>
                  <p className="text-[8px] text-muted-foreground uppercase font-mono max-w-[120px] mx-auto">
                    {!globalRankingsEnabled ? 'Pausado globalmente por administración.' : 'Para optimizar recursos de la red neural.'}
                  </p>
                </div>
              ) : (
                participants
                  .filter(p => !p.isExempt)
                  .sort((a, b) => (b.score || 0) - (a.score || 0))
                  .slice(0, 5)
                  .map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/10 border border-white/5">
                      <div className="flex items-center gap-3">
                         <span className="text-xs font-mono opacity-50">#{i+1}</span>
                         <span className="text-sm font-bold truncate max-w-[120px]">{p.displayName}</span>
                      </div>
                      <span className="text-neon-blue font-black">{p.score || 0} pts</span>
                    </div>
                  ))
              )}
              {!session?.rankingsSuspended && participants.length === 0 && <p className="text-xs text-center opacity-30 italic">No hay actividad aún</p>}
           </CardContent>
        </Card>

        {session.type === 'LA_TORRE' && session.teams && (
          <Card className="bg-black/40 border-neon-blue/20 backdrop-blur-xl md:col-span-3">
            <CardHeader className="border-b border-white/5">
               <CardTitle className="text-sm font-black uppercase text-neon-blue flex items-center gap-2">
                 <Tower className="w-4 h-4" /> Estado de Construcción: Juego de la Torre
               </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-12 items-end min-h-[300px]">
                  {session.teams.map((t: any, idx: number) => {
                    const floors = t.towerFloors || 0;
                    return (
                      <div key={idx} className="flex flex-col items-center gap-4">
                        <div className="relative flex flex-col-reverse items-center w-full">
                           {/* Base */}
                           <div className="w-32 h-2 bg-white/10 rounded-full mb-2"></div>
                           
                           {[...Array(Math.min(floors, 20))].map((_, i) => (
                             <motion.div 
                               key={i}
                               initial={{ scale: 0, y: 50 }}
                               animate={{ scale: 1, y: 0 }}
                               className={`w-24 h-6 mb-1 rounded-sm border-2 relative flex items-center justify-center ${idx === 0 ? 'bg-neon-blue/30 border-neon-blue' : 'bg-neon-purple/30 border-neon-purple'}`}
                             >
                                <span className="text-[8px] font-black opacity-20">{t.name.slice(0, 3)}</span>
                             </motion.div>
                           ))}
                           
                           {floors > 20 && (
                             <div className="text-xs font-black text-neon-blue animate-pulse mb-4">
                                +{floors - 20} PISOS ADICIONALES
                             </div>
                           )}
                        </div>
                        <div className="text-center space-y-1">
                           <p className="text-xl font-black italic tracking-tighter truncate max-w-[150px]">{t.name}</p>
                           <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                              <div 
                                className={`h-full transition-all duration-1000 ${t.towerStability < 30 ? 'bg-red-500 animate-pulse' : t.towerStability < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${t.towerStability || 100}%` }}
                              />
                           </div>
                           <p className="text-[7px] uppercase font-mono opacity-40">Estabilidad: {t.towerStability || 100}%</p>
                           <div className="flex justify-center gap-4 pt-2">
                              <div className="flex flex-col items-center">
                                 <span className="text-[8px] uppercase font-mono opacity-50">Altura</span>
                                 <span className="text-lg font-black">{floors}f</span>
                              </div>
                              <div className="flex flex-col items-center">
                                 <span className="text-[8px] uppercase font-mono opacity-50">Huecos</span>
                                 <span className="text-lg font-black text-neon-pink">{(t.towerGaps || []).length}</span>
                              </div>
                           </div>
                        </div>
                      </div>
                    );
                  })}
               </div>
               
               <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-2">
                  <p className="text-xs font-black text-muted-foreground uppercase opacity-40">Jugador en Turno de Respuesta</p>
                  <div className="px-6 py-2 bg-neon-blue/10 border border-neon-blue/30 rounded-full animate-pulse">
                     <p className="text-neon-blue font-black italic">{session.currentTurnPlayerName || 'Sincronizando...'}</p>
                  </div>
               </div>
            </CardContent>
          </Card>
        )}

        <div className="md:col-span-2 space-y-4">
           <div className="bg-secondary/10 border border-border/40 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-neon-blue/20 flex items-center justify-center border border-neon-blue/40">
                    <Users className="w-6 h-6 text-neon-blue" />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg">Listado de Alumnos</h3>
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">Control y Supervisión Académica</p>
                 </div>
              </div>
              <div className="text-xs font-mono opacity-60">
                 Código: <span className="text-neon-blue font-black">{session.joinCode}</span>
              </div>
           </div>

           <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[600px] pr-2">
              <AnimatePresence mode="popLayout">
                {participants.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                      p.isExempt 
                      ? 'bg-amber-500/5 border-amber-500/20 grayscale' 
                      : 'bg-card/60 border-white/5 hover:border-neon-blue/30 shadow-lg'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        p.isExempt ? 'border-amber-500/40 bg-amber-500/10' : 'border-neon-blue/40 bg-neon-blue/10'
                      }`}>
                        {p.isExempt ? <ShieldAlert className="w-5 h-5 text-amber-500" /> : <ShieldCheck className="w-5 h-5 text-neon-blue" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold ${p.isExempt ? 'text-amber-500' : 'text-white'}`}>{p.displayName}</h4>
                          {p.isExempt && <Badge variant="outline" className="text-[8px] h-4 border-amber-500 text-amber-500 uppercase">Exento</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">ID: {p.id.slice(0, 8)}...</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                         <p className="text-[9px] uppercase font-mono opacity-50">Calificación</p>
                         <p className={`font-black ${p.isExempt ? 'text-white/30' : 'text-neon-purple'}`}>{p.score || 0}</p>
                      </div>
                      
                      {p.isExempt ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeExemption(p)}
                          className="h-9 px-4 text-amber-500 hover:bg-amber-500/10 gap-2 border border-amber-500/30"
                        >
                          <RefreshCw className="w-4 h-4" /> REINTEGRAR
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedStudent(p);
                            setShowExemptDialog(true);
                          }}
                          className="h-9 px-4 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 bg-amber-500/5 font-black italic tracking-tighter"
                        >
                          <ShieldAlert className="w-4 h-4 mr-2" /> EXIMIR
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
           </div>
        </div>
      </div>

      <Dialog open={showExemptDialog} onOpenChange={setShowExemptDialog}>
         <DialogContent className="bg-black/90 border-amber-500/50 backdrop-blur-2xl">
            <DialogHeader>
               <DialogTitle className="text-2xl font-black italic text-amber-500 uppercase flex items-center gap-3">
                  <ShieldAlert className="w-8 h-8" /> Eximir Alumno
               </DialogTitle>
               <DialogDescription className="text-muted-foreground mt-2">
                  Estás a punto de eximir a <span className="text-white font-bold">{selectedStudent?.displayName}</span> de esta evaluación. 
                  El alumno verá un mensaje especial y ya no sumará puntos en el ranking.
               </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
               <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-amber-500/70">Mensaje Personalizado</Label>
                  <Input 
                    placeholder="Escribe el motivo o mensaje..." 
                    value={exemptionMessage}
                    onChange={e => setExemptionMessage(e.target.value)}
                    className="bg-white/5 border-amber-500/20 text-sm h-12"
                  />
               </div>
            </div>
            <DialogFooter>
               <Button variant="ghost" onClick={() => setShowExemptDialog(false)}>CANCELAR</Button>
               <Button 
                  onClick={handleExemptStudent}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-black uppercase italic tracking-widest px-8"
               >
                  CONFIRMAR EXENCIÓN
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
}
