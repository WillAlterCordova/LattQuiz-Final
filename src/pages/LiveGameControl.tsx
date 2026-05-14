import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trophy, Users, Play, SkipForward, Power, Crown, UserPlus, ArrowRight, Copy } from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs, setDoc, deleteDoc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { errorService } from '../services/errorService';
import { useAuthStore } from '../store/auth';
import { notify } from '../components/NeonNotification';
import playSound from '../lib/sounds';

export default function LiveGameControl() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
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
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() });
      } else {
        navigate('/teacher/missions');
      }
    });

    const unsubParticipants = onSnapshot(query(collection(db, `sessions/${sessionId}/participants`), limit(200)), (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.warn('LiveGameControl participants listener failed:', error.message);
    });

    return () => {
      unsub();
      unsubParticipants();
    };
  }, [sessionId, navigate]);

  useEffect(() => {
    if (session?.quizId) {
      getDocs(collection(db, `quizzes/${session.quizId}/questions`)).then(snap => {
        setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [session?.quizId]);

  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);

  useEffect(() => {
    if (session?.status === 'LOBBY' && (session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') && !session.config?.isClassroom) {
      if (participants.length >= 6 && !autoStartTimer) {
        setAutoStartTimer(60); // 1 minute wait
      }
      if (participants.length >= 12 && session.status === 'LOBBY') {
        startGame();
      }
    }
  }, [participants.length, session?.status, session?.type, autoStartTimer]);

  useEffect(() => {
    let interval: any;
    if (autoStartTimer && autoStartTimer > 0) {
      interval = setInterval(() => {
        setAutoStartTimer(prev => (prev || 0) - 1);
        if ((autoStartTimer || 0) <= 5) playSound.timerTick();
      }, 1000);
    } else if (autoStartTimer === 0) {
      startGame();
      setAutoStartTimer(null);
    }
    return () => clearInterval(interval);
  }, [autoStartTimer]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`${label} copiado al portapapeles`, 'success');
    playSound.success();
  };

  const cancelAutoStart = () => {
    setAutoStartTimer(null);
    notify('Inicio automático cancelado', 'info');
  };

  const startGame = async () => {
    if (!sessionId || questions.length === 0) return;
    try {
      let extraData: any = {};
      
      if (session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') {
        if (session.config?.isClassroom) {
          // Modo Presencial
          extraData.currentTurnTeam = 0;
          extraData.stealingAllowed = false;
          
          const teamA = session.teams?.[0];
          if (teamA?.manualMembers) {
            const members = teamA.manualMembers.split(',').map((s: string) => s.trim());
            extraData.currentTurnPlayerName = members[Math.floor(Math.random() * members.length)];
          }
        } else {
          // Modo en Línea
          const shuffled = participants.sort(() => Math.random() - 0.5);
          if (shuffled.length >= 2) {
            const mid = Math.floor(shuffled.length / 2);
            const teamA = shuffled.slice(0, mid);
            const teamB = shuffled.slice(mid);
            
            extraData.teams = [
              { 
                name: 'Equipo Alpha', 
                members: teamA.map(p => p.id), 
                score: 0, 
                towerFloors: 0,
                towerStability: 100,
                towerGaps: [] 
              },
              { 
                name: 'Equipo Omega', 
                members: teamB.map(p => p.id), 
                score: 0, 
                towerFloors: 0,
                towerStability: 100,
                towerGaps: []
              }
            ];
            
            if (session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') {
              extraData.currentTurnTeam = 0;
              const player = teamA[Math.floor(Math.random() * teamA.length)];
              extraData.currentTurnPlayerId = player.id;
              extraData.currentTurnPlayerName = player.displayName;
              extraData.gameLog = [`El juego ha comenzado. Turno de ${player.displayName}`];
            }
          }
        }
      }

      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'IN_PROGRESS',
        currentQuestionIndex: 0,
        startTime: Date.now(),
        questionStartTime: Date.now(),
        ...extraData
      });
    } catch (e) {
      errorService.handle(e, 'Start Game');
    }
  };

  const toggleRankings = async () => {
    if (!sessionId || !session) return;
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        rankingsSuspended: !session.rankingsSuspended
      });
      notify(session.rankingsSuspended ? 'Rankings reactivados' : 'Rankings suspendidos temporalmente', 'info');
      playSound.click();
    } catch (e) {
      errorService.handle(e, 'Toggle Rankings');
    }
  };

  const nextQuestion = async () => {
    if (!sessionId || !session) return;
    const nextIndex = session.currentQuestionIndex + 1;
    if (nextIndex >= questions.length) {
      await updateDoc(doc(db, 'sessions', sessionId), { status: 'FINISHED' });
    } else {
      // Reset participant flags for new round
      const pSnaps = await getDocs(collection(db, `sessions/${sessionId}/participants`));
      const batch: Promise<any>[] = pSnaps.docs.map(d => updateDoc(doc(db, `sessions/${sessionId}/participants`, d.id), { answeredThisRound: false }));
      await Promise.all(batch);

      let extraData: any = {
        stealingAllowed: false,
        lastResponseCorrect: null
      };

      if (session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') {
        if (session.config?.isClassroom) {
          // Rotate turn based on who just finished the previous question
          const nextTeamIdx = (session.currentTurnTeam + 1) % (session.teams?.length || 2);
          extraData.currentTurnTeam = nextTeamIdx;
          
          const nextTeam = session.teams?.[nextTeamIdx];
          if (nextTeam?.manualMembers) {
            const members = nextTeam.manualMembers.split(',').map((s: string) => s.trim());
            extraData.currentTurnPlayerName = members[Math.floor(Math.random() * members.length)];
          }
        } else if (session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') {
          // Online Mode: Pick next team and random player
          const nextTeamIdx = (session.currentTurnTeam + 1) % session.teams.length;
          const nextTeam = session.teams[nextTeamIdx];
          const nextPlayerId = nextTeam.members[Math.floor(Math.random() * nextTeam.members.length)];
          const nextPlayer = participants.find(p => p.id === nextPlayerId);
          
          extraData.currentTurnTeam = nextTeamIdx;
          extraData.currentTurnPlayerId = nextPlayerId;
          extraData.currentTurnPlayerName = nextPlayer?.displayName || 'Desconocido';
          extraData.gameLog = [
             ...(session.gameLog || []).slice(-5),
             `Turno de ${nextPlayer?.displayName} (${nextTeam.name})`
          ];
        }
      }

      await updateDoc(doc(db, 'sessions', sessionId), {
        currentQuestionIndex: nextIndex,
        questionStartTime: Date.now(),
        ...extraData
      });
    }
  };

  const endSession = async () => {
    if (!sessionId) return;
    if (confirm('¿Estás seguro de finalizar la sesión?')) {
      await updateDoc(doc(db, 'sessions', sessionId), { status: 'FINISHED' });
      navigate('/teacher/missions');
    }
  };

  if (!session) return <div className="p-12 text-center text-neon-blue animate-pulse">Cargando sesión...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple uppercase tracking-tighter">
            Control Live: {session.quizTitle}
          </h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Código de Acceso: <span className="font-mono text-xl font-bold text-white selection:bg-neon-blue">{session.joinCode || sessionId?.slice(-6).toUpperCase()}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-muted-foreground hover:text-neon-blue"
              onClick={() => copyToClipboard(session.joinCode || sessionId?.slice(-6).toUpperCase() || '', 'Código')}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </p>
        </div>
        <div className="flex gap-3">
          {session.status === 'LOBBY' && (
            <Button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-600 neo-glow font-bold">
              <Play className="mr-2 h-4 w-4" /> INICIAR PRUEBA
            </Button>
          )}
          {session.status === 'IN_PROGRESS' && (
             <Button onClick={nextQuestion} variant="outline" className="border-neon-blue text-neon-blue">
               <SkipForward className="mr-2 h-4 w-4" /> SIGUIENTE PREGUNTA
             </Button>
          )}
          <Button 
            onClick={toggleRankings} 
            disabled={!globalRankingsEnabled}
            variant="outline" 
            className={`transition-all ${
              !globalRankingsEnabled 
                ? 'opacity-50 cursor-not-allowed border-muted-foreground/30' 
                : session.rankingsSuspended 
                  ? 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                  : 'border-neon-purple text-neon-purple'
            }`}
          >
            <Trophy className={`mr-2 h-4 w-4 ${session.rankingsSuspended && globalRankingsEnabled ? 'animate-pulse' : ''}`} />
            {!globalRankingsEnabled 
              ? 'RANKINGS PAUSADOS POR ADMIN' 
              : session.rankingsSuspended 
                ? 'REANUDAR RANKINGS' 
                : 'SUSPENDER RANKINGS'}
          </Button>
          <Button onClick={endSession} variant="destructive">
            <Power className="mr-2 h-4 w-4" /> TERMINAR
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {session.status === 'LOBBY' ? (
            <Card className="border-neon-blue/30 bg-card/60 backdrop-blur-xl p-12 text-center">
              <div className="max-w-md mx-auto space-y-6">
                <Users className="w-20 h-20 text-neon-blue mx-auto opacity-50" />
                <h2 className="text-3xl font-bold">Lobby de Espera</h2>
                {autoStartTimer !== null && (
                   <div className="bg-neon-pink/10 border border-neon-pink/30 p-4 rounded-xl flex flex-col items-center gap-2">
                     <span className="text-neon-pink font-bold animate-pulse">
                        Iniciando en {autoStartTimer} segundos...
                     </span>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       onClick={cancelAutoStart}
                       className="text-[10px] text-neon-pink/60 hover:text-neon-pink hover:bg-neon-pink/10 h-7 uppercase font-black"
                     >
                        Cancelar Inicio Automático
                     </Button>
                   </div>
                )}
                <p className="text-muted-foreground text-lg">Pide a tus alumnos que entren al dashboard y se unan a esta misión.</p>
                <div className="bg-secondary/50 p-6 rounded-2xl border border-border">
                  <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Conectados</p>
                  <p className="text-6xl font-black text-neon-blue">{participants.length}</p>
                </div>
              </div>
            </Card>
          ) : session.status === 'IN_PROGRESS' && session.type === 'A_LA_CIMA' ? (
            <div className="space-y-6">
              <Card className="border-neon-blue/20 bg-card/40 p-8 min-h-[500px] relative overflow-hidden flex flex-col items-center">
                 <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <div className="w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(0,243,255,0.4),transparent)]"></div>
                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-neon-blue/20 to-transparent"></div>
                 </div>
                 
                 <div className="relative z-10 w-full text-center mb-8">
                    <h2 className="text-4xl font-black italic text-neon-blue tracking-tighter">¡CUMBRE DE SABIDURÍA!</h2>
                    <p className="text-sm text-muted-foreground">Sube a la cima respondiendo rápido y sin errores.</p>
                 </div>

                 {/* The Mountain Track */}
                 <div className="flex-1 w-full max-w-lg relative flex flex-col justify-between py-10">
                    <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-t from-border/50 via-neon-blue/50 to-emerald-500 shadow-[0_0_10px_rgba(0,243,255,0.2)] -translate-x-1/2"></div>
                    
                    {/* Goal Line */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                       <Trophy className="w-12 h-12 text-yellow-500 animate-bounce mx-auto drop-shadow-lg" />
                       <span className="text-[10px] font-black text-yellow-500 uppercase">LA CIMA</span>
                    </div>

                    {/* Participant Nodes */}
                    <div className="relative w-full h-[400px]">
                       {participants.map((p, i) => {
                          // Max score for climax usually depends on quiz length. Let's assume 100 is "high" or dynamic
                          const maxScorePossible = questions.length * 50; 
                          const progress = Math.min(100, (p.score / (maxScorePossible || 1)) * 100);
                          const verticalPos = 100 - progress;
                          
                          return (
                            <div 
                              key={p.id} 
                              className="absolute left-1/2 -translate-x-1/2 transition-all duration-1000 ease-out flex items-center gap-2"
                              style={{ top: `${verticalPos}%` }}
                            >
                               <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-lg ${i === 0 ? 'bg-neon-blue border-white text-black' : 'bg-background border-neon-blue text-neon-blue'}`}>
                                  {p.displayName?.slice(0, 2).toUpperCase()}
                               </div>
                               <div className="hidden md:block bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] border border-white/10 whitespace-nowrap">
                                  {p.displayName} <span className="text-neon-blue font-bold ml-1">{p.score}</span>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>

                 <div className="w-full mt-auto pt-6 border-t border-border/50 text-center">
                    <p className="text-xl font-bold">{questions[session.currentQuestionIndex]?.text}</p>
                 </div>
              </Card>
              
              <div className="flex justify-center gap-4">
                 <Button onClick={nextQuestion} size="lg" className="bg-neon-blue text-black font-black hover:bg-neon-blue/80 px-10">
                    SIGUIENTE RETO <ArrowRight className="ml-2 w-5 h-5" />
                 </Button>
              </div>
            </div>
          ) : session.status === 'IN_PROGRESS' ? (
            <LiveQuestionDisplay 
              question={questions[session.currentQuestionIndex]} 
              participants={participants} 
              index={session.currentQuestionIndex}
              total={questions.length}
              session={session}
              sessionId={sessionId as string}
            />
          ) : (
            <Card className="border-neon-purple/30 bg-card/60 p-12 text-center space-y-6">
               <Trophy className="w-20 h-20 text-yellow-500 mx-auto drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
               <h2 className="text-3xl font-bold">¡Misión Concluida!</h2>
               
               {session.type === 'POR_EQUIPOS' && session.teams ? (
                 <div className="space-y-8">
                    <div className="flex justify-center gap-8">
                       {session.teams.map((t: any, i: number) => (
                          <div key={i} className={`p-8 rounded-3xl border-2 ${t.score === Math.max(...session.teams.map((team:any)=>team.score)) ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.3)] animate-bounce' : 'bg-card border-border opacity-60'}`}>
                             <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t.score === Math.max(...session.teams.map((team:any)=>team.score)) ? '🏆 GANADOR' : 'FINALISTA'}</p>
                             <h3 className="text-2xl font-black">{t.name}</h3>
                             <p className="text-4xl font-bold text-neon-blue mt-2">{t.score} PTS</p>
                          </div>
                       ))}
                    </div>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {participants.sort((a,b) => b.score - a.score).slice(0, 3).map((p, i) => (
                      <div key={p.id} className={`p-6 rounded-xl border ${i === 0 ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-card border-border'}`}>
                         <p className="text-lg font-bold truncate">{p.displayName}</p>
                         <p className="text-2xl font-black">{p.score} pts</p>
                         <p className="text-xs uppercase text-muted-foreground mt-2">{i+1}º LUGAR</p>
                      </div>
                    ))}
                 </div>
               )}
            </Card>
          )}

          {session.type === 'POR_EQUIPOS' && session.config?.isClassroom && session.status === 'LOBBY' && (
             <TeamConfig session={session} sessionId={sessionId as string} />
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-card/40 backdrop-blur-md sticky top-6">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg flex justify-between items-center">
                Ranking en Vivo <Trophy className="w-5 h-5 text-yellow-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
              <div className="divide-y divide-border">
                {participants.sort((a,b) => b.score - a.score).map((p, i) => (
                  <div key={p.id} className="flex justify-between items-center p-4 hover:bg-secondary/20 transition-colors group">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? 'bg-yellow-500 text-black' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[120px]">{p.displayName}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[8px] font-mono text-muted-foreground uppercase">{p.id.slice(0,8)}...</span>
                          <button 
                            onClick={() => copyToClipboard(p.id, 'ID de Usuario')}
                            className="text-[8px] text-neon-blue hover:underline uppercase font-bold"
                          >
                            Copiar ID
                          </button>
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-neon-blue">{p.score}</span>
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="p-8 text-center text-sm text-muted-foreground italic">Esperando jugadores...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LiveQuestionDisplay({ question, participants, index, total, session, sessionId }: { question: any, participants: any[], index: number, total: number, session: any, sessionId: string }) {
  if (!question) return null;
  const answeredCount = participants.filter(p => p.answeredThisRound).length;

  const handleTurnResponse = async (teamIdx: number, isCorrect: boolean) => {
    if (!session.teams || !sessionId) return;
    const newTeams = [...session.teams];
    
    if (isCorrect) {
      newTeams[teamIdx].score += (question.points || 10);
      
      // Requirement: Turn passes to the team that rob/answer correctly
      // So set currentTurnTeam to the successful one for the potential next steal or just tracking
      await updateDoc(doc(db, 'sessions', sessionId), { 
        teams: newTeams,
        lastResponseCorrect: true,
        stealingAllowed: false,
        currentTurnTeam: teamIdx // Momentum stays/shifts to this team
      });
      notify(`¡Puntos para ${newTeams[teamIdx].name}!`, 'success');
      playSound.success();
    } else {
      // If error, other team can steal if it hasn't been stolen already
      if (!session.stealingAllowed) {
        const otherTeamIdx = (teamIdx + 1) % session.teams.length;
        await updateDoc(doc(db, 'sessions', sessionId), { 
          stealingAllowed: true,
          lastResponseCorrect: false,
          currentTurnTeam: otherTeamIdx // Shift turn for the steal attempt
        });
        
        // Pick a random member for the steal
        const otherTeam = session.teams[otherTeamIdx];
        if (otherTeam?.manualMembers) {
          const members = otherTeam.manualMembers.split(',').map((s: string) => s.trim());
          const randomMember = members[Math.floor(Math.random() * members.length)];
          await updateDoc(doc(db, 'sessions', sessionId), { 
             currentTurnPlayerName: randomMember
          });
        }

        notify(`¡Incorrecto! ${session.teams[otherTeamIdx].name} puede robar la pregunta.`, 'warning');
        playSound.error();
      } else {
        // Both failed or steal failed
        notify('Pregunta perdida por ambos equipos.', 'info');
        await updateDoc(doc(db, 'sessions', sessionId), { 
          stealingAllowed: false,
          lastResponseCorrect: false
        });
      }
    }
  };

  return (
    <Card className="border-neon-blue/20 bg-card/40 backdrop-blur-xl p-8">
      <div className="flex justify-between items-center mb-6">
        <span className="text-xs font-mono text-neon-blue uppercase tracking-widest">Pregunta {index + 1} de {total}</span>
        {session.config?.isClassroom ? (
           <span className="text-xs font-bold text-neon-purple uppercase">MODO AULA ACTIVO</span>
        ) : (
           <span className="text-xs text-muted-foreground">{answeredCount} / {participants.length} respuestas</span>
        )}
      </div>

      {session.config?.isClassroom && session.teams && (
         <div className="grid grid-cols-2 gap-4 mb-8">
            {session.teams.map((t: any, i: number) => (
               <div key={i} className={`p-4 rounded-xl border transition-all ${session.currentTurnTeam === i ? 'border-neon-blue bg-neon-blue/10 ring-2 ring-neon-blue/20' : 'border-divider bg-card'}`}>
                  <div className="flex justify-between items-center mb-2">
                     <p className="font-black italic text-lg">{t.name}</p>
                     <span className="text-neon-blue font-bold">{t.score} PTS</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-full italic mb-4">{t.manualMembers}</p>
                  
                  {session.currentTurnTeam === i && (
                     <div className="bg-neon-blue/20 p-2 rounded-lg text-center mb-4 animate-pulse">
                        <p className="text-[10px] font-black uppercase text-neon-blue">Miembro designado:</p>
                        <p className="text-sm font-bold">{session.currentTurnPlayerName || '---'}</p>
                     </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="bg-emerald-500 hover:bg-emerald-600 flex-1 font-bold" 
                      onClick={() => handleTurnResponse(i, true)}
                    >
                      ACIERTO
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      className="flex-1 font-bold" 
                      onClick={() => handleTurnResponse(i, false)}
                    >
                      ERROR
                    </Button>
                  </div>
               </div>
            ))}
         </div>
      )}

      <h2 className="text-2xl font-bold mb-8">{question.text}</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {question.options?.map((opt: string, i: number) => (
          <div key={i} className={`p-4 rounded-xl border border-border bg-secondary/20 flex items-center ${opt === question.correctAnswer ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}>
             <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center mr-4 text-sm font-bold">{String.fromCharCode(65 + i)}</span>
             <span>{opt}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-border flex gap-4 overflow-x-auto pb-2">
         {participants.map(p => (
           <div key={p.id} className={`flex-shrink-0 w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold ${p.answeredThisRound ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-border grayscale opacity-50'}`}>
             {p.displayName?.slice(0, 2).toUpperCase()}
           </div>
         ))}
      </div>
    </Card>
  );
}

function TeamConfig({ session, sessionId }: { session: any, sessionId: string }) {
  const [teamAName, setTeamAName] = useState(session.teams?.[0]?.name || 'Equipo Alpha');
  const [teamBName, setTeamBName] = useState(session.teams?.[1]?.name || 'Equipo Omega');
  const [teamAMembers, setTeamAMembers] = useState(session.teams?.[0]?.manualMembers || '');
  const [teamBMembers, setTeamBMembers] = useState(session.teams?.[1]?.manualMembers || '');

  const updateTeams = async () => {
    const listA = teamAMembers.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const listB = teamBMembers.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (listA.length < 3 || listA.length > 5 || listB.length < 3 || listB.length > 5) {
      notify('Cada equipo debe tener entre 3 y 5 integrantes.', 'error');
      playSound.error();
      return;
    }

    await updateDoc(doc(db, 'sessions', sessionId), {
       teams: [
         { name: teamAName, score: 0, members: [], manualMembers: teamAMembers },
         { name: teamBName, score: 0, members: [], manualMembers: teamBMembers }
       ],
       config: { ...session.config, isClassroom: true }
    });
    notify('Equipos configurados correctamente.', 'success');
    playSound.success();
  };

  return (
    <Card className="border-neon-purple/20 bg-card/40 p-6 space-y-4">
       <h3 className="font-bold flex items-center gap-2"><Crown className="w-4 h-4 text-neon-purple" /> Configuración de Equipos (Aula)</h3>
       <p className="text-xs text-muted-foreground">Ingresa los nombres de los integrantes separados por comas (3-5 integrantes).</p>
       <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Nombre Equipo 1</label>
              <input className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" value={teamAName} onChange={e => setTeamAName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Integrantes (Manual)</label>
              <textarea 
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm h-20 resize-none" 
                placeholder="Persona 1, Persona 2..." 
                value={teamAMembers} 
                onChange={e => setTeamAMembers(e.target.value)} 
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Nombre Equipo 2</label>
              <input className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" value={teamBName} onChange={e => setTeamBName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Integrantes (Manual)</label>
              <textarea 
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm h-20 resize-none" 
                placeholder="Persona 1, Persona 2..." 
                value={teamBMembers} 
                onChange={e => setTeamBMembers(e.target.value)} 
              />
            </div>
          </div>
       </div>
       <Button onClick={updateTeams} className="w-full bg-neon-purple/20 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple/30 font-bold">
         ESTABLECER COMPETENCIA DE AULA
       </Button>
    </Card>
  );
}
