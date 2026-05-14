import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router';
import { useAuthStore } from '../store/auth';
import { supabase } from '../lib/supabase';
import { auth, signOut, db, handleFirestoreError, OperationType } from '../lib/firebase';
import playSound from '../lib/sounds';
import { errorService } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { Rocket, Trophy, LogOut, Users, Briefcase, Play, Activity, ShieldAlert, Loader2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DailyReward, WILDCARDS } from '../components/WildcardSystem';
import { TreasureMission } from '../components/TreasureMission';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeSelector } from '../components/ThemeSelector';
import { WelcomeModal } from '../components/WelcomeModal';
import { GlobalSearch } from '../components/GlobalSearch';
import { MissionPreview } from '../components/MissionPreview';

function DifficultyBadge({ difficulty }: { difficulty?: string }) {
  const config: any = {
    'EASY': { label: 'FÁCIL', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    'MEDIUM': { label: 'MEDIO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    'HARD': { label: 'DIFÍCIL', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
  };
  const theme = config[difficulty || 'MEDIUM'];
  
  return (
    <span className={`text-[8px] font-black px-2 py-0.5 rounded border ${theme.color} tracking-widest`}>
      {theme.label}
    </span>
  );
}

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const is_teacher_domain = useAuthStore(s => s.is_teacher_domain);
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [openQuizzes, setOpenQuizzes] = useState<any[]>([]);
  const [pendingSurveys, setPendingSurveys] = useState<any[]>([]);
  const [globalRank, setGlobalRank] = useState<any[]>([]);
  const [hideRankings, setHideRankings] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [attempts, setAttempts] = useState<any[]>([]);
  const [reviewAttempt, setReviewAttempt] = useState<any | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const fetchDashboardData = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      
      // 1. One-time fetch for data that doesn't need to be real-time
      const [resRank, resQuizzes, resAttempts, resSurveys, resConfig] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'STUDENT').order('average_grade', { ascending: false }).limit(10),
        supabase.from('quizzes').select('*').limit(200),
        supabase.from('attempts').select('*').eq('student_id', user.uid).order('timestamp', { ascending: false }).limit(50),
        supabase.from('surveys').select('*').eq('active', true).limit(20),
        supabase.from('config').select('*').eq('id', 'global').single()
      ]);

      if (resConfig.data) {
        setHideRankings(!!resConfig.data.hideRankings);
      }

      setGlobalRank(resRank.data || []);
      setAttempts(resAttempts.data || []);
      
      const quizzes = resQuizzes.data || [];
      const groupIds = user.groupIds || [];
      
      // Filter open or assigned quizzes
      const now = new Date();
      const filtered = quizzes.filter((q: any) => {
        // Must be published or open
        if (q.status !== 'PUBLISHED' && !q.is_open) return false;

        // Check if assigned to this student or their groups
        const isAssigned = 
          q.is_open || 
          (q.assigned_user_ids && q.assigned_user_ids.includes(user.uid)) ||
          (q.assigned_group_ids && q.assigned_group_ids.some((gid: string) => groupIds.includes(gid)));

        if (!isAssigned) return false;

        // Time-based filtering
        if (q.available_from) {
          if (now < new Date(q.available_from)) return false;
        }
        if (q.available_to) {
          if (now > new Date(q.available_to)) return false;
        }
        
        return true;
      });

      setOpenQuizzes(filtered);

      // Surveys & Responses
      const allSurveys = resSurveys.data || [];
      const { data: resResp } = await supabase.from('survey_responses').select('survey_id').eq('student_id', user.uid).limit(100);
      const respondedIds = (resResp || []).map(r => r.survey_id);
      setPendingSurveys(allSurveys.filter(s => !respondedIds.includes(s.id)));

      setLoading(false);
    } catch (err) {
      errorService.handle(err, 'Dashboard Sync');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    
    // Critical real-time listeners only (Active Live Games)
    const fetchSessions = async () => {
      const { data } = await supabase.from('sessions').select('*').in('status', ['LOBBY', 'IN_PROGRESS']).limit(20);
      if (data) setActiveSessions(data);
    };
    fetchSessions();

    const channel = supabase.channel('student_dashboard_sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchSessions();
      })
      .subscribe();

    fetchDashboardData();
    
    // Auto-refresh non-realtime data every 15 minutes
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    }, 900000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.uid]);

  const handleManualRefresh = () => {
    playSound.click();
    fetchDashboardData();
  };

  const handleJoinByCode = () => {
    playSound.click();
    if (!joinCode || joinCode.length < 4) {
      playSound.error();
      return;
    }
    // Join code is either the explicit joinCode field or the last part of sessionId
    const found = activeSessions.find(s => 
      s.joinCode === joinCode.toUpperCase() || 
      (s.id && typeof s.id === 'string' && s.id.toLowerCase().endsWith(joinCode.toLowerCase()))
    );
    if (found) {
      playSound.success();
      navigate(`/session/${found.id}`);
    } else {
      playSound.error();
      notify('Misión no encontrada o código inválido.', 'warning');
    }
  };

  const handleLogout = async () => {
    playSound.click();
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleRequestDeletion = async () => {
    if (!user) return;
    playSound.click();
    const reason = prompt('Por favor, indica el motivo de tu baja (opcional):');
    if (reason === null) return; // Cancelled

    try {
      const { error } = await supabase.from('requests').insert({
        type: 'PROFILE_DELETION',
        student_id: user.uid,
        user_name: user.full_name,
        matricula: user.matricula,
        reason: reason || '',
        status: 'PENDING',
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      notify('Solicitud de baja enviada al administrador.', 'success');
    } catch (e) {
      errorService.handle(e, 'Request Deletion');
    }
  };

  const isUnassigned = user && 
    (!user.groupIds || user.groupIds.length === 0) && 
    (!user.subjectIds || user.subjectIds.length === 0);

  if (isUnassigned) {
    return (
      <div className="min-h-screen cosmic-grid bg-background text-foreground flex flex-col">
        <header className="px-6 py-4 border-b border-border bg-card/50 backdrop-blur-md flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <img 
            src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
            alt="LattQuiz Logo" 
            className="w-10 h-10 object-contain mix-blend-screen"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col">
            <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple tracking-tighter leading-none">
              LattQuiz
            </h2>
            <span className="text-[8px] font-mono opacity-50 tracking-[0.2em] uppercase">Neural Network Intel</span>
          </div>
        </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8">
           <div className="relative">
              <div className="absolute inset-0 bg-neon-blue/20 blur-3xl rounded-full"></div>
              <div className="w-24 h-24 rounded-3xl bg-secondary border border-neon-blue/30 flex items-center justify-center relative">
                 <ShieldAlert className="w-12 h-12 text-neon-blue animate-pulse" />
              </div>
           </div>

           <div className="max-w-md space-y-4">
              <h1 className="text-4xl font-black italic tracking-tighter text-foreground">SISTEMA EN ESPERA</h1>
              <p className="text-muted-foreground leading-relaxed">
                Tu cuenta ha sido vinculada correctamente, pero aún no has sido asignado a ningún <span className="text-neon-blue font-bold">Grupo</span> o <span className="text-neon-purple font-bold">Materia</span>.
              </p>
              <div className="p-4 bg-secondary/30 rounded-xl border border-border text-xs text-left font-mono space-y-2">
                 <p className="text-neon-blue uppercase font-bold">Protocolo de Asignación:</p>
                 <ol className="list-decimal list-inside space-y-1 opacity-70">
                    <li>Solicita a tu docente o administrador que te asigne a los grupos correspondientes.</li>
                    <li>Proporciónales tu Identificador: <span className="text-foreground font-bold">{user?.uid}</span></li>
                    <li>Una vez asignado, reinicia sesión o actualiza esta página para ver tus misiones.</li>
                 </ol>
              </div>
           </div>

           <div className="flex gap-4">
              <Button onClick={() => window.location.reload()} className="bg-neon-blue text-black font-black uppercase italic px-8 h-12">
                 REINTENTAR CONEXIÓN
              </Button>
              <Button variant="ghost" onClick={handleLogout} className="text-xs font-bold uppercase tracking-widest h-12">
                 CANCELAR / SALIR
              </Button>
           </div>
           
           <p className="text-[10px] text-muted-foreground mt-8 uppercase tracking-[0.4em] opacity-30">Waiting for Teacher Authorization...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen cosmic-grid bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card/50 backdrop-blur-md flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <img 
            src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
            alt="LattQuiz Logo" 
            className="w-10 h-10 object-contain mix-blend-screen animate-pulse"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col">
            <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple tracking-tighter leading-none">
              LattQuiz
            </h2>
            <span className="text-[8px] font-mono opacity-30 tracking-[0.2em] uppercase">Neural Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-secondary/50 p-1 rounded-lg border border-border">
            <Button 
               variant="ghost" 
               size="sm" 
               onClick={fetchDashboardData} 
               disabled={loading}
               className="text-neon-blue h-8 border-r border-border rounded-none px-3"
            >
               <Activity className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
               variant={activeTab === 'dashboard' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="text-[10px] font-black uppercase tracking-widest h-8"
              onClick={() => {
                playSound.selection();
                setActiveTab('dashboard');
              }}
            >
              Misiones
            </Button>
            <Button 
              variant={activeTab === 'history' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="text-[10px] font-black uppercase tracking-widest h-8"
              onClick={() => {
                playSound.selection();
                setActiveTab('history');
              }}
            >
              Historial
            </Button>
          </div>
          <div className="hidden md:flex gap-2">
             {user?.wildcards && Object.entries(user.wildcards).map(([type, count]: any) => (
                count > 0 && WILDCARDS[type as keyof typeof WILDCARDS] && (
                  <div key={type} className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-md text-[10px] border border-border" title={WILDCARDS[type as keyof typeof WILDCARDS].name}>
                    {count}x {React.createElement(WILDCARDS[type as keyof typeof WILDCARDS].icon, { className: "w-3 h-3 " + WILDCARDS[type as keyof typeof WILDCARDS].color })}
                  </div>
                )
             ))}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm text-foreground font-mono bg-secondary px-3 py-1 rounded-full border border-border">
              {user?.full_name}
            </span>
            <div className="flex gap-1 mt-1">
              {user?.groupIds?.map((gid: string) => (
                <span key={gid} className="text-[8px] bg-neon-blue/10 text-neon-blue px-1.5 py-0.5 rounded border border-neon-blue/20 uppercase font-black">
                  {gid}
                </span>
              ))}
            </div>
          </div>
          <GlobalSearch />
          <ThemeSelector />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRequestDeletion} 
            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
            title="Solicitar Baja"
          >
            <ShieldAlert className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-12 overflow-y-auto custom-scrollbar">
        {user?.isFirstTime && <WelcomeModal user={user} onClose={() => {}} />}
        
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-12"
            >
              <div className="grid md:grid-cols-2 gap-8">
                <DailyReward />
                {user && <TreasureMission userData={user} userId={user.uid} />}
              </div>

              <section className="bg-card/30 p-6 rounded-2xl border-t-2 border-neon-blue border-neon-blue/20 shadow-2xl relative overflow-hidden group neo-glow-blue">
                <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue/5 blur-3xl rounded-full"></div>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-neon-blue" /> Unirse a Misión en Vivo
                </h2>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Input 
                      placeholder="Ingresa el código (ej. A1B2)" 
                      className="h-12 bg-background/50 border-neon-blue/30 focus:border-neon-blue transition-all pl-10 font-mono text-lg uppercase"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">#</span>
                  </div>
                  <Button onClick={handleJoinByCode} className="h-12 px-8 bg-neon-blue text-black font-black italic tracking-tighter hover:scale-105 transition-transform neo-glow">
                    <Rocket className="mr-2 h-4 w-4" /> ¡EN ÓRBITA!
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-[10px] font-black uppercase text-muted-foreground mr-2 self-center">Guías Rápidas:</span>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewType('CLASICO')} className="h-7 text-[9px] font-bold border border-white/5 hover:bg-neon-blue/10 hover:text-neon-blue">MODO CLÁSICO</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewType('POR_EQUIPOS')} className="h-7 text-[9px] font-bold border border-white/5 hover:bg-neon-purple/10 hover:text-neon-purple">COMPETENCIA EQUIPOS</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewType('LA_TORRE')} className="h-7 text-[9px] font-bold border border-white/5 hover:bg-neon-pink/10 hover:text-neon-pink text-neon-pink">EL JUEGO DE LA TORRE</Button>
                </div>
              </section>

              {pendingSurveys.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-neon-purple animate-pulse" />
                    <h3 className="text-xl font-bold tracking-tighter italic text-neon-purple">FEEDBACK PENDIENTE</h3>
                    <span className="bg-neon-purple/20 text-neon-purple text-[10px] font-black px-2 py-0.5 rounded-full border border-neon-purple/30">{pendingSurveys.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingSurveys.map(survey => (
                      <Card key={survey.id} className="border-neon-purple/50 bg-neon-purple/5 backdrop-blur-md overflow-hidden group hover:border-neon-purple transition-all neo-glow">
                        <div className="h-1 bg-neon-purple/30 w-full"></div>
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <p className="text-[10px] text-neon-purple font-black uppercase tracking-widest opacity-60">Obligatorio</p>
                            <h4 className="font-bold text-lg leading-tight">{survey.title}</h4>
                          </div>
                          <Button 
                            onClick={() => navigate(`/quiz/${survey.quizId}`)} 
                            className="w-full bg-neon-purple hover:bg-neon-purple/80 text-white font-black italic text-xs h-10 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                          >
                            ABRIR FEEDBACK
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-8">
                   <h1 className="text-3xl font-bold flex items-center gap-3">
                     <span className="w-2 h-8 bg-neon-blue rounded-full"></span>
                     Misiones en Vivo
                   </h1>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeSessions.map((session) => (
                    <Card key={session.id} className="border-neon-blue/40 bg-card/40 backdrop-blur-md neo-glow relative overflow-hidden group cursor-pointer" onClick={() => navigate(`/session/${session.id}`)}>
                      <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <CardHeader>
                        <CardTitle className="text-neon-blue flex justify-between items-start gap-2">
                          <span className="leading-tight">{session.quiz_title}</span>
                          <Badge className={session.status === 'LOBBY' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'}>
                            {session.status === 'LOBBY' ? 'LOBBY' : 'VIVO'}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          <Users className="w-3 h-3" />
                          <span>{session.type === 'A_LA_CIMA' ? 'A la Cima' : 'Duelo de Equipos'}</span>
                        </div>
                        <Button className="w-full bg-neon-blue/20 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue hover:text-black font-bold">
                          <Rocket className="mr-2 h-4 w-4" /> Conectarse
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {activeSessions.length === 0 && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/20 group hover:border-neon-blue/30 transition-colors">
                       <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20 group-hover:text-neon-blue group-hover:opacity-100 transition-all duration-700" />
                       <p className="text-muted-foreground">No hay misiones grupales activas.</p>
                       <p className="text-xs text-muted-foreground/60 mt-2">Ingresa un código o espera a tu docente.</p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-8">
                   <h1 className="text-3xl font-bold flex items-center gap-3">
                     <span className="w-2 h-8 bg-neon-purple rounded-full"></span>
                     Misiones Abiertas (Solo)
                   </h1>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {openQuizzes.map((q) => (
                    <Card key={q.id} className="border-neon-purple/40 bg-card/40 backdrop-blur-md hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] relative overflow-hidden group cursor-pointer transition-all neo-glow" onClick={() => navigate(`/quiz/${q.id}`)}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-neon-purple flex justify-between items-start gap-2">
                          <span className="flex-1">{q.title}</span>
                          <DifficultyBadge difficulty={q.difficulty} />
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{q.description || 'Sin descripción.'}</p>
                        <Button className="w-full bg-neon-purple/20 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple hover:text-white font-bold">
                          <Play className="mr-2 h-4 w-4" /> Iniciar Misión
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {openQuizzes.length === 0 && (
                    <div className="col-span-full py-10 text-center border border-border rounded-xl">
                      <p className="text-muted-foreground text-sm italic">No hay misiones abiertas actualmente.</p>
                    </div>
                  )}
                </div>
              </section>

              {!hideRankings && (
                <section className="animate-in fade-in zoom-in duration-500">
                   <div className="flex items-center justify-between mb-8">
                      <h1 className="text-3xl font-bold flex items-center gap-3">
                        <span className="w-2 h-8 bg-yellow-500 rounded-full"></span>
                        Ránking Global (TOP 10)
                      </h1>
                   </div>
                   <div className="bg-card/30 border border-border rounded-2xl overflow-hidden backdrop-blur-md">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border/20">
                         {globalRank.map((s, i) => (
                            <div key={s.id} className="bg-background/40 p-4 flex items-center justify-between group hover:bg-white/5 transition-colors">
                               <div className="flex items-center gap-4">
                                  <span className={`w-6 text-center font-black italic ${i < 3 ? 'text-yellow-500 text-xl' : 'text-muted-foreground'}`}>{i + 1}</span>
                                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-xs border border-white/5">{s.full_name?.slice(0,2).toUpperCase()}</div>
                                  <div>
                                     <p className="font-bold text-sm tracking-tight">{s.full_name}</p>
                                     <p className="text-[10px] uppercase font-mono opacity-50">{s.matricula || '---'}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="font-black text-neon-blue">{s.average_grade?.toFixed(1) || '0.0'}</p>
                                  <p className="text-[8px] uppercase font-bold opacity-40 tracking-widest">Promedio</p>
                               </div>
                            </div>
                         ))}
                      </div>
                      {globalRank.length === 0 && (
                        <div className="p-12 text-center text-muted-foreground italic text-sm">Calculando estadísticas globales...</div>
                      )}
                   </div>
                </section>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-black italic tracking-tighter">HISTORIAL DE ASIGNACIONES</h1>
                <div className="p-3 rounded-xl bg-neon-blue/10 border border-neon-blue/20">
                  <Activity className="w-6 h-6 text-neon-blue" />
                </div>
              </div>

              <div className="grid gap-4">
                {attempts.map((attempt) => (
                  <Card key={attempt.id} className="bg-card/30 border-border/50 hover:border-neon-blue/30 transition-all group overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      <div className="p-6 md:w-2/3 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-mono text-neon-blue uppercase tracking-widest">{attempt.subject_name || 'GENERAL'}</p>
                            <h3 className="text-xl font-bold group-hover:text-neon-blue transition-colors">{attempt.quiz_title}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground font-mono">{new Date(attempt.timestamp).toLocaleDateString()} {new Date(attempt.timestamp).toLocaleTimeString()}</p>
                            <Badge className={attempt.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                              {attempt.passed ? 'APROBADO' : 'REPROBADO'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-secondary/30 p-2 rounded-lg text-center">
                            <p className="text-[8px] uppercase font-black opacity-50">Score</p>
                            <p className="text-lg font-black text-neon-blue">{attempt.score}</p>
                          </div>
                          <div className="bg-secondary/30 p-2 rounded-lg text-center">
                            <p className="text-[8px] uppercase font-black opacity-50">Aciertos</p>
                            <p className="text-lg font-black">{attempt.correct_answers} / {attempt.total_questions}</p>
                          </div>
                          <div className="bg-secondary/30 p-2 rounded-lg text-center">
                            <p className="text-[8px] uppercase font-black opacity-50">Calificación</p>
                            <p className={`text-lg font-black ${attempt.score / (attempt.total_questions * 10) * 10 >= 6 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(attempt.score / (attempt.total_questions * 10) * 10).toFixed(1)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="md:w-1/3 bg-secondary/20 p-6 flex items-center justify-center border-t md:border-t-0 md:border-l border-border/50">
                        <Button 
                          variant="secondary" 
                          className="w-full font-black italic uppercase tracking-tighter"
                          onClick={() => setReviewAttempt(attempt)}
                        >
                           Revisar Desempeño
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {attempts.length === 0 && (
                  <div className="text-center py-20 bg-card/20 rounded-2xl border-2 border-dashed border-border group hover:border-neon-blue/30 transition-all">
                    <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20 group-hover:scale-110 transition-transform" />
                    <p className="text-muted-foreground italic">Aún no has completado ninguna misión.</p>
                    <Button variant="link" onClick={() => setActiveTab('dashboard')} className="text-neon-blue">Explorar Misiones</Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Review Dialog */}
      <Dialog open={!!reviewAttempt} onOpenChange={() => setReviewAttempt(null)}>
        <DialogContent className="max-w-3xl bg-card border-border backdrop-blur-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic tracking-tighter">ANÁLISIS DE MISIÓN</DialogTitle>
          </DialogHeader>

          {reviewAttempt && (
            <div className="flex-1 overflow-auto space-y-6 py-4 px-2 custom-scrollbar">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/50">
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Misión</span>
                     <span className="text-xs font-bold leading-none">{reviewAttempt.quiz_title}</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Fecha</span>
                     <span className="text-xs font-bold leading-none">{new Date(reviewAttempt.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Score</span>
                     <span className="text-xs font-bold leading-none text-neon-blue">{reviewAttempt.score} pts</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Calificación</span>
                     <span className={`text-xs font-bold leading-none ${(reviewAttempt.score / (reviewAttempt.total_questions * 10) * 10) >= 6 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(reviewAttempt.score / (reviewAttempt.total_questions * 10) * 10).toFixed(1)} / 10.0
                     </span>
                  </div>
               </div>

               <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60">Revisión de Reactivos</h3>
                  {reviewAttempt.responses ? reviewAttempt.responses.map((resp: any, idx: number) => (
                    <div key={idx} className={`p-4 rounded-xl border transition-all ${resp.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                       <div className="flex justify-between gap-4 mb-2">
                          <p className="text-sm font-bold flex-1">{idx + 1}. {resp.question_text}</p>
                          <Badge variant="outline" className={resp.is_correct ? 'text-emerald-400 border-emerald-400/50' : 'text-red-400 border-red-400/50'}>
                             {resp.is_correct ? 'CORRECTO' : 'FALLO'}
                          </Badge>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                          <div className="space-y-1">
                             <p className="opacity-50 uppercase font-bold text-[8px]">Tu Respuesta</p>
                             <p className={`font-mono px-2 py-1 rounded bg-black/20 ${resp.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>{resp.student_answer}</p>
                          </div>
                          {!resp.is_correct && (
                            <div className="space-y-1">
                               <p className="opacity-50 uppercase font-bold text-[8px]">Respuesta Correcta</p>
                               <p className="font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">{resp.correct_answer}</p>
                            </div>
                          )}
                       </div>
                    </div>
                  )) : (
                    <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center opacity-50">
                       <p className="italic text-sm">Este reporte no tiene desglose de reactivos disponible.</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border mt-auto">
             <Button onClick={() => setReviewAttempt(null)} className="bg-neon-blue text-black font-black italic">VOLVER AL HISTORIAL</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnimatePresence>
        {previewType && <MissionPreview type={previewType} onClose={() => setPreviewType(null)} />}
      </AnimatePresence>
    </div>
  );
}

const Badge = ({ children, className, variant }: { children: React.ReactNode, className?: string, variant?: string }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${className}`}>
    {children}
  </span>
);
