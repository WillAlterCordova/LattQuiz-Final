import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/auth';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { supabase } from '../lib/supabase';
import { errorService, AppError, ErrorCategory } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { Users, User, GraduationCap, BookOpen, Activity, LogOut, ShieldAlert, Upload, Plus, Pencil, Power, Copy, Menu, X, Trash2, Loader2, Trophy, Rocket, LayoutGrid, CheckSquare, Square, Globe, Zap, Cpu, History, AlertTriangle, Bell, HeartPulse, Terminal, Layers, RefreshCw, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import playSound from '../lib/sounds';
import { utils, writeFile } from 'xlsx';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { ThemeSelector } from '../components/ThemeSelector';
import { WelcomeModal } from '../components/WelcomeModal';
import { resetSystemData } from '../lib/dataReset';
import { GlobalSearch } from '../components/GlobalSearch';

export const validateCode = (code: string) => {
  if (code.length < 6) return "El código debe tener al menos 6 caracteres.";
  if (!/^[a-zA-Z0-9$#%@\-]*$/.test(code)) return "El formato del código es inválido. Usa letras, números y caracteres especiales allowed ($, #, %, @, -).";
  return null;
};

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDashboardSubjectId, setSelectedDashboardSubjectId] = useState('ALL');
  const showWelcome = !!(user && user.isFirstTime);

  // Error listener for critical notifications
  useEffect(() => {
    const channel = supabase
      .channel('system_errors_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_errors',
        filter: 'severity=eq.HIGH'
      }, (payload) => {
        const err = payload.new;
        if (!err.resolved) {
          notify(`ERROR CRÍTICO: ${err.message}`, 'error');
          playSound.error();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    playSound.click();
    await supabase.auth.signOut();
    navigate('/');
  };

  const { subjects: allSubjects, groups: allGroups } = useSubjectsGroupsStore();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {showWelcome && <WelcomeModal user={user} onClose={() => {}} />}
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <img 
            src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
            alt="LattQuiz Logo" 
            className="w-8 h-8 object-contain mix-blend-screen"
            referrerPolicy="no-referrer"
          />
          <h2 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple tracking-tighter">
            LattQuiz<span className="text-[10px] align-top text-neon-pink ml-1">ADMIN</span>
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { setSidebarOpen(!sidebarOpen); playSound.click(); }}>
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`w-64 border-r border-border bg-card flex-col md:flex ${sidebarOpen ? 'flex' : 'hidden'} absolute md:static z-50 h-full md:h-auto min-h-screen md:min-h-0`}>
        <div className="p-6 hidden md:block">
          <div className="flex items-center gap-3 mb-6">
            <img 
              src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
              alt="LattQuiz Logo" 
              className="w-12 h-12 object-contain mix-blend-screen animate-pulse"
              referrerPolicy="no-referrer"
            />
            <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple tracking-tighter">
              LattQuiz<span className="text-xs align-top text-neon-pink ml-1">ADMIN</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 mb-4 opacity-30">
            <h3 className="text-[10px] uppercase font-black tracking-widest text-neon-blue">Neural Network Core</h3>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4 md:mt-0">
          <NavItem to="/admin" icon={Activity} label="Dashboard" active={location.pathname === '/admin'} onClick={closeSidebar} />
          <NavItem to="/admin/users" icon={Users} label="Usuarios" active={location.pathname.startsWith('/admin/users')} onClick={closeSidebar} />
          <NavItem to="/admin/missions" icon={Rocket} label="Misiones Globales" active={location.pathname.startsWith('/admin/missions')} onClick={closeSidebar} />
          <NavItem to="/admin/subjects" icon={BookOpen} label="Materias y Grupos" active={location.pathname.startsWith('/admin/subjects')} onClick={closeSidebar} />
          <NavItem to="/admin/control" icon={Cpu} label="Control de Sistema" active={location.pathname.startsWith('/admin/control')} onClick={closeSidebar} />
          <NavItem to="/admin/telemetry" icon={ShieldAlert} label="Telemetría Neural" active={location.pathname.startsWith('/admin/telemetry')} onClick={closeSidebar} />
          
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vistas de Prueba</p>
          </div>
          <button 
            onClick={() => { useAuthStore.getState().setActiveRole('TEACHER'); navigate('/teacher'); closeSidebar(); playSound.powerUp(); }}
            className="flex items-center w-full px-4 py-3 rounded-lg transition-colors text-sm font-medium hover:bg-secondary/50 text-muted-foreground"
          >
            <GraduationCap className="mr-3 h-5 w-5" />
            <span>Ver como Docente</span>
          </button>
          <button 
            onClick={() => { useAuthStore.getState().setActiveRole('STUDENT'); navigate('/student'); closeSidebar(); playSound.powerUp(); }}
            className="flex items-center w-full px-4 py-3 rounded-lg transition-colors text-sm font-medium hover:bg-secondary/50 text-muted-foreground"
          >
            <User className="mr-3 h-5 w-5" />
            <span>Ver como Alumno</span>
          </button>
        </nav>

        <div className="p-4 border-t border-border mt-auto space-y-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-sm font-medium truncate flex-1">{user?.displayName}</p>
            <div className="flex items-center gap-1">
              <GlobalSearch />
              <ThemeSelector />
            </div>
          </div>
          <div>
            <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
          
          <div className="pt-4 border-t border-white/5 opacity-40">
             <p className="px-2 text-[8px] uppercase font-black text-neon-blue tracking-widest leading-tight">LattQuiz | Neural Intelligence</p>
             <p className="px-2 text-[9px] font-bold text-muted-foreground uppercase italic pb-1">Wilfredo Chaparro Córdova</p>
             <p className="px-2 text-[7px] font-mono">Build 2026 / LATT-PLATFORM</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative min-h-[calc(100vh-65px)] md:min-h-screen custom-scrollbar">
        <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-neon-purple/5 mix-blend-screen filter blur-[100px] pointer-events-none"></div>
        
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname.split('?')[0]} // Ignore query params for animations
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Routes location={location}>
              <Route path="/" element={<Overview />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/subjects" element={<SubjectsGroupsManagement />} />
              <Route path="/missions" element={<GlobalMissionsManagement />} />
              <Route path="/control" element={<SystemControlPanel />} />
              <Route path="/telemetry" element={<TelemetryDashboard />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, active, onClick }: { to: string, icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className={`flex items-center px-4 py-3 rounded-lg transition-colors text-sm font-medium ${active ? 'bg-secondary text-foreground' : 'hover:bg-secondary/50 text-muted-foreground'}`}>
      <Icon className="mr-3 h-5 w-5" />
      {label}
    </Link>
  );
}

function Overview() {
  const { user } = useAuthStore();
  const [selectedSubjectId, setSelectedSubjectId] = useState('ALL');
  const { subjects: allSubjects } = useSubjectsGroupsStore();
  
  // RAW DATA HOLDERS
  const [rawData, setRawData] = useState({
    users: [] as any[],
    onlineCount: 0,
    quizzes: [] as any[],
    sessions: [] as any[],
    groupsCount: 0
  });

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalMissions: 0,
    filteredMissions: 0,
    activeSessions: [] as any[],
    totalGroups: 0,
    studentsAtRisk: 0,
    topStudents: [] as any[],
    subjectStats: [] as any[]
  });
  const [loading, setLoading] = useState(true);

  // 1. DATA LOGIC
  useEffect(() => {
    if (!user?.id) return;

    const fetchData = async (isManual = false) => {
      try {
        setLoading(true);
        
        const [resUsers, resQuizzes, resGroups] = await Promise.all([
          supabase.from('profiles').select('*').limit(500),
          supabase.from('quizzes').select('*').limit(200),
          supabase.from('groups').select('*', { count: 'exact', head: true })
        ]);

        if (resUsers.error) throw resUsers.error;
        if (resQuizzes.error) throw resQuizzes.error;

        setRawData(prev => ({
          ...prev,
          users: resUsers.data || [],
          quizzes: resQuizzes.data || [],
          groupsCount: resGroups.count || 0
        }));
        
        // Manual refresh also fetches sessions once
        if (isManual) {
           const { data: sessions, error: sErr } = await supabase
            .from('sessions')
            .select('*')
            .neq('status', 'COMPLETED')
            .limit(100);
           if (sessions) setRawData(prev => ({ ...prev, sessions }));
        }

        setLoading(false);
        if (isManual) notify('Sincronización total completada', 'success');
      } catch (err) {
        errorService.handle(err, 'Admin Overview Fetch');
        setLoading(false);
      }
    };

    const fetchAdminRealtime = async () => {
      try {
        const fiveMinsAgo = new Date(Date.now() - 300000).toISOString();
        const [resOnline, resSessions] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).gt('last_seen_at', fiveMinsAgo),
          supabase.from('sessions').select('*').eq('status', 'ACTIVE').limit(50)
        ]);

        setRawData(prev => ({ 
          ...prev, 
          onlineCount: resOnline.count || 0,
          sessions: resSessions.data || []
        }));
      } catch (e) {
        console.warn('Admin realtime fetch failed:', e);
      }
    };

    fetchData();
    fetchAdminRealtime();

    const pollInterval = setInterval(fetchAdminRealtime, 120000);

    (window as any).refreshAdminData = () => {
      fetchData(true);
      fetchAdminRealtime();
    };

    return () => {
      clearInterval(pollInterval);
      delete (window as any).refreshAdminData;
    };
  }, [user?.id]);

  // 2. DERIVED STATS (Filtering logic moves here, NO DB READS)
  useEffect(() => {
    const users = rawData.users;
    const quizzes = rawData.quizzes;
    const sessions = rawData.sessions;

    const studentsAtRisk = users.filter(u => u.role === 'STUDENT' && (u.average_grade !== undefined && u.average_grade < 6)).length;
    const students = users.filter(u => u.role === 'STUDENT');
    const top = [...students]
      .sort((a,b) => (b.average_grade || 0) - (a.average_grade || 0))
      .slice(0, 5);

    const subjectCounts: Record<string, number> = {};
    quizzes.forEach(q => {
      const subject = allSubjects.find(s => s.id === q.subject_id);
      const name = subject?.name || 'Sin Materia';
      subjectCounts[name] = (subjectCounts[name] || 0) + 1;
    });

    const filteredMissions = selectedSubjectId === 'ALL' 
      ? quizzes.length 
      : quizzes.filter(q => q.subject_id === selectedSubjectId).length;

    const filteredSessions = selectedSubjectId === 'ALL'
      ? sessions
      : sessions.filter(s => s.subject_id === selectedSubjectId);

    setStats({
      totalUsers: users.length,
      totalMissions: quizzes.length,
      filteredMissions,
      activeSessions: filteredSessions,
      totalGroups: rawData.groupsCount,
      studentsAtRisk,
      topStudents: top,
      subjectStats: Object.entries(subjectCounts).map(([name, count]) => ({ name, count }))
    });
  }, [rawData, selectedSubjectId, allSubjects]);

  // if (loading) return <LoadingPulse message="Optimizando Red Neuronal" />;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter text-neon-blue uppercase">Gobernanza Neural Global</h1>
          <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest mt-1 opacity-60">Status de Capas de Ejecución LattQuiz v4.0</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-end gap-2 min-w-[200px]">
          <div className="flex-1">
            <Label className="text-[10px] uppercase font-black text-neon-blue/60 ml-1">Filtro de Nodo Curricular</Label>
            <select 
              value={selectedSubjectId} 
              onChange={e => setSelectedSubjectId(e.target.value)}
              className="bg-card/50 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-black uppercase transition-all outline-none focus:ring-1 focus:ring-neon-blue w-full"
            >
              <option value="ALL">UNIDADES TOTALES</option>
              {allSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => {
              if ((window as any).refreshAdminData) {
                (window as any).refreshAdminData();
              } else {
                window.location.reload();
              }
            }}
            className="h-9 w-9 border-white/10 hover:border-neon-blue/50"
            title="Sincronización total de datos"
          >
            <RefreshCw className="w-4 h-4 text-neon-blue" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          <>
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-card animate-pulse border border-border/50"></div>)}
          </>
        ) : (
          <>
            <StatCard title="Total Usuarios" value={stats.totalUsers.toString()} icon={Users} info="Cuentas Activas" />
            <StatCard title="Misiones Latt" value={selectedSubjectId === 'ALL' ? stats.totalMissions.toString() : stats.filteredMissions.toString()} icon={Activity} info={selectedSubjectId === 'ALL' ? "Nodos de Evaluación" : "Filtro Subjetivo"} highlight={selectedSubjectId !== 'ALL'} />
            <StatCard title="Sujetos Online" value={(rawData.onlineCount || 0).toString()} icon={Rocket} highlight={(rawData.onlineCount || 0) > 0} info="Conexión en Vivo" />
            <StatCard title="Alumnos en Riesgo" value={stats.studentsAtRisk.toString()} icon={ShieldAlert} info="Rendimiento < 6.0" highlight={stats.studentsAtRisk > 0} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-primary/20 bg-card/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-neon-blue flex items-center gap-2 text-lg uppercase tracking-widest font-black">
              <Trophy className="w-5 h-5" /> Hall de la Fama
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 w-full bg-secondary/20 animate-pulse rounded-lg"></div>)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">Alumno</TableHead>
                    <TableHead className="text-right text-[10px] uppercase">AVG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topStudents.map((s, i) => (
                    <TableRow key={s.userId || i}>
                      <TableCell className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-yellow-500 text-black shadow-[0_0_8px_gold]' : 'bg-neon-blue/20 text-neon-blue'}`}>{i+1}</span>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{s.displayName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{s.matricula}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-emerald-500">{s.averageGrade?.toFixed(1) || '0.0'}</TableCell>
                    </TableRow>
                  ))}
                  {stats.topStudents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground italic text-xs">No hay datos suficientes</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-card/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-neon-purple flex items-center gap-2 text-lg uppercase tracking-widest font-black">
              <Rocket className="w-5 h-5 text-neon-purple" /> Misiones en Órbita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
               {loading ? (
                 <div className="space-y-3">
                   {[1, 2, 3].map(i => <div key={i} className="h-16 w-full bg-secondary/20 animate-pulse rounded-xl"></div>)}
                 </div>
               ) : (
                 <>
                   {stats.activeSessions.map(s => (
                     <div key={s.id} className="flex justify-between items-center p-4 rounded-xl bg-secondary/20 border border-border/50 hover:border-neon-purple transition-all group">
                       <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-neon-purple animate-ping"></div>
                         <div>
                           <p className="text-sm font-bold group-hover:text-neon-purple transition-colors">{s.quizTitle}</p>
                           <p className="text-[10px] text-muted-foreground font-mono uppercase">Docente: {s.teacherName || 'Admin'}</p>
                         </div>
                       </div>
                       <Badge variant="outline" className="bg-neon-purple/10 text-neon-purple border-neon-purple/30 text-[10px]">
                         {s.joinCode}
                       </Badge>
                     </div>
                   ))}
                   {stats.activeSessions.length === 0 && (
                     <div className="text-center py-12 flex flex-col items-center gap-2">
                        <Activity className="w-8 h-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground italic">Cápsula de reposo: Sin actividad.</p>
                     </div>
                   )}
                 </>
               )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-1 gap-6">
        <Card className="border-primary/20 bg-card/40 backdrop-blur-md">
           <CardHeader>
             <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
               <BookOpen className="w-4 h-4 text-neon-blue" /> Desempeño por Materia (Pruebas Disponibles)
             </CardTitle>
           </CardHeader>
           <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                 {stats.subjectStats.map((s, i) => (
                   <div key={i} className="p-4 rounded-xl border border-border bg-black/20 text-center">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1 truncate">{s.name}</p>
                      <p className="text-2xl font-black text-neon-blue">{s.count}</p>
                   </div>
                 ))}
                 {stats.subjectStats.length === 0 && (
                   <p className="col-span-full text-center text-xs text-muted-foreground italic py-4">No hay materias con pruebas registradas.</p>
                 )}
              </div>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, info, highlight = false }: { title: string, value: string, icon: any, info?: string, highlight?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border transition-all ${highlight ? 'border-neon-blue bg-neon-blue/5 shadow-[0_0_15px_rgba(0,255,255,0.1)]' : 'border-border bg-card'}`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className={`w-5 h-5 ${highlight ? 'text-neon-blue' : 'text-muted-foreground'}`} />
      </div>
      <p className={`text-4xl font-black ${highlight ? 'text-neon-blue' : ''}`}>{value}</p>
      {info && <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-widest">{info}</p>}
    </div>
  );
}

// ... rest of imports/components

function RequestRow({ r, groups, subjects, onApprove, onProcessDelete, onRefresh }: { r: any, groups: any[], subjects: any[], onApprove: (r: any, role: string, email?: string) => Promise<void>, onProcessDelete: (r: any, approved: boolean) => Promise<void>, onRefresh: () => void, key?: any }) {
  const [selRole, setSelRole] = useState(r.role || 'STUDENT');
  const [tEmail, setTEmail] = useState(r.email || '');

  if (r.type === 'PROFILE_DELETION') {
    return (
      <TableRow key={r.id} className="bg-red-500/5">
        <TableCell className="font-bold">
          <div className="uppercase text-red-500 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> SOLICITUD DE BAJA DEFINITIVA
          </div>
          <div className="uppercase mt-1 text-sm">{r.userName}</div>
          <div className="text-[10px] font-mono opacity-40 uppercase tracking-widest mt-1">ID-STUDENT: {r.studentId}</div>
        </TableCell>
        <TableCell className="text-xs">
          <div className="flex flex-col gap-1">
             <span className="text-[9px] font-mono opacity-60 uppercase">Enviado: {new Date(r.createdAt).toLocaleString()}</span>
             <p className="text-[10px] italic leading-tight text-white/40 mt-1 max-w-xs">{r.reason || 'Sin motivo adicional especificado.'}</p>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 text-red-400/60 bg-red-400/5 p-2 rounded border border-red-400/10">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="text-[9px] font-bold uppercase leading-tight italic">Advertencia: Esta acción eliminará permanentemente todos los registros de intentos y calificaciones.</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-end">
            <Button 
               size="sm" 
               variant="destructive" 
               className="font-black italic bg-red-600 hover:bg-red-700 h-8 text-[10px] gap-2 px-4 shadow-[0_0_15px_rgba(220,38,38,0.2)]" 
               onClick={() => onProcessDelete(r, true)}
            >
              <Trash2 className="w-4 h-4" /> CONFIRMAR ELIMINACIÓN
            </Button>
            <Button 
               size="sm" 
               variant="ghost" 
               className="h-8 text-[10px] font-bold uppercase opacity-50 hover:opacity-100" 
               onClick={() => onProcessDelete(r, false)}
            >
              RECHAZAR
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow key={r.id}>
      <TableCell className="font-bold">
        <div className="uppercase">{r.name}</div>
        <div className="uppercase">{r.lastName} {r.motherLastName}</div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className={`text-[8px] ${r.role === 'TEACHER' ? 'border-neon-purple text-neon-purple' : 'border-neon-blue text-neon-blue'}`}>
            SOLICITA: {r.role}
          </Badge>
          {r.createdAt && <span className="text-[7px] text-muted-foreground font-mono">ENVIADO: {new Date(r.createdAt).toLocaleString()}</span>}
        </div>
      </TableCell>
      <TableCell className="text-xs">
        <div className="flex flex-col gap-1">
          {r.matricula ? <span className="font-mono bg-secondary/50 px-2 py-0.5 rounded text-[10px] w-fit uppercase">MATRICULA: {r.matricula}</span> : <span className="opacity-30 italic text-[10px]">Sin Matrícula</span>}
          <div className="text-[9px] font-bold text-neon-blue uppercase">Grup: {groups.find(g => g.id === r.groupId)?.name || 'N/A'}</div>
          <div className="text-[9px] font-bold text-neon-purple uppercase">Mat: {subjects.find(s => s.id === r.subjectId)?.name || 'N/A'}</div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-2">
          <select 
            value={selRole} 
            onChange={e => setSelRole(e.target.value)}
            className="text-[10px] bg-background border rounded px-2 py-1 uppercase font-bold w-full text-neon-blue"
          >
            <option value="STUDENT">Alumno (Habilitar Misiones)</option>
            <option value="TEACHER">Docente (Habilitar Gestión)</option>
            <option value="ADMIN">Administrador (Acceso Total)</option>
          </select>
          <div className="text-[7px] text-muted-foreground uppercase leading-tight px-1 font-mono">
            {selRole === 'ADMIN' ? 'Nivel 3: Root Access' : 
             selRole === 'TEACHER' ? 'Nivel 2: Academic Intel' : 
             'Nivel 1: Standard Operative'}
          </div>
          {selRole === 'ADMIN' && (
            <Input 
              placeholder="Gmail para Acceso" 
              value={tEmail}
              onChange={e => setTEmail(e.target.value)}
              className="h-8 text-[10px] bg-background/50 border-neon-purple/30"
            />
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-end">
          <Button size="sm" className="bg-emerald-500 text-white hover:bg-emerald-600 font-bold italic h-7 text-[10px]" onClick={() => onApprove(r, selRole, tEmail)}>VALIDAR</Button>
          <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={async () => {
            const { error } = await supabase.from('requests').update({ status: 'REJECTED' }).eq('id', r.id);
            if (error) errorService.handle(error, 'Reject Request');
            else onRefresh();
          }}>BAJA</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function TelemetryDashboard() {
  const { subjects } = useSubjectsGroupsStore();
  const [missions, setMissions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [lastAttemptDoc, setLastAttemptDoc] = useState<any>(null);
  const [hasMoreAttempts, setHasMoreAttempts] = useState(true);
  const [loadingMoreAttempts, setLoadingMoreAttempts] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [lastViolationDoc, setLastViolationDoc] = useState<any>(null);
  const [hasMoreViolations, setHasMoreViolations] = useState(true);
  const [loadingMoreViolations, setLoadingMoreViolations] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVITY' | 'VIOLATIONS' | 'BLOCKED' | 'ATTEMPTS'>('ACTIVITY');
  const [loading, setLoading] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [selectedSubjectId, setSelectedSubjectId] = useState('ALL');

  const fetchTelemetry = async (isNextPage = false, paginateType: 'attempts' | 'violations' = 'attempts') => {
    try {
      if (isNextPage) {
        if (paginateType === 'attempts') setLoadingMoreAttempts(true);
        else setLoadingMoreViolations(true);
      } else {
        setLoading(true);
      }

      if (isNextPage) {
        if (paginateType === 'attempts') {
          const { data, error } = await supabase
            .from('attempts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);
          if (error) throw error;
          setAttempts(prev => [...prev, ...data]);
          setHasMoreAttempts(data.length === 50);
          setLoadingMoreAttempts(false);
        } else {
          const { data, error } = await supabase
            .from('violations')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);
          if (error) throw error;
          setViolations(prev => [...prev, ...data]);
          setHasMoreViolations(data.length === 50);
          setLoadingMoreViolations(false);
        }
      } else {
        const [resQ, resS, resA, resU, resV] = await Promise.all([
          supabase.from('quizzes').select('*').limit(100),
          supabase.from('sessions').select('*').order('start_time', { ascending: false }).limit(50),
          supabase.from('attempts').select('*').order('timestamp', { ascending: false }).limit(50),
          supabase.from('profiles').select('*').eq('role', 'STUDENT').limit(200),
          supabase.from('violations').select('*').order('timestamp', { ascending: false }).limit(50)
        ]);

        if (resQ.error) throw resQ.error;
        if (resS.error) throw resS.error;
        if (resA.error) throw resA.error;
        if (resU.error) throw resU.error;
        if (resV.error) throw resV.error;

        setMissions(resQ.data || []);
        setSessions(resS.data || []);
        setAttempts(resA.data || []);
        setUsers(resU.data || []);
        setViolations(resV.data || []);
        
        setHasMoreAttempts(resA.data?.length === 50);
        setHasMoreViolations(resV.data?.length === 50);
        setLoading(false);
      }
    } catch (err) {
      errorService.handle(err, 'Telemetry Sync');
      setLoading(false);
      setLoadingMoreAttempts(false);
      setLoadingMoreViolations(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();

    const checkLatency = async () => {
      const start = performance.now();
      try {
        await supabase.from('config').select('id').eq('id', 'latency_check');
        const end = performance.now();
        setLatency(Math.round(end - start));
      } catch (e) {
        setLatency(Math.round(performance.now() - start));
      }
    };
    checkLatency();
    const lInterval = setInterval(checkLatency, 15000);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(lInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const filteredMissions = missions.filter(m => selectedSubjectId === 'ALL' || m.subject_id === selectedSubjectId);
  const filteredSessions = sessions.filter(s => selectedSubjectId === 'ALL' || s.subject_id === selectedSubjectId);
  const filteredAttempts = attempts.filter(a => selectedSubjectId === 'ALL' || a.subject_id === selectedSubjectId);

  const totalViolationsTabs = users.reduce((acc, u) => acc + (u.tab_violations || 0), 0);
  const totalViolationsPhone = users.reduce((acc, u) => acc + (u.phone_violations || 0), 0);
  const totalViolations = totalViolationsTabs + totalViolationsPhone;
  const blockedUsers = users.filter(u => u.active === false || u.is_blocked).length;
  const activeMissions = filteredMissions.filter(m => m.active !== false).length;
  const activeSessionsCount = filteredSessions.filter(s => s.status === 'ACTIVE').length;

  const roleData = [
    { name: 'Alumnos', value: users.filter(u => u.role === 'STUDENT').length, color: '#00f3ff' },
    { name: 'Docentes', value: users.filter(u => u.role === 'TEACHER').length, color: '#bc13fe' },
    { name: 'Admins', value: users.filter(u => u.role === 'ADMIN').length, color: '#ff00ff' },
  ];

  // Derive simple activity data (mocked baseline + real recent attempts)
  const activityData = [
    { time: '08:00', attempts: filteredAttempts.filter(a => new Date(a.timestamp).getHours() < 10).length },
    { time: '12:00', attempts: filteredAttempts.filter(a => new Date(a.timestamp).getHours() >= 10 && new Date(a.timestamp).getHours() < 14).length },
    { time: '16:00', attempts: filteredAttempts.filter(a => new Date(a.timestamp).getHours() >= 14 && new Date(a.timestamp).getHours() < 18).length },
    { time: '20:00', attempts: filteredAttempts.filter(a => new Date(a.timestamp).getHours() >= 18).length },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="w-12 h-12 text-neon-blue animate-spin" />
        <p className="text-neon-blue font-black italic animate-pulse">Sincronizando flujo de datos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-black/40 backdrop-blur-xl p-6 rounded-2xl border border-white/5 mb-8 gap-4">
        <div>
          <h2 className="text-xl font-black italic text-neon-blue uppercase tracking-widest leading-none">Centro de Telemetría</h2>
          <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1 tracking-widest">Monitoreo de Infraestructura y Actividad Neural</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="flex flex-col gap-1 min-w-[200px]">
            <Label className="text-[8px] uppercase font-black text-muted-foreground ml-1">Filtrar por Materia</Label>
            <select 
              value={selectedSubjectId} 
              onChange={e => setSelectedSubjectId(e.target.value)}
              className="bg-secondary/30 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase text-neon-blue focus:border-neon-blue transition-all outline-none"
            >
              <option value="ALL">TODAS LAS MATERIAS</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-6 ml-auto">
            <div className="text-right">
              <p className="text-[8px] uppercase font-black text-muted-foreground mb-1">Status de Conexión</p>
              <div className={`flex items-center gap-2 justify-end ${isOnline ? 'text-emerald-400' : 'text-neon-pink'}`}>
                <Globe className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase">{isOnline ? 'En Línea' : 'Desconectado'}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] uppercase font-black text-muted-foreground mb-1">Latencia Nucleus</p>
              <div className="flex items-center gap-2 justify-end text-neon-blue">
                <Zap className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase">{latency !== null ? `${latency}ms` : '---'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          icon={<Users className="w-5 h-5 text-neon-blue" />} 
          label="Usuarios Registrados" 
          value={users.length.toString()} 
          subValue={`${users.filter(u => u.role === 'STUDENT').length} Alumnos en base`}
        />
        <MetricCard 
          icon={<Rocket className="w-5 h-5 text-neon-purple" />} 
          label="Arsenal de Misiones" 
          value={filteredMissions.length.toString()} 
          subValue={`${activeMissions} Despliegues filtrados`}
        />
        <MetricCard 
          icon={<Activity className="w-5 h-5 text-emerald-400" />} 
          label="Sesiones en Vivo" 
          value={activeSessionsCount.toString()} 
          subValue="Actividad en la materia"
        />
        <MetricCard 
          icon={<ShieldAlert className="w-5 h-5 text-neon-pink" />} 
          label="Protocolos Violados" 
          value={totalViolations.toString()} 
          subValue={`${blockedUsers} Usuarios inactivos/bloqueados`}
          trend="high"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-xl overflow-hidden group">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black italic text-neon-blue uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Distribución de Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {roleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {roleData.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{r.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-primary/20 bg-card/40 backdrop-blur-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black italic text-neon-purple uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Actividad Neuronal (Intentos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="colorAttempts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#bc13fe" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#bc13fe" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }} 
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                  <Area type="monotone" dataKey="attempts" stroke="#bc13fe" strokeWidth={3} fillOpacity={1} fill="url(#colorAttempts)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] text-center text-muted-foreground mt-4 uppercase tracking-[0.3em] opacity-40 italic">Pulso de datos recopilado en tiempo real</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-primary/20 bg-card/40 backdrop-blur-xl">
           <div className="flex gap-4 border-b border-white/5 p-4 overflow-x-auto">
            {[
              { id: 'ACTIVITY', label: 'Seguridad', icon: ShieldAlert },
              { id: 'ATTEMPTS', label: 'Intentos', icon: Zap },
              { id: 'VIOLATIONS', label: 'Historial', icon: History },
              { id: 'BLOCKED', label: 'Bloqueados', icon: X },
            ].map(tab => (
              <Button 
                key={tab.id}
                variant="ghost" 
                size="sm"
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-[10px] font-black italic gap-2 h-8 ${activeTab === tab.id ? 'bg-secondary text-neon-blue' : 'opacity-40'}`}
              >
                <tab.icon className="w-3 h-3" /> {tab.label}
              </Button>
            ))}
          </div>

          <CardContent className="p-0">
            {activeTab === 'ACTIVITY' && (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/5">
                    <TableHead className="text-[10px] uppercase font-bold">Aspirante</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Pestañas</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Tiempo App</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-right">Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter(u => u.role === 'STUDENT' && ((u.tab_violations || 0) > 0 || (u.phone_violations || 0) > 0 || u.is_blocked)).sort((a,b) => ((b.tab_violations||0)+(b.phone_violations||0)) - ((a.tab_violations||0)+(a.phone_violations||0))).slice(0, 5).map(u => (
                    <TableRow key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <TableCell>
                        <div className="font-bold text-sm tracking-tighter">{u.full_name}</div>
                        <div className="text-[8px] opacity-40 uppercase font-mono">{u.matricula || u.id.slice(0,8)}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-neon-pink font-bold">{u.tab_violations || 0}</span>
                      </TableCell>
                      <TableCell>
                         <span className="text-[10px] font-mono text-neon-blue font-bold">
                           {u.time_spent ? `${Math.floor(u.time_spent / 60)}h ${u.time_spent % 60}m` : '0m'}
                         </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {u.is_blocked || u.active === false ? (
                          <Badge className="bg-neon-pink text-black text-[8px] font-black italic">BLOQUEADO</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-500 text-[8px] font-black italic">NOMINAL</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {activeTab === 'VIOLATIONS' && (
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <Table>
                  <TableBody>
                    {violations.map(v => (
                      <TableRow key={v.id} className="border-b border-white/5">
                        <TableCell className="py-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-bold">{v.user_name}</p>
                              <p className="text-[10px] text-muted-foreground italic uppercase">{v.quiz_title}</p>
                            </div>
                            <Badge variant="outline" className="text-[8px] border-neon-pink text-neon-pink">
                              {v.type === 'tab' ? 'SWITCH' : 'FOCUS'}
                            </Badge>
                          </div>
                          <p className="text-[8px] font-mono opacity-40 mt-1">{new Date(v.timestamp).toLocaleString()}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                    {violations.length === 0 && (
                      <TableRow>
                        <TableCell className="text-center py-10 opacity-40 italic text-xs">Sin registros de violación.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {hasMoreViolations && (
                  <Button 
                    variant="ghost" 
                    className="w-full h-10 text-[10px] font-black uppercase text-muted-foreground hover:text-neon-pink"
                    onClick={() => fetchTelemetry(true, 'violations')}
                    disabled={loadingMoreViolations}
                  >
                    {loadingMoreViolations ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cargar Más Violaciones'}
                  </Button>
                )}
              </div>
            )}

            {activeTab === 'ATTEMPTS' && (
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <Table>
                  <TableBody>
                    {attempts.filter(a => selectedSubjectId === 'ALL' || a.subject_id === selectedSubjectId).map(a => (
                      <TableRow key={a.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <TableCell className="py-3">
                          <div className="flex justify-between items-center text-xs">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-neon-blue/10 flex items-center justify-center border border-neon-blue/20">
                                  <Trophy className="w-4 h-4 text-neon-blue" />
                                </div>
                                <div>
                                  <p className="font-bold">{a.student_name}</p>
                                  <p className="text-[10px] text-muted-foreground uppercase">{a.quiz_title}</p>
                                </div>
                             </div>
                             <div className="text-right">
                                <p className={`font-black ${a.score >= 6 ? 'text-emerald-400' : 'text-neon-pink'}`}>{a.score.toFixed(1)}</p>
                                <p className="text-[8px] opacity-40 font-mono italic">{new Date(a.timestamp).toLocaleString()}</p>
                             </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {hasMoreAttempts && (
                  <Button 
                    variant="ghost" 
                    className="w-full h-10 text-[10px] font-black uppercase text-muted-foreground hover:text-neon-blue"
                    onClick={() => fetchTelemetry(true, 'attempts')}
                    disabled={loadingMoreAttempts}
                  >
                    {loadingMoreAttempts ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sincronizar Intentos Anteriores'}
                  </Button>
                )}
              </div>
            )}

            {activeTab === 'BLOCKED' && (
              <Table>
                <TableBody>
                  {users.filter(u => u.is_blocked || u.active === false).map(u => (
                    <TableRow key={u.id} className="border-b border-white/5">
                      <TableCell>
                        <div className="font-bold text-sm">{u.full_name}</div>
                        <div className="text-[8px] text-neon-pink mt-1 italic uppercase">{u.block_reason || 'Seguridad'}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-[8px] border-emerald-500/20 text-emerald-500"
                          onClick={async () => {
                             if (confirm(`¿Desbloquear a ${u.full_name}?`)) {
                               await supabase.from('profiles').update({ is_blocked: false, active: true, tab_violations: 0, phone_violations: 0, block_reason: null }).eq('id', u.id);
                               notify('Usuario habilitado.', 'success');
                             }
                          }}
                        >
                          HABILITAR
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.filter(u => u.is_blocked || u.active === false).length === 0 && (
                     <TableRow>
                        <TableCell className="text-center py-10 opacity-40 italic text-xs">Sin usuarios bloqueados.</TableCell>
                     </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-sm font-black italic text-neon-pink uppercase tracking-widest flex items-center gap-2">
               <Cpu className="w-4 h-4" /> Salud del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <HealthIndicator 
              label="Nucleus Engine" 
              status={isOnline ? 'Operational' : 'Critical'} 
              value={`${latency || '---'} ms`} 
              percentage={latency ? Math.max(100 - (latency / 10), 0) : 0} 
              color={isOnline ? 'emerald' : 'rose'}
            />
            <HealthIndicator 
              label="Supabase I/O" 
              status="Normal" 
              value="Async" 
              percentage={95} 
              color="emerald"
            />
            <HealthIndicator 
              label="Neural Cache" 
              status="Optimized" 
              value="Safe" 
              percentage={100} 
              color="emerald"
            />
            <div className="pt-4 border-t border-white/5 space-y-2">
               <div className="flex justify-between items-center text-[8px] font-black uppercase text-muted-foreground">
                  <span>Version de Núcleo</span>
                  <span className="text-neon-blue">LATT-V4.0.2</span>
               </div>
               <div className="flex justify-between items-center text-[8px] font-black uppercase text-muted-foreground">
                  <span>Uptime</span>
                  <span className="text-neon-blue">99.9%</span>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthIndicator({ label, status, value, percentage, color }: { label: string, status: string, value: string, percentage: number, color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">{label}</p>
          <p className={`text-[9px] font-bold uppercase italic ${color === 'emerald' ? 'text-emerald-400' : 'text-neon-pink'}`}>{status}</p>
        </div>
        <span className="text-xs font-black font-mono">{value}</span>
      </div>
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Number.isNaN(percentage) ? 0 : percentage}%` }}
          className={`h-full ${color === 'emerald' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-neon-pink shadow-[0_0_8px_rgba(255,0,255,0.5)]'}`}
        />
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subValue, trend }: { icon: any, label: string, value: string, subValue: string, trend?: 'high' | 'low' }) {
  return (
    <Card className={`border-primary/10 bg-card/40 backdrop-blur-xl p-5 neo-glow relative overflow-hidden transition-all hover:scale-[1.05] group ${trend === 'high' ? 'border-neon-pink/30' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 group-hover:bg-white/10 transition-colors">
          {icon}
        </div>
        {trend && (
           <div className={`px-2 py-0.5 rounded-full text-[8px] font-black italic uppercase tracking-tighter ${trend === 'high' ? 'bg-neon-pink/20 text-neon-pink shadow-[0_0_8px_rgba(255,0,255,0.2)]' : 'bg-emerald-400/20 text-emerald-400'}`}>
              SENSOR: {trend === 'high' ? 'ACTUANDO' : 'ESTABLE'}
           </div>
        )}
      </div>
      <div className="relative z-10">
        <h3 className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] leading-tight mb-1">{label}</h3>
        <p className="text-4xl font-black italic tracking-tighter text-foreground group-hover:text-neon-blue transition-colors">{value}</p>
        <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase opacity-60 group-hover:opacity-100 transition-opacity">{subValue}</p>
      </div>
      <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-5 rotate-12 group-hover:rotate-0 transition-all duration-500">
        {icon}
      </div>
    </Card>
  );
}

function GroupIcon({ name }: { name: string }) {
  const nameL = name.toLowerCase();
  let img = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=100"; // Default Tech
  
  if (nameL.includes('progra')) img = "https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=100";
  if (nameL.includes('meca')) img = "https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?auto=format&fit=crop&q=80&w=100";
  if (nameL.includes('admin')) img = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=100";
  if (nameL.includes('logis')) img = "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=100";
  if (nameL.includes('conta')) img = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=100";
  if (nameL.includes('alim')) img = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=100";

  return (
    <div className="w-8 h-8 rounded-lg overflow-hidden border border-neon-blue/30 shadow-[0_0_8px_rgba(0,243,255,0.2)]">
      <img src={img} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
    </div>
  );
}

export function LoadingPulse({ message = "Cargando datos..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-in fade-in duration-700">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-t-2 border-neon-blue animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 relative">
            <img 
              src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
              alt="Logo" 
              className="w-full h-full object-contain animate-pulse mix-blend-screen"
            />
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">{message}</p>
        <p className="text-[8px] font-mono opacity-30 mt-1">Conectando con Neural Link...</p>
      </div>
    </div>
  );
}

function GlobalMissionsManagement() {
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMissionDoc, setLastMissionDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMissions = async (isNextPage = false) => {
    try {
      if (isNextPage) setLoadingMore(true);
      else setLoading(true);

      const query = supabase
        .from('quizzes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      const { data, error } = await query;
      if (error) throw error;

      if (isNextPage) {
        setMissions(prev => [...prev, ...data]);
      } else {
        setMissions(data);
      }

      setHasMore(data.length === 25);
    } catch (err) {
      errorService.handle(err, 'Global Missions Fetch');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMissions();
  }, []);

  const handleDelete = async (mission: any) => {
    if (!confirm(`¿Estás seguro de ELIMINAR la misión "${mission.title}"? Esta acción borrará todas las preguntas y registros asociados.`)) return;
    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', mission.id);
      if (error) throw error;
      setMissions(prev => prev.filter(m => m.id !== mission.id));
      notify('Misión eliminada del sistema.', 'success');
      playSound.click();
    } catch (err) {
      errorService.handle(err, 'Delete Mission');
    }
  };

  const filteredMissions = missions.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.teacher_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingPulse message="Sincronizando Banco de Misiones" />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">Gestión Global de Misiones</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest opacity-70">Control de misiones activas en todos los sectores</p>
        </div>
        <div className="flex gap-2">
           <Input 
             placeholder="Filtrar por título..." 
             className="w-64 h-10 text-xs font-mono"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
           />
           <Button variant="ghost" size="icon" className="h-10 w-10 border border-white/10 hover:bg-white/5" onClick={() => fetchMissions()}>
              <RefreshCw className="w-4 h-4" />
           </Button>
        </div>
      </div>

      <Card className="border-border bg-card/40 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/5">
              <TableHead className="text-[10px] uppercase font-black">Misión / Título</TableHead>
              <TableHead className="text-[10px] uppercase font-black">Docente responsable</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-center">Reactivos</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-center">Estatus</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMissions.map(m => (
              <TableRow key={m.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm tracking-tight">{m.title}</span>
                    <span className="text-[8px] font-mono text-neon-blue uppercase">{m.type} // ID: {m.id.slice(0, 8)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs opacity-70 font-mono tracking-tighter">
                  {m.teacherId || 'SISTEMA'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-[10px] font-mono border-white/10">
                    {m.questionsCount || 0}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                   {m.status === 'PUBLISHED' ? (
                     <Badge className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black italic">PUBLICADA</Badge>
                   ) : (
                     <Badge variant="outline" className="opacity-40 text-[8px] font-black italic">BORRADOR</Badge>
                   )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(m)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {hasMore && (
          <div className="p-4 border-t border-white/10 flex justify-center">
             <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-neon-blue" onClick={() => fetchMissions(true)} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : 'Descargar Mas Datos de Misión'}
             </Button>
          </div>
        )}
      </Card>
      
      <div className="py-10 opacity-30 text-center">
         <p className="text-[8px] uppercase font-black tracking-[0.5em]">Fin de Transmisión del Banco de Misiones</p>
      </div>
    </div>
  );
}

function UserManagement() {
  const { user } = useAuthStore();
  const { subjects, groups } = useSubjectsGroupsStore();
  const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'add' | 'config' | 'nexus' | 'invitations' | 'ai-groups' | 'bulk'>('list');
  const [globalSettings, setGlobalSettings] = useState({
    hideRankings: false,
    teacherDomain: 'gmail.com'
  });

  useEffect(() => {
    // Migrated to Supabase config or local state
    // For now we use default settings as we don't have a config table yet
  }, []);

  const updateGlobalSetting = async (key: string, value: any) => {
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
    // In production, sync this to a 'global_config' table in Supabase
  };
  const [role, setRole] = useState('STUDENT');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [motherLastName, setMotherLastName] = useState('');
  const [matricula, setMatricula] = useState('');
  const [email, setEmail] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const [users, setUsers] = useState<any[]>([]);
  const [lastUserDoc, setLastUserDoc] = useState<any>(null);
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [addingUser, setAddingUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [groupName, setGroupName] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [filterRole, setFilterRole] = useState('ALL');
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterRole]);

  const downloadUserTemplate = () => {
    const headers = ['NOMBRE', 'APELLIDO_PATERNO', 'APELLIDO_MATERNO', 'MATRICULA', 'EMAIL', 'ROL', 'GRUPOS', 'MATERIAS'];
    const example = ['JUAN', 'PEREZ', 'GARCIA', '2024001', 'juan.perez@email.com', 'STUDENT', '1A, 1B', 'FISICA, MATEMATICAS'];
    const csvContent = [headers, example].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'plantilla_usuarios_lattquiz.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Plantilla generada.', 'success');
  };

  const handleBulkUpload = async (text: string) => {
    if (!text.trim()) return;
    setIsProcessingBulk(true);
    try {
      const rows = text.split('\n').filter(r => r.trim());
      // Skip header if matches template
      const startIndex = rows[0]?.toUpperCase().includes('NOMBRE') ? 1 : 0;
      
      const batchSize = 100;
      let processed = 0;
      
      for (let i = startIndex; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const chunkData: any[] = [];
        
        for (const row of chunk) {
          const parts = row.split(',').map(s => s?.trim());
          if (parts.length < 2) continue;

          const [name, lastName, motherLastName, matricula, email, role, groupsStr, subjectsStr] = parts;
          if (!name || !lastName) continue;

          const finalRole = ['STUDENT', 'TEACHER', 'ADMIN'].includes(role?.toUpperCase()) ? role.toUpperCase() : 'STUDENT';
          const suffix = Math.random().toString(36).slice(-3).toUpperCase();
          const generatedId = matricula || `U-${Date.now().toString(36)}-${suffix}`;
          
          const groupIds = groupsStr ? groupsStr.split(';').map(gn => groups.find(g => g.name.trim().toUpperCase() === gn.trim().toUpperCase())?.id).filter(Boolean) : [];
          const subjectIds = subjectsStr ? subjectsStr.split(';').map(sn => subjects.find(s => s.name.trim().toUpperCase() === sn.trim().toUpperCase())?.id).filter(Boolean) : [];

          chunkData.push({
            display_name: `${name} ${lastName}`,
            email: email || `${generatedId.toLowerCase()}@lattquiz.local`,
            role: finalRole,
            matricula,
            group_ids: groupIds,
            subject_ids: subjectIds,
            active: true
          });
        }

        if (chunkData.length > 0) {
          const { error } = await supabase.from('profiles').upsert(chunkData, { onConflict: 'email' });
          if (error) throw error;
        }
        processed += chunk.length;
      }
      notify(`${processed} Usuarios procesados con éxito.`, 'success');
      setShowBulkUpload(false);
      setBulkData('');
      setActiveTab('list');
      // fetchUsersAndRequests(); // Ensure this exists or use fetchUsers
    } catch (err) {
      errorService.handle(err, 'Bulk User Upload');
    } finally {
      setIsProcessingBulk(false);
    }
  };
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const { addSubject, removeSubject, addGroup, removeGroup } = useSubjectsGroupsStore();

  const handleAddSubject = async () => {
    if (!subjectName.trim()) return;
    await addSubject(subjectName);
    setSubjectName('');
  };

  const handleRemoveSubject = async (id: string) => {
    if (confirm('¿Eliminar materia?')) await removeSubject(id);
  };

  const handleAddGroup = async () => {
    if (!groupName.trim()) return;
    await addGroup(groupName);
    setGroupName('');
  };

  const handleRemoveGroup = async (id: string) => {
    if (confirm('¿Eliminar grupo?')) await removeGroup(id);
  };

  const fetchUsersAndRequests = async (isNextPage = false) => {
    try {
      if (isNextPage) setLoadingMoreUsers(true);
      else setLoading(true);

      const query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      const [resU, resR] = await Promise.all([
        query,
        !isNextPage ? supabase.from('requests').select('*').eq('status', 'PENDING').limit(100) : Promise.resolve({ data: [], error: null })
      ]);

      if (resU.error) throw resU.error;
      if (resR.error) throw resR.error;

      const newUsers = resU.data || [];
      
      if (isNextPage) {
        setUsers(prev => [...prev, ...newUsers]);
      } else {
        setUsers(newUsers);
        setRequests(resR.data || []);
      }

      setHasMoreUsers(newUsers.length === 50);
      
      setLoading(false);
      setLoadingMoreUsers(false);
    } catch (err) {
      errorService.handle(err, 'Users/Requests Fetch');
      setLoading(false);
      setLoadingMoreUsers(false);
    }
  };

  useEffect(() => {
    fetchUsersAndRequests();
  }, []);

  const handleAddUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !lastName.trim()) {
      alert('Nombre y Apellido Paterno son obligatorios.');
      return;
    }
    if (role === 'ADMIN' && (!email || !email.includes('@'))) {
      alert('Debes proporcionar un Gmail válido para el Administrador.');
      return;
    }

    setAddingUser(true);
    
    // Robust ID generation logic
    const suffix = Date.now().toString(36).slice(-3).toUpperCase();
    const lastUpper = lastName.split(' ')[0].toUpperCase();
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 3);
    const rolePrefix = role === 'STUDENT' ? 'A' : role === 'TEACHER' ? 'D' : 'M';
    const generatedId = `CBTA147${rolePrefix}${suffix}_${lastUpper}_${namePart}`;
    const generatedCode = (role === 'STUDENT' || role === 'TEACHER') 
      ? `LTQ-${role === 'STUDENT' ? 'A' : 'D'}-${Math.floor(100000 + Math.random() * 900000)}`
      : null;
    
    const finalUid = role === 'ADMIN' ? (email ? email.toLowerCase().trim() : generatedId) : (matricula ? matricula.toUpperCase().trim() : generatedId);

    try {
      const gIds = selectedGroupIds;
      const sIds = selectedSubjectIds;

      const { error } = await supabase.from('profiles').insert({
        id: finalUid,
        full_name: `${name} ${lastName} ${motherLastName}`.trim().toUpperCase(),
        name: name.toUpperCase().trim(),
        last_name: lastName.toUpperCase().trim(),
        mother_last_name: motherLastName.toUpperCase().trim(),
        matricula: matricula ? matricula.toUpperCase().trim() : null,
        email: email ? email.toLowerCase().trim() : null,
        role,
        is_first_time: true,
        group_ids: gIds,
        subject_ids: sIds,
        student_code: generatedCode,
        active: true,
        average_grade: 10.0,
        wildcards: {}
      });

      if (error) throw error;
      
      setName('');
      setLastName('');
      setMotherLastName('');
      setMatricula('');
      setEmail('');
      setSelectedGroupIds([]);
      setSelectedSubjectIds([]);
      notify('Vínculo exitoso: ' + finalUid, 'success');
      fetchUsersAndRequests();
    } catch (error: any) {
      errorService.handle(error, 'Add User');
    } finally {
      setAddingUser(false);
    }
  };

  const handleProcessDeleteRequest = async (req: any, approved: boolean) => {
    if (!approved) {
      await supabase.from('requests').update({ status: 'REJECTED', processed_at: new Date().toISOString() }).eq('id', req.id);
      notify('Solicitud rechazada.', 'success');
      return;
    }

    if (!confirm('¿ESTÁS SEGURO? Esta acción ELIMINARÁ el usuario y TODOS sus registros permanentemente.')) return;

    try {
      await supabase.from('attempts').delete().eq('student_id', req.student_id);
      await supabase.from('profiles').delete().eq('id', req.student_id);
      await supabase.from('requests').update({ status: 'APPROVED', processed_at: new Date().toISOString() }).eq('id', req.id);

      notify('Baja procesada y registros eliminados.', 'success');
      fetchUsersAndRequests();
    } catch (e) {
      errorService.handle(e, 'Process Delete Request');
    }
  };

  const handleApproveRequest = async (req: any, selectedRole: string, teacherEmail?: string) => {
    try {
      if (selectedRole === 'ADMIN' && !teacherEmail) {
        alert('Se requiere un correo Gmail para enrolar a un Administrador.');
        return;
      }

      const suffix = Date.now().toString(36).slice(-3).toUpperCase();
      const lastUpper = (req.last_name || 'XXX').split(' ')[0].toUpperCase();
      const namePart = (req.name || 'XXX').split(' ')[0].toUpperCase().substring(0, 3);
      const rolePrefix = selectedRole === 'STUDENT' ? 'A' : selectedRole === 'TEACHER' ? 'D' : 'M';
      const generatedId = `CBTA147${rolePrefix}${suffix}_${lastUpper}_${namePart}`;
      const generatedCode = (selectedRole === 'STUDENT' || selectedRole === 'TEACHER') ? Math.floor(10000000 + Math.random() * 90000000).toString() : null;

      const finalId = selectedRole === 'ADMIN' ? teacherEmail!.toLowerCase().trim() : (req.matricula ? req.matricula.toUpperCase().trim() : generatedId);
      
      const { error: insertError } = await supabase.from('profiles').insert({
        id: finalId,
        full_name: `${req.name} ${req.last_name} ${req.mother_last_name || ''}`.trim().toUpperCase(),
        name: req.name.toUpperCase().trim(),
        last_name: req.last_name.toUpperCase().trim(),
        mother_last_name: req.mother_last_name ? req.mother_last_name.toUpperCase().trim() : '',
        role: selectedRole,
        email: teacherEmail ? teacherEmail.toLowerCase().trim() : null,
        matricula: req.matricula ? req.matricula.toUpperCase().trim() : null,
        group_ids: req.group_id ? [req.group_id] : [],
        subject_ids: req.subject_id ? [req.subject_id] : [],
        student_code: generatedCode,
        is_first_time: true,
        active: true,
        average_grade: 10.0,
        wildcards: {}
      });

      if (insertError) throw insertError;

      await supabase.from('requests').update({ status: 'APPROVED' }).eq('id', req.id);
      alert('Solicitud aprobada con éxito como ' + selectedRole + '. ID Generado: ' + finalId);
      fetchUsersAndRequests();
    } catch (e) {
      console.error(e);
      alert('Error en aprobación');
    }
  };

  const resetRankings = async () => {
    if (!confirm('¿Deseas resetear todos los promedios y comodines?')) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ average_grade: 10.0, wildcards: {} })
        .eq('role', 'STUDENT');
      if (error) throw error;
      alert('Sistemas reiniciados');
      fetchUsersAndRequests();
    } catch (e) {
      errorService.handle(e, 'Reboot Rankings');
    }
  };

  const suffixPreview = "XXX";
  const lastUpper = lastName.split(' ')[0].toUpperCase() || 'XXX';
  const namePartsPreview = name.toUpperCase().split(' ');
  let nameUpperPreview = 'XXX';
  if (namePartsPreview.length > 0 && namePartsPreview[0].length >= 3) {
    if (namePartsPreview.length >= 2) nameUpperPreview = namePartsPreview[0].substring(0,2) + namePartsPreview[namePartsPreview.length-1].substring(0,1);
    else nameUpperPreview = namePartsPreview[0].substring(0,3);
  }
  const rolePrefix = role === 'STUDENT' ? 'A' : role === 'TEACHER' ? 'D' : 'M';
  const previewId = `CBTA147${rolePrefix}${suffixPreview}_${lastUpper}_${nameUpperPreview}`;

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         u.matricula?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);

  const handleEditUser = (user: any) => {
    setEditingUserId(user.id);
    setEditData({
      displayName: user.full_name,
      role: user.role,
      groupIds: user.group_ids || [],
      email: user.email || '',
      matricula: user.matricula || '',
      subjectIds: user.subject_ids || []
    });
  };

  const saveUserEdits = async () => {
    if (!editingUserId) return;
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: editData.displayName,
        role: editData.role,
        group_ids: editData.groupIds,
        subject_ids: editData.subjectIds,
        email: editData.email || null,
        matricula: editData.matricula || null
      }).eq('id', editingUserId);

      if (error) throw error;
      setEditingUserId(null);
      alert('Cambios guardados');
      fetchUsersAndRequests();
    } catch (e) {
      errorService.handle(e, 'Save User Edits');
    }
  };

  const processBulkUpload = async () => {
    if (!bulkData.trim()) return;
    setIsProcessingBulk(true);
    try {
      const lines = bulkData.split('\n');
      const studentsToInsert = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',').map(s => s?.trim());
        if (parts.length < 3) continue;

        const [mat, nom, apP, apM, gCode] = parts;
        if (!nom || !apP) continue;

        const suffix = Math.random().toString(36).slice(-3).toUpperCase();
        const generatedCode = `LTQ-A-${Math.floor(100000 + Math.random() * 900000)}`;
        const finalUid = mat ? mat.toUpperCase() : `CBTA147A${suffix}_${apP.toUpperCase()}_${nom.substring(0,3).toUpperCase()}`;

        studentsToInsert.push({
          id: finalUid,
          full_name: `${nom} ${apP} ${apM || ''}`.trim().toUpperCase(),
          name: nom.toUpperCase(),
          last_name: apP.toUpperCase(),
          mother_last_name: apM?.toUpperCase() || '',
          matricula: mat?.toUpperCase() || null,
          role: 'STUDENT',
          is_first_time: true,
          group_ids: gCode ? [gCode] : [],
          subject_ids: [],
          student_code: generatedCode,
          active: true,
          average_grade: 10.0,
          wildcards: {}
        });
      }

      if (studentsToInsert.length > 0) {
        for (let i = 0; i < studentsToInsert.length; i += 500) {
          const chunk = studentsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('profiles').insert(chunk);
          if (error) throw error;
        }
      }

      setShowBulkUpload(false);
      setBulkData('');
      notify(`Se han importado ${studentsToInsert.length} alumnos exitosamente`, 'success');
      fetchUsersAndRequests();
    } catch (error) {
      errorService.handle(error, 'Bulk Upload');
      notify('Error en la carga masiva', 'error');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const regenerateUserCode = async (uid: string) => {
    if (!confirm('¿Regenerar código de acceso para este usuario?')) return;
    try {
      const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      const { error } = await supabase.from('profiles').update({ student_code: newCode }).eq('id', uid);
      if (error) throw error;
      notify('Código regenerado', 'success');
      playSound.success();
      fetchUsersAndRequests();
    } catch (e) {
      notify('Error al regenerar', 'error');
    }
  };

  const toggleGroup = (groupId: string) => {
    const current = editData.groupIds || [];
    if (current.includes(groupId)) {
      setEditData({ ...editData, groupIds: current.filter((id: string) => id !== groupId) });
    } else {
      setEditData({ ...editData, groupIds: [...current, groupId] });
    }
  };

  const toggleSubject = (subId: string) => {
    const current = editData.subjectIds || [];
    if (current.includes(subId)) {
      setEditData({ ...editData, subjectIds: current.filter((id: string) => id !== subId) });
    } else {
      setEditData({ ...editData, subjectIds: [...current, subId] });
    }
  };

  const regenerateAllCodes = async () => {
    if (!window.confirm('¿Estás seguro de regenerar los códigos de TODOS los alumnos? Esto invalidará sus accesos actuales.')) return;
    
    setLoading(true);
    try {
      const { data: allUsers, error: fetchError } = await supabase.from('profiles').select('id, role');
      if (fetchError) throw fetchError;

      const updates = allUsers.map(u => {
        if (u.role === 'STUDENT' || u.role === 'TEACHER') {
          const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
          return { id: u.id, student_code: newCode };
        } else {
          return { id: u.id, student_code: null };
        }
      });

      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        const { error } = await supabase.from('profiles').upsert(chunk);
        if (error) throw error;
      }
      
      notify('Códigos de alumnos regenerados con éxito', 'success');
      playSound.success();
      fetchUsersAndRequests();
    } catch (e) {
      console.error(e);
      notify('Error al regenerar códigos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete: any) => {
    if (userToDelete.id === user?.uid) {
      alert('No puedes eliminar tu propia cuenta desde este panel.');
      return;
    }

    if (userToDelete.role === 'ADMIN' && users.filter(u => u.role === 'ADMIN').length <= 1) {
      alert('No puedes eliminar al último administrador del sistema.');
      return;
    }
    
    const confirmed = confirm(`¡ADVERTENCIA CRÍTICA!\n\n¿Estás seguro de ELIMINAR PERMANENTEMENTE a "${userToDelete.full_name || userToDelete.displayName}"?\n\nEsta acción es irreversible y borrará todo su historial.`);
    if (!confirmed) return;
    
    playSound.delete();
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userToDelete.id);
      if (error) throw error;
      notify('Registro eliminado del sistema central.', 'success');
      fetchUsersAndRequests();
    } catch (e: any) {
      errorService.handle(e, 'Delete Permanent User');
    }
  };

  const toggleUserActive = async (user: any) => {
    playSound.click();
    try {
      const { error } = await supabase.from('profiles').update({ active: user.active === false }).eq('id', user.id);
      if (error) throw error;
      fetchUsersAndRequests();
    } catch (e) {
      errorService.handle(e, 'Toggle User Status');
    }
  };

  const handleToggleSelectAll = () => {
    playSound.click();
    if (selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleSelectUser = (uid: string) => {
    playSound.click();
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleBulkReset = async (profileOnly: boolean = false) => {
    if (selectedUserIds.length === 0) return;
    const msg = profileOnly 
      ? `¿REINICIAR PERFIL de ${selectedUserIds.length} usuarios? (Mantiene historial, limpia ajustes)`
      : `¿REINICIAR TODO de ${selectedUserIds.length} usuarios? (Borra intentos y promedios)`;
      
    if (!confirm(msg)) return;
    
    setLoading(true);
    try {
      const updates = selectedUserIds.map(uid => ({
        id: uid,
        wildcards: {},
        average_grade: profileOnly ? undefined : 10.0,
        is_blocked: false,
        tab_violations: 0,
        phone_violations: 0,
        is_first_time: true
      }));

      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        const { error } = await supabase.from('profiles').upsert(chunk);
        if (error) throw error;
      }

      if (!profileOnly) {
         await supabase.from('attempts').delete().in('student_id', selectedUserIds);
      }
      
      notify('Reinicio completado con éxito', 'success');
      playSound.success();
      setSelectedUserIds([]);
      fetchUsersAndRequests();
    } catch (e) {
      console.error(e);
      notify('Error al reiniciar datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    if (!confirm(`¡ACCIÓN FATAL!\n\n¿Estás realmente seguro de ELIMINAR ${selectedUserIds.length} USUARIOS?\n\nEsta acción borrará promedios, sesiones y expedientes de forma permanente.`)) return;
    
    playSound.delete();
    try {
      const { error } = await supabase.from('profiles').delete().in('id', selectedUserIds.filter(id => id !== user?.uid));
      if (error) throw error;
      
      setSelectedUserIds([]);
      playSound.success();
      notify(`Sistemas purgados: ${selectedUserIds.length} registros eliminados`, 'success');
      fetchUsersAndRequests();
    } catch (e: any) {
      playSound.error();
      errorService.handle(e, 'Bulk Delete Users');
    }
  };

  const handleExportExcel = () => {
    if (selectedUserIds.length === 0) return;
    const usersToExport = users.filter(u => selectedUserIds.includes(u.id));
    
    const data = usersToExport.map(u => ({
      'ID de Usuario': u.id,
      'Nombre Completo': u.displayName,
      'Matrícula': u.matricula || 'N/A',
      'Código de Acceso': u.studentCode || 'N/A',
      'Rol': u.role,
      'Grupos': (u.groupIds || []).map((id: string) => groups.find(g => g.id === id)?.name).filter(Boolean).join(', '),
      'Materias': (u.subjectIds || []).map((id: string) => subjects.find(s => s.id === id)?.name).filter(Boolean).join(', ')
    }));

    const worksheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Usuarios');
    
    writeFile(workbook, `Reporte_Usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    notify('Reporte Excel generado', 'success');
    playSound.success();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg w-fit overflow-x-auto">
            <Button variant={activeTab === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('list')}>
              <Users className="w-4 h-4 mr-1" /> Usuarios
            </Button>
            <Button variant={activeTab === 'requests' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('requests')} className="relative">
              <ShieldAlert className="w-4 h-4 mr-1" /> Solicitudes
              {requests.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[8px] rounded-full flex items-center justify-center text-white font-bold">{requests.length}</span>}
            </Button>
            <Button variant={activeTab === 'bulk' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('bulk')}>
              <Upload className="w-4 h-4 mr-1" /> Carga Masiva
            </Button>
            <Button variant={activeTab === 'nexus' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('nexus')}>
            <Rocket className="w-4 h-4 mr-1" /> Nexus Manager
          </Button>
          <Button variant={activeTab === 'invitations' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('invitations')}>
            <Copy className="w-4 h-4 mr-1" /> Invitaciones
          </Button>
          <Button variant={activeTab === 'add' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('add')}>
            <Plus className="w-4 h-4 mr-1" /> Registrar
          </Button>
          <Button variant={activeTab === 'config' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('config')}>
            <LayoutGrid className="w-4 h-4 mr-1" /> Grupos/Config
          </Button>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" className={globalSettings.hideRankings ? "border-amber-500 text-amber-500" : "text-muted-foreground"} onClick={() => updateGlobalSetting('hideRankings', !globalSettings.hideRankings)}>
             {globalSettings.hideRankings ? 'Rankings Ocultos' : 'Rankings Visibles'}
           </Button>
           <Button variant="outline" size="sm" className="text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={resetRankings}>
             <Trash2 className="w-4 h-4 mr-2" /> Reset Rankings
           </Button>
        </div>
      </div>

      {editingUserId && (
        <Card className="border-neon-purple/50 bg-card/80 backdrop-blur-xl mb-6 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5">
            <div>
              <CardTitle className="text-xl font-black italic text-neon-purple">MODIFICAR EXPEDIENTE</CardTitle>
              <p className="text-[10px] text-muted-foreground uppercase font-mono">{editingUserId}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEditingUserId(null)}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold opacity-70">Nombre para Mostrar</Label>
                <Input value={editData.displayName} onChange={e => setEditData({...editData, displayName: e.target.value})} className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold opacity-70">Perfil / Rol Administrativo</Label>
                <select value={editData.role} onChange={e => setEditData({...editData, role: e.target.value})} className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:ring-2 focus:ring-neon-purple font-bold">
                  <option value="STUDENT">ALUMNO (Nivel de Solicitante)</option>
                  <option value="TEACHER">DOCENTE (Nivel de Gestión Curriculum)</option>
                  <option value="ADMIN">ADMINISTRADOR (Acceso Total)</option>
                </select>
                <p className="text-[8px] text-muted-foreground uppercase mt-1 leading-tight">
                  {editData.role === 'ADMIN' ? 'Permisos: Acceso a Telemetría Global, Gestión de Usuarios, Configuración del Sistema y Acciones Bulk.' :
                   editData.role === 'TEACHER' ? 'Permisos: Creación de Misiones, Gestión de Alumnos Asignados, Biblioteca de Preguntas y Telemetría Semántica.' :
                   'Permisos: Acceso a Misiones Asignadas, Rankings de Grupo y Perfil de Gamificación Personal.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold opacity-70">{editData.role === 'ADMIN' ? 'Email (Acceso Google)' : (editData.role === 'STUDENT' ? 'Matrícula' : 'Identificador de Acceso')}</Label>
                <Input 
                  value={editData.role === 'ADMIN' ? editData.email : (editData.role === 'STUDENT' ? editData.matricula : editData.userId)} 
                  onChange={e => setEditData({...editData, [editData.role === 'ADMIN' ? 'email' : (editData.role === 'STUDENT' ? 'matricula' : 'userId')]: e.target.value})} 
                  placeholder={editData.role === 'ADMIN' ? "correo@gmail.com" : (editData.role === 'STUDENT' ? "12345678" : "ID-DOCENTE")}
                  className="bg-background/50"
                  disabled={editData.role !== 'ADMIN' && editData.role !== 'STUDENT'}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
              <div className="space-y-3">
                <Label className="text-[10px] uppercase font-bold text-neon-blue flex items-center gap-2">
                  <Users className="w-3 h-3" /> Asignación de Grupos
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-auto p-1">
                  {groups.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        editData.groupIds.includes(g.id) 
                        ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' 
                        : 'bg-secondary/20 border-border text-muted-foreground hover:border-neon-blue/30'
                      }`}
                    >
                      {g.name}
                      {editData.groupIds.includes(g.id) && <Plus className="w-3 h-3 rotate-45" />}
                    </button>
                  ))}
                  {groups.length === 0 && <p className="text-[10px] italic text-muted-foreground col-span-2">No hay grupos configurados.</p>}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] uppercase font-bold text-neon-purple flex items-center gap-2">
                  <BookOpen className="w-3 h-3" /> Asignación de Materias
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-auto p-1">
                  {subjects.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        editData.subjectIds.includes(s.id) 
                        ? 'bg-neon-purple/20 border-neon-purple text-neon-purple' 
                        : 'bg-secondary/20 border-border text-muted-foreground hover:border-neon-purple/30'
                      }`}
                    >
                      {s.name}
                      {editData.subjectIds.includes(s.id) && <Plus className="w-3 h-3 rotate-45" />}
                    </button>
                  ))}
                   {subjects.length === 0 && <p className="text-[10px] italic text-muted-foreground col-span-2">No hay materias configuradas.</p>}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <Button variant="ghost" onClick={() => setEditingUserId(null)} className="text-xs uppercase font-bold">Cancelar</Button>
              <Button onClick={saveUserEdits} className="bg-neon-purple text-white px-8 font-black italic uppercase tracking-tighter">
                Actualizar Registro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 relative">
              <Input 
                placeholder="Buscar por nombre, matrícula o ID..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-card/50 border-white/10 pl-10 h-10 italic"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Users className="w-4 h-4 opacity-50" />
              </div>
            </div>
            <div className="flex gap-2 p-1 bg-card/50 rounded-lg border border-white/5">
              {['ALL', 'STUDENT', 'TEACHER', 'ADMIN'].map(r => (
                <button
                  key={r}
                  onClick={() => { playSound.click(); setFilterRole(r); }}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-black uppercase transition-all whitespace-nowrap ${
                    filterRole === r 
                    ? 'bg-neon-blue text-black shadow-[0_0_10px_rgba(0,243,255,0.4)]' 
                    : 'text-muted-foreground hover:text-white'
                  }`}
                >
                  {r === 'ALL' ? 'Todos' : r === 'STUDENT' ? 'Alumnos' : r === 'TEACHER' ? 'Docentes' : 'Admins'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center bg-card/40 border border-border p-3 rounded-lg">
             <div className="flex items-center gap-2">
               <button 
                 onClick={handleToggleSelectAll}
                 className={`flex items-center justify-center w-5 h-5 rounded border transition-all ${
                   selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.length
                   ? 'bg-neon-blue border-neon-blue text-white' 
                   : 'border-white/20 hover:border-neon-blue/50'
                 }`}
               >
                 {selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.length && <CheckSquare className="w-4 h-4" />}
               </button>
               <span className="text-[10px] font-black uppercase opacity-60">Seleccionar Todo ({filteredUsers.length})</span>
             </div>
             {selectedUserIds.length > 0 && (
               <div className="flex gap-2">
                 <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={handleExportExcel} className="h-7 text-[10px] font-bold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"> <FileText className="w-3 h-3 mr-1" /> EXPORTAR EXCEL ({selectedUserIds.length}) </Button> <Button variant="outline" size="sm" onClick={() => handleBulkReset(true)}
                   className="h-7 text-[10px] font-bold border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10"
                 >
                   <History className="w-3 h-3 mr-1" /> REINICIAR PERFILES ({selectedUserIds.length})
                 </Button>
                 <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={() => handleBulkReset(false)}
                   className="h-7 text-[10px] font-bold border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                 >
                   <RefreshCw className="w-3 h-3 mr-1" /> REINICIAR TODO ({selectedUserIds.length})
                 </Button>
                 <Button 
                   variant="destructive" 
                   size="sm" 
                   onClick={handleBulkDelete}
                   className="h-7 text-[10px] font-bold bg-red-500/80 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                 >
                   <Trash2 className="w-3 h-3 mr-1" /> ELIMINAR SELECCIONADOS ({selectedUserIds.length})
                 </Button>
               </div>
             )}
          </div>

          <Card className="border-primary/20 bg-card/50 backdrop-blur-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black italic text-neon-blue uppercase tracking-widest">Base de Datos de Usuarios</CardTitle>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Gestión de identidades y accesos biométricos</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={regenerateAllCodes}
                  className="text-[10px] font-black uppercase text-neon-blue border-neon-blue/30 hover:bg-neon-blue/10 gap-2"
                >
                  <Zap className="w-3 h-3" /> Regenerar Códigos
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setActiveTab('bulk')}
                  className="text-[10px] font-black uppercase text-neon-purple border-neon-purple/30 hover:bg-neon-purple/10 gap-2"
                >
                  <Plus className="w-3 h-3" /> Carga Masiva
                </Button>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/5">
                  <TableHead className="w-[40px] px-4">
                     <div className="w-4" />
                  </TableHead>
                  <TableHead>Identidad</TableHead>
                  <TableHead>Rol / Permisos</TableHead>
                  <TableHead>Acceso / Credenciales</TableHead>
                  <TableHead>Comodines / Promedio</TableHead>
                  <TableHead className="text-right">Gestión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((u) => {
                const userGroups = (u.groupIds || []).map((id: string) => groups.find(g => g.id === id)?.name).filter(Boolean);
                const userSubjects = (u.subjectIds || []).map((id: string) => subjects.find(s => s.id === id)?.name).filter(Boolean);
                
                return (
                <TableRow key={u.id} className={`hover:bg-white/5 transition-colors border-b border-white/5 ${selectedUserIds.includes(u.id) ? 'bg-neon-blue/5' : ''}`}>
                  <TableCell className="px-4">
                    <button 
                      onClick={() => handleToggleSelectUser(u.id)}
                      className={`flex items-center justify-center w-5 h-5 rounded border transition-all ${
                        selectedUserIds.includes(u.id) 
                        ? 'bg-neon-blue border-neon-blue text-white shadow-[0_0_8px_rgba(0,255,255,0.3)]' 
                        : 'border-white/20 hover:border-neon-blue/50 bg-background/20'
                      }`}
                    >
                      {selectedUserIds.includes(u.id) && <CheckSquare className="w-3" />}
                    </button>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border ${
                        u.role === 'ADMIN' ? 'bg-neon-pink/20 border-neon-pink text-neon-pink shadow-[0_0_10px_rgba(255,0,255,0.2)]' :
                        u.role === 'TEACHER' ? 'bg-neon-purple/20 border-neon-purple text-neon-purple' :
                        'bg-neon-blue/20 border-neon-blue text-neon-blue'
                      }`}>
                        {u.role === 'ADMIN' ? 'AD' : u.role === 'TEACHER' ? 'DO' : 'AL'}
                      </div>
                      <div>
                        <div className="font-bold text-sm tracking-tight">{u.displayName}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase flex flex-col gap-0.5">
                          {(userGroups.length > 0 || userSubjects.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {userGroups.map((gn: string) => <span key={gn} className="bg-neon-blue/10 text-neon-blue px-1.5 py-0.5 rounded-[4px] border border-neon-blue/20">{gn}</span>)}
                              {userSubjects.map((sn: string) => <span key={sn} className="bg-neon-purple/10 text-neon-purple px-1.5 py-0.5 rounded-[4px] border border-neon-purple/20">{sn}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`text-[9px] font-bold w-fit ${
                        u.role === 'ADMIN' ? 'border-neon-pink text-neon-pink bg-neon-pink/5' :
                        u.role === 'TEACHER' ? 'border-neon-purple text-neon-purple bg-neon-purple/5' :
                        'border-neon-blue text-neon-blue bg-neon-blue/5'
                      }`}>
                        {u.role}
                      </Badge>
                      <span className="text-[8px] uppercase font-mono opacity-40">
                        {u.role === 'ADMIN' ? 'Full Control' : u.role === 'TEACHER' ? 'Curriculum Management' : 'Candidate Level'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary/30 px-1.5 py-0.5 rounded border border-white/5">
                          {u.email || u.matricula || u.id.slice(0, 12)}
                        </span>
                        {u.studentCode && (
                          <span className="text-[10px] font-black text-neon-blue bg-neon-blue/10 px-1.5 py-0.5 rounded border border-neon-blue/20">
                            {u.studentCode}
                          </span>
                        )}
                      </div>
                      <span className="text-[8px] uppercase text-muted-foreground italic px-1">
                        {u.email ? 'Auth via Gmail' : 'Auth via Matricula'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2">
                          <Trophy className={`w-3 h-3 ${u.averageGrade < 6 ? 'text-neon-pink' : 'text-emerald-400'}`} />
                          <span className={`font-black text-sm ${u.averageGrade < 6 ? 'text-neon-pink' : 'text-emerald-400'}`}>
                            {u.averageGrade?.toFixed(1) || '0.0'}
                          </span>
                       </div>
                       <div className="flex gap-1">
                          {u.wildcards && Object.entries(u.wildcards).map(([t, count]: any) => (
                            count > 0 && <span key={t} className="text-[9px] bg-secondary/50 px-1.5 py-0.5 rounded uppercase font-mono opacity-60" title={t}>{count} {t.slice(0,3)}</span>
                          ))}
                          {(!u.wildcards || Object.values(u.wildcards).every(v => v === 0)) && <span className="text-[8px] italic opacity-30">Sin comodines</span>}
                       </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.studentCode ? (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[11px] font-bold text-neon-blue bg-neon-blue/10 px-2 py-1 rounded border border-neon-blue/20">
                          {u.studentCode}
                        </span>
                        <div className="flex flex-col">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-muted-foreground hover:text-neon-blue"
                            onClick={() => {
                              navigator.clipboard.writeText(u.studentCode);
                              notify('Código copiado', 'success');
                              playSound.click();
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-muted-foreground hover:text-neon-purple"
                            onClick={() => regenerateUserCode(u.id)}
                            title="Regenerar"
                          >
                            <Zap className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] italic opacity-30 uppercase">Sin código</span>
                        {(u.role === 'STUDENT' || u.role === 'TEACHER') && (
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => regenerateUserCode(u.id)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <button 
                      onClick={() => toggleUserActive(u)}
                      className={`flex items-center gap-2 px-2 py-1 rounded-md transition-all ${
                        u.active !== false 
                        ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" 
                        : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${u.active !== false ? "bg-emerald-500 animate-pulse" : "bg-destructive"}`}></div>
                      <span className="text-[9px] font-black italic uppercase tracking-tighter">{u.active !== false ? 'VIVO' : 'BAJA'}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-neon-purple/10 hover:text-neon-purple" onClick={() => handleEditUser(u)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteUser(u)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>

          {filteredUsers.length > itemsPerPage && (
            <div className="p-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between bg-black/20 gap-4">
              <div className="text-[10px] font-black uppercase opacity-60">
                 Mostrando {Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredUsers.length, currentPage * itemsPerPage)} de {filteredUsers.length}
              </div>
              <div className="flex gap-2">
                 <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage === 1}
                  onClick={() => { playSound.click(); setCurrentPage(prev => prev - 1); }}
                  className="h-8 border-white/10 text-[10px] font-black uppercase"
                 >
                   Anterior
                 </Button>
                 <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, Math.ceil(filteredUsers.length / itemsPerPage)) }).map((_, i) => (
                       <Button
                        key={i}
                        variant={currentPage === i + 1 ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => { playSound.click(); setCurrentPage(i + 1); }}
                        className="w-8 h-8 p-0 text-[10px] font-black"
                       >
                         {i + 1}
                       </Button>
                    ))}
                    {Math.ceil(filteredUsers.length / itemsPerPage) > 5 && <span className="text-muted-foreground px-1">...</span>}
                 </div>
                 <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={currentPage === Math.ceil(filteredUsers.length / itemsPerPage)}
                  onClick={() => { playSound.click(); setCurrentPage(prev => prev + 1); }}
                  className="h-8 border-white/10 text-[10px] font-black uppercase"
                 >
                   Siguiente
                 </Button>
              </div>
            </div>
          )}
          {hasMoreUsers && (
            <div className="p-4 border-t border-white/5 flex justify-center">
              <Button 
                variant="ghost" 
                onClick={() => fetchUsersAndRequests(true)} 
                disabled={loadingMoreUsers}
                className="text-[10px] font-black uppercase text-muted-foreground hover:text-neon-blue"
              >
                {loadingMoreUsers ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                {loadingMoreUsers ? 'Escaneando...' : 'Ver Más Usuarios'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    )}

      {activeTab === 'bulk' && (
        <Card className="border-neon-blue/20 bg-neon-blue/5 p-8 border-dashed border-2">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 bg-neon-blue/10 rounded-full flex items-center justify-center mx-auto border border-neon-blue/20">
              <Upload className="w-8 h-8 text-neon-blue" />
            </div>
            <div>
              <h3 className="text-xl font-black italic uppercase tracking-tighter">Carga Neural de Usuarios</h3>
              <p className="text-xs text-muted-foreground mt-2 font-mono uppercase tracking-widest leading-relaxed">
                Importación masiva mediante CSV para despliegue de nodos operativos en el sistema.
              </p>
            </div>

            <div className="flex justify-center gap-4">
              <Button variant="outline" className="text-[10px] font-black uppercase h-9 border-white/10" onClick={downloadUserTemplate}>
                <FileText className="w-4 h-4 mr-2" /> Descargar Plantilla
              </Button>
            </div>

            <div className="space-y-4 text-left">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Flujo de Datos CSV</Label>
              <textarea 
                value={bulkData}
                onChange={e => setBulkData(e.target.value)}
                placeholder="CONCEPCION,GARCIA,MARTINEZ,2024001,c.garcia@email.com,STUDENT,1A;1B,MATEMATICAS;FISICA"
                className="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-xs focus:ring-neon-blue outline-none custom-scrollbar"
              />
              <div className="p-4 bg-neon-blue/5 border-l-2 border-neon-blue/50 rounded-r-lg space-y-2">
                <p className="text-[10px] text-white/70 font-bold uppercase"> Protocolo de Importación:</p>
                <ul className="text-[9px] text-muted-foreground space-y-1 list-disc pl-4">
                  <li><strong>Formato:</strong> NOMBRE, APELLIDO_PATERNO, APELLIDO_MATERNO, MATRICULA, EMAIL, ROL, GRUPOS, MATERIAS</li>
                  <li><strong>Separadores:</strong> Las columnas se separan por comas. Los múltiples Grupos o Materias se separan por punto y coma (;)</li>
                  <li><strong>Nombres:</strong> Los nombres de Grupos y Materias deben coincidir exactamente con los registrados en el sistema.</li>
                  <li><strong>Roles:</strong> Valores válidos: STUDENT, TEACHER, ADMIN.</li>
                </ul>
              </div>
            </div>

            <Button 
              className="w-full bg-neon-blue text-black font-black uppercase italic h-11 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
              disabled={!bulkData || isProcessingBulk}
              onClick={() => handleBulkUpload(bulkData)}
            >
              {isProcessingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              EJECUTAR SINCRONIZACIÓN MASIVA
            </Button>
          </div>
        </Card>
      )}

      {activeTab === 'requests' && (
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aspirante</TableHead>
                <TableHead>Identificación</TableHead>
                <TableHead>Asignación de Rol</TableHead>
                <TableHead className="text-right">Decisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map(r => (
                <RequestRow 
                  key={r.id} 
                  r={r} 
                  groups={groups} 
                  subjects={subjects} 
                  onApprove={handleApproveRequest} 
                  onProcessDelete={handleProcessDeleteRequest} 
                  onRefresh={fetchUsersAndRequests} 
                />
              ))}
              {requests.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic text-sm">Sin solicitudes de acceso en este momento.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === 'add' && (
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
           <CardHeader><CardTitle className="font-black italic text-neon-blue uppercase">Enrolamiento Directo</CardTitle></CardHeader>
           <CardContent>
              <form onSubmit={handleAddUser} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Nombre(s)</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} required className="uppercase" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Apellido Paterno</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} required className="uppercase" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Apellido Materno (Opcional)</Label>
                  <Input value={motherLastName} onChange={e => setMotherLastName(e.target.value)} className="uppercase" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Matrícula / No. Control (Opcional)</Label>
                  <Input value={matricula} onChange={e => setMatricula(e.target.value)} className="uppercase font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Perfil de Usuario y Permisos</Label>
                  <select value={role} onChange={e => setRole(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase font-bold text-neon-blue">
                    <option value="STUDENT">Alumno (Acceso a Misiones)</option>
                    <option value="TEACHER">Docente (Gestión Académica)</option>
                    <option value="ADMIN">Administrador (Control Total)</option>
                  </select>
                </div>
                
                <div className="space-y-2 lg:col-span-1">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Asignación de Grupos</Label>
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-auto p-2 border border-input bg-background/50 rounded-md">
                     {groups.map(g => (
                       <button
                         key={g.id}
                         type="button"
                         onClick={() => setSelectedGroupIds(prev => prev.includes(g.id) ? prev.filter(x => x!==g.id) : [...prev, g.id])}
                         className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                           selectedGroupIds.includes(g.id) 
                           ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' 
                           : 'bg-secondary/30 border-transparent text-muted-foreground hover:border-neon-blue/30'
                         }`}
                       >
                         {g.name}
                       </button>
                     ))}
                     {groups.length === 0 && <p className="text-[10px] italic text-muted-foreground">No hay grupos disponibles.</p>}
                  </div>
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <Label className="text-[10px] font-bold uppercase opacity-60">Asignación de Materias</Label>
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-auto p-2 border border-input bg-background/50 rounded-md">
                     {subjects.map(s => (
                       <button
                         key={s.id}
                         type="button"
                         onClick={() => setSelectedSubjectIds(prev => prev.includes(s.id) ? prev.filter(x => x!==s.id) : [...prev, s.id])}
                         className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                           selectedSubjectIds.includes(s.id) 
                           ? 'bg-neon-purple/20 border-neon-purple text-neon-purple' 
                           : 'bg-secondary/30 border-transparent text-muted-foreground hover:border-neon-purple/30'
                         }`}
                       >
                         {s.name}
                       </button>
                     ))}
                     {subjects.length === 0 && <p className="text-[10px] italic text-muted-foreground">No hay materias disponibles.</p>}
                  </div>
                </div>

                {role === 'ADMIN' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase opacity-60">Correo Gmail (Acceso Google)</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@gmail.com" className="lowercase" />
                  </div>
                )}
                
                <div className="lg:col-span-3 pt-6 border-t border-border mt-4 bg-secondary/20 p-4 rounded-xl">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                      <p className="text-[14px] font-black italic text-neon-blue uppercase">Previsualización de Identidad</p>
                      <p className="text-[10px] font-mono text-muted-foreground uppercase">{previewId}</p>
                    </div>
                    <Button type="submit" disabled={addingUser} className="bg-neon-blue text-black font-black px-10 shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:bg-neon-blue/80">
                      {addingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} REGISTRAR USUARIO
                    </Button>
                  </div>
                </div>
              </form>
           </CardContent>
        </Card>
      )}

      {activeTab === 'config' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
            <CardHeader><CardTitle className="text-neon-blue font-black italic">BANCO DE MATERIAS</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="Nueva Materia" />
                <Button onClick={handleAddSubject} className="bg-neon-blue text-black"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {subjects.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-2 rounded bg-secondary/30 text-sm border border-transparent hover:border-neon-blue/30 transition-all">
                    {s.name}
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleRemoveSubject(s.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
            <CardHeader><CardTitle className="text-neon-purple font-black italic">GRUPOS Y SECCIONES</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nuevo Grupo" />
                <Button onClick={handleAddGroup} className="bg-neon-purple"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {groups.map(g => (
                  <div key={g.id} className="flex justify-between items-center p-2 rounded bg-secondary/30 text-sm border border-transparent hover:border-neon-purple/30 transition-all">
                    <div className="flex items-center gap-3">
                      <GroupIcon name={g.name} />
                      <div className="flex flex-col">
                        <span className="font-bold">{g.name}</span>
                        <span className="text-[8px] font-mono opacity-50 uppercase">{g.id}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleRemoveGroup(g.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'nexus' && (
        <NexusManager users={users} groups={groups} subjects={subjects} onRefresh={fetchUsersAndRequests} />
      )}

      {activeTab === 'invitations' && (
        <InvitationsManager users={users} />
      )}

      </div>
  );
}

function InvitationsManager({ users }: { users: any[] }) {
  const students = users.filter(u => u.role === 'STUDENT');
  const [search, setSearch] = useState('');
  
  const filtered = students.filter(s => 
    s.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    s.id?.toLowerCase().includes(search.toLowerCase()) ||
    s.matricula?.toLowerCase().includes(search.toLowerCase())
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notify('Copiado al portapapeles', 'success');
  };

  const sendWhatsApp = (s: any) => {
    const text = `Hola ${s.full_name}, tus credenciales para Will Alter son:\n\nID: ${s.id}\nCódigo: ${s.student_code || 'N/A'}\n\nIngresa en: ${window.location.origin}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const sendEmail = (s: any) => {
    const subject = `Accesos Will Alter - ${s.full_name}`;
    const body = `Hola ${s.full_name},\n\nTus credenciales de acceso para la plataforma Will Alter son:\n\nID de Usuario: ${s.id}\nCódigo de Acceso: ${s.student_code || 'N/A'}\n\nSaludos.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Card className="border-neon-blue/20 bg-card/40 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-xl font-black italic text-neon-blue flex items-center justify-between">
          GESTIÓN DE INVITACIONES Y CREDENCIALES
          <Input 
            placeholder="Buscar alumno..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 h-8 text-[10px] bg-background/50 border-white/10 italic"
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/5">
              <TableHead className="text-[10px] uppercase font-bold">Alumno</TableHead>
              <TableHead className="text-[10px] uppercase font-bold">Identificador (Login ID)</TableHead>
              <TableHead className="text-[10px] uppercase font-bold">Código de Acceso</TableHead>
              <TableHead className="text-right text-[10px] uppercase font-bold">Acciones rápidas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(s => (
              <TableRow key={s.id} className="hover:bg-white/5 border-b border-white/5 group">
                <TableCell>
                  <div className="font-bold text-sm">{s.full_name}</div>
                  <div className="text-[9px] opacity-40 uppercase font-mono">{s.matricula || 'SIN MATRICULA'}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="bg-black/40 px-2 py-1 rounded text-neon-blue font-mono text-xs border border-white/5">{s.id}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(s.id)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="bg-black/40 px-2 py-1 rounded text-neon-pink font-mono text-xs border border-white/5 font-bold">{s.student_code || 'N/A'}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(s.student_code)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-[9px] font-black italic uppercase text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10" onClick={() => sendWhatsApp(s)}>
                      WhatsApp
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[9px] font-black italic uppercase text-neon-blue border-neon-blue/30 hover:bg-neon-blue/10" onClick={() => sendEmail(s)}>
                      Email
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-20 text-center text-muted-foreground italic text-sm">
                  No se encontraron alumnos para los criterios de búsqueda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function GlobalConfigPanel() {
  const [resetOpts, setResetOpts] = useState<any>({
    attempts: true,
    violations: true,
    studentsStats: true,
    rankings: true,
    groups: false,
    quizzes: false
  });
  const [settings, setSettings] = useState({
    hideRankings: false,
    teacherDomain: 'gmail.com',
    maintenanceMode: false,
    maxProtocolViolations: 3,
    aiEnabled: true,
    rankingsEnabled: true
  });

  useEffect(() => {
    supabase.from('config').select('*').eq('id', 'global').single().then(({ data }) => {
      if (data) setSettings(data.data as any);
    });

    const channel = supabase.channel('global_config_channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'config', filter: 'id=eq.global' }, (payload) => {
        setSettings(payload.new.data as any);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const update = async (key: string, val: any) => {
    const newSettings = { ...settings, [key]: val };
    const { error } = await supabase.from('config').upsert({ id: 'global', data: newSettings });
    if (error) {
      errorService.handle(error, 'Update Global Settings');
    } else {
      notify('Ajuste global actualizado', 'success');
      setSettings(newSettings);
    }
  };

  return (
    <Card className="border-primary/20 bg-card/40 backdrop-blur-xl p-8 max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl font-black italic text-neon-blue uppercase">Configuración de Núcleo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="font-bold">Visibilidad de Rankings</p>
            <p className="text-[10px] text-muted-foreground uppercase">Define si los alumnos pueden ver el Hall de la Fama</p>
          </div>
          <Button 
            variant={settings.hideRankings ? 'destructive' : 'outline'} 
            onClick={() => update('hideRankings', !settings.hideRankings)}
            className="font-black italic text-xs h-8"
          >
            {settings.hideRankings ? 'OCULTOS' : 'VISIBLES'}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="font-bold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-neon-blue" /> Implementación de IA
            </p>
            <p className="text-[10px] text-muted-foreground uppercase">Habilita/Deshabilita Generación de preguntas con Gemini</p>
          </div>
          <Button 
            variant={settings.aiEnabled ? 'outline' : 'destructive'} 
            onClick={() => update('aiEnabled', !settings.aiEnabled)}
            className="font-black italic text-xs h-8 min-w-[100px]"
          >
            {settings.aiEnabled ? 'CONECTADO' : 'PAUSADO'}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-neon-purple" /> Actualización de Rankings
            </p>
            <p className="text-[10px] text-muted-foreground uppercase">Controla el procesamiento de posiciones en tiempo real</p>
          </div>
          <Button 
            variant={settings.rankingsEnabled ? 'outline' : 'destructive'} 
            onClick={() => update('rankingsEnabled', !settings.rankingsEnabled)}
            className="font-black italic text-xs h-8 min-w-[100px]"
          >
            {settings.rankingsEnabled ? 'ACTIVO' : 'DORMIDO'}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="font-bold">Protocolo de Mantenimiento</p>
            <p className="text-[10px] text-muted-foreground uppercase">Bloquea el acceso a todas las interfaces excepto Admins</p>
          </div>
          <Button 
            variant={settings.maintenanceMode ? 'destructive' : 'outline'} 
            onClick={() => update('maintenanceMode', !settings.maintenanceMode)}
            className="font-black italic text-xs h-8"
          >
            {settings.maintenanceMode ? 'ACTIVO' : 'INACTIVO'}
          </Button>
        </div>

        <div className="space-y-4">
           <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Dominio de Docentes Autorizado</Label>
           <Input 
             value={settings.teacherDomain}
             onChange={e => update('teacherDomain', e.target.value)}
             className="bg-background/40 border-white/10 italic text-neon-blue"
           />
           <p className="text-[8px] text-muted-foreground italic uppercase">Restringe el registro de docentes a este dominio específico.</p>
        </div>

        <div className="space-y-4">
           <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Límite Global de Violaciones de Protocolo</Label>
           <div className="flex items-center gap-4">
              <Input 
                type="number"
                min="1"
                max="20"
                value={settings.maxProtocolViolations || 3}
                onChange={e => update('maxProtocolViolations', parseInt(e.target.value))}
                className="bg-background/40 border-white/10 italic text-neon-pink w-32"
              />
              <p className="text-[10px] text-muted-foreground uppercase leading-tight italic">
                Criterio para bloqueo automático del sistema tras {settings.maxProtocolViolations || 3} alertas acumuladas.
              </p>
           </div>
        </div>

        <div className="pt-8 border-t border-red-500/20">
           <div className="p-6 bg-red-500/5 rounded-2xl border border-red-500/20 space-y-6">
              <div>
                 <h4 className="text-red-500 font-black italic uppercase text-lg flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> PROTOCOLO DE PURGA DINÁMICA
                 </h4>
                 <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Selecciona los módulos que deseas reiniciar. Esta acción es <span className="text-red-400 font-bold uppercase italic">Irreversible</span>.
                 </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 {[
                   { id: 'attempts', label: 'Intentos / Pruebas', icon: Rocket },
                   { id: 'violations', label: 'Violaciones / Seguridad', icon: ShieldAlert },
                   { id: 'studentsStats', label: 'Perfiles / Comodines', icon: Users },
                   { id: 'rankings', label: 'Rankings / Tablas', icon: Trophy },
                   { id: 'groups', label: 'Grupos / Clases', icon: Layers },
                   { id: 'quizzes', label: 'Todas las Misiones', icon: Rocket },
                 ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setResetOpts({ ...resetOpts, [opt.id]: !resetOpts[opt.id] })}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2 ${
                        resetOpts[opt.id] 
                          ? 'border-red-500 bg-red-500/10 text-white' 
                          : 'border-white/5 bg-white/5 text-muted-foreground'
                      }`}
                    >
                       <opt.icon className={`w-5 h-5 ${resetOpts[opt.id] ? 'opacity-100' : 'opacity-40'}`} />
                       <span className="text-[10px] font-bold uppercase leading-tight">{opt.label}</span>
                    </button>
                 ))}
              </div>

              <Button 
                variant="destructive"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black italic tracking-widest h-12 shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                onClick={async () => {
                  if (confirm('¿CONFIRMAR PURGA DE MÓDULOS SELECCIONADOS?')) {
                    await resetSystemData(resetOpts);
                  }
                }}
              >
                EJECUTAR LIMPIEZA SELECCIONADA
              </Button>
           </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemHealthView({ users }: { users: any[] }) {
  const onlineUsers = users.filter(u => u.last_seen_at && (Date.now() - new Date(u.last_seen_at).getTime() < 300000));
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const checkLatency = async () => {
      const start = performance.now();
      try {
        await supabase.from('config').select('id').eq('id', 'global').single();
        setLatency(Math.round(performance.now() - start));
      } catch (e) {
        setLatency(Math.round(performance.now() - start));
      }
    };
    checkLatency();
    const interval = setInterval(checkLatency, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          icon={<Users className="w-5 h-5 text-neon-blue" />}
          label="Sujetos en Línea"
          value={onlineUsers.length.toString()}
          subValue="Conexión activa (last 5m)"
        />
        <MetricCard 
          icon={<Zap className="w-5 h-5 text-neon-purple" />}
          label="Latencia Nucleus"
          value={`${latency || '---'} ms`}
          subValue="I/O Response Time"
          trend={latency && latency > 500 ? 'high' : 'low'}
        />
        <MetricCard 
          icon={<Cpu className="w-5 h-5 text-emerald-400" />}
          label="Thread Status"
          value="STABLE"
          subValue="Parallel Execution Core"
        />
        <MetricCard 
          icon={<ShieldAlert className="w-5 h-5 text-neon-pink" />}
          label="Nivel de Alerta"
          value={latency && latency > 800 ? 'CRITICAL' : 'OPTIMAL'}
          subValue="Security Integrity Level"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-primary/20 bg-card/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-xs uppercase font-black text-neon-blue flex justify-between items-center">
              MONITOR DE USUARIOS ACTIVOS
              <Badge variant="outline" className="border-neon-blue text-neon-blue">{onlineUsers.length} ONLINE</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
             <Table>
               <TableHeader>
                 <TableRow className="border-b border-white/5">
                   <TableHead className="text-[10px] uppercase font-bold">Identidad</TableHead>
                   <TableHead className="text-[10px] uppercase font-bold text-center">Última Mitosis</TableHead>
                   <TableHead className="text-[10px] uppercase font-bold text-right">Estatus</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {onlineUsers.sort((a,b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)).map(u => (
                   <TableRow key={u.id} className="border-b border-white/5">
                     <TableCell>
                       <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                         <div>
                            <p className="text-sm font-bold">{u.displayName}</p>
                            <p className="text-[9px] font-mono opacity-40 uppercase">{u.role} // {u.matricula || u.email || 'GUEST'}</p>
                         </div>
                       </div>
                     </TableCell>
                     <TableCell className="text-center">
                       <span className="text-[10px] font-mono text-muted-foreground">{new Date(u.lastSeenAt).toLocaleTimeString()}</span>
                     </TableCell>
                     <TableCell className="text-right">
                       <Badge variant="outline" className="text-[8px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">LIVE</Badge>
                     </TableCell>
                   </TableRow>
                 ))}
                 {onlineUsers.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={3} className="py-20 text-center text-muted-foreground italic text-xs">Sin actividad detectada en el núcleo.</TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-xl">
           <CardHeader>
             <CardTitle className="text-xs uppercase font-black text-neon-pink">ESTADÍSTICAS OPERATIVAS</CardTitle>
           </CardHeader>
           <CardContent className="space-y-6">
              <HealthIndicator label="Ancho de Banda" status="Nominal" value="1.2 Gbps" percentage={85} color="emerald" />
              <HealthIndicator label="Error Rate" status="Bajo" value="0.01%" percentage={5} color="emerald" />
              <HealthIndicator label="Carga de CPU" status="Media" value="44%" percentage={44} color="emerald" />
              <HealthIndicator label="Uptime" status="Estable" value="14d 2h" percentage={99} color="emerald" />
           </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorDiagnostics() {
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('system_errors').select('*').order('timestamp', { ascending: false }).limit(100).then(({ data }) => {
      if (data) setErrors(data);
      setLoading(false);
    });

    const channel = supabase.channel('system_errors_diagnostics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_errors' }, () => {
        supabase.from('system_errors').select('*').order('timestamp', { ascending: false }).limit(100).then(({ data }) => {
          if (data) setErrors(data);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markResolved = async (id: string, resolved: boolean) => {
    const { error } = await supabase.from('system_errors').update({ resolved }).eq('id', id);
    if (error) {
      errorService.handle(error, 'Mark Error Resolved');
    } else {
      notify('Estado de error actualizado', 'success');
    }
  };

  const clearLogs = async () => {
    if (!confirm('¿Purgar todos los registros de errores?')) return;
    try {
      const { error } = await supabase.from('system_errors').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      if (error) throw error;
      notify('Logs purgados', 'success');
    } catch (e) {
      errorService.handle(e, 'Clear Error Logs');
    }
  };

  if (loading) return <LoadingPulse message="Analizando Protocolos de Seguridad" />;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black uppercase text-neon-pink flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Bitácora de Fallos de Implementación
        </h3>
        <Button variant="ghost" size="sm" onClick={clearLogs} className="text-[10px] text-neon-pink hover:bg-neon-pink/10">
          PURGAR LOGS
        </Button>
      </div>

      <Card className="border-neon-pink/20 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5">
                <TableHead className="text-[10px] uppercase font-bold">Fecha / Status</TableHead>
                <TableHead className="text-[10px] uppercase font-bold">Error / Mensaje</TableHead>
                <TableHead className="text-[10px] uppercase font-bold">Contexto / Técnico</TableHead>
                <TableHead className="text-[10px] uppercase font-bold text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map(err => (
                <TableRow key={err.id} className={`border-b border-white/5 hover:bg-white/5 group ${err.resolved ? 'opacity-40' : ''}`}>
                  <TableCell className="py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{new Date(err.timestamp).toLocaleString()}</span>
                      <Badge className={`text-[8px] font-black ${err.severity === 'HIGH' ? 'bg-neon-pink text-black' : 'bg-amber-500 text-black'}`}>
                        {err.severity}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm font-bold text-neon-pink truncate">{err.message}</p>
                      <p className="text-[10px] text-muted-foreground truncate italic uppercase font-mono">{err.category}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-[9px] font-mono bg-black/40 p-2 rounded border border-white/5 max-w-sm max-h-20 overflow-auto whitespace-pre-wrap">
                      <p className="text-neon-blue font-bold">[{err.context || 'GLOBAL'}]</p>
                      <p className="opacity-70 mt-1">{err.technical}</p>
                      {err.userEmail && <p className="mt-1 text-neon-purple">ID: {err.userId}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button 
                      variant={err.resolved ? 'ghost' : 'outline'} 
                      size="sm" 
                      onClick={() => markResolved(err.id, !err.resolved)}
                      className={`h-7 text-[9px] font-black italic ${err.resolved ? 'text-muted-foreground' : 'text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.1)]'}`}
                    >
                      {err.resolved ? 'REABRIR' : 'RESOLVER'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {errors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center text-muted-foreground italic text-xs uppercase tracking-[0.3em]">Sistema libre de anomalías registradas.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function AlertCenter({ users, groups }: { users: any[], groups: any[] }) {
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'GLOBAL' | 'USER' | 'GROUP'>('GLOBAL');
  const [targetId, setTargetId] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAlerts, setSentAlerts] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('system_alerts').select('*').order('timestamp', { ascending: false }).limit(50).then(({ data }) => {
      if (data) setSentAlerts(data);
    });

    const channel = supabase.channel('system_alerts_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, () => {
        supabase.from('system_alerts').select('*').order('timestamp', { ascending: false }).limit(50).then(({ data }) => {
          if (data) setSentAlerts(data);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const { user: currentUser } = useAuthStore();

  const sendAlert = async () => {
    if (!message.trim()) return;
    setSending(true);
    playSound.powerUp();
    try {
      const { error } = await supabase.from('system_alerts').insert({
        message,
        target_type: targetType,
        target_id: targetType === 'GLOBAL' ? 'GLOBAL' : targetId,
        timestamp: new Date().toISOString(),
        sender: 'Will Alter Admin',
        sender_id: currentUser?.uid,
        read_by: []
      });
      if (error) throw error;
      setMessage('');
      setTargetId('');
      notify('Alerta disparada exitosamente', 'success');
    } catch (e) {
      errorService.handle(e, 'Send Global Alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8 animate-in fade-in zoom-in-95 duration-300">
      <Card className="lg:col-span-1 border-neon-blue/20 bg-card/40 backdrop-blur-xl p-6 h-fit sticky top-24">
        <CardHeader>
          <CardTitle className="text-sm font-black italic text-neon-blue uppercase tracking-widest flex items-center gap-2">
            <Bell className="w-4 h-4" /> Disparador de Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold opacity-60">Objetivo de la Comunicación</Label>
            <select 
              value={targetType} 
              onChange={e => { setTargetType(e.target.value as any); setTargetId(''); }}
              className="w-full bg-background/50 border border-white/10 rounded-lg h-10 px-3 text-xs font-black uppercase text-neon-blue outline-none focus:ring-1 focus:ring-neon-blue"
            >
              <option value="GLOBAL">Broadcast Global (Todos)</option>
              <option value="GROUP">Por Grupo Específico</option>
              <option value="USER">Comando Directo (Usuario)</option>
            </select>
          </div>

          {targetType === 'GROUP' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <Label className="text-[10px] uppercase font-bold opacity-60">Seleccionar Grupo</Label>
              <select 
                value={targetId} 
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-background/50 border border-white/10 rounded-lg h-10 px-3 text-xs font-bold"
              >
                <option value="">Selecciona un grupo...</option>
                {groups.sort((a,b) => a.name.localeCompare(b.name)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {targetType === 'USER' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <Label className="text-[10px] uppercase font-bold opacity-60">Seleccionar Usuario</Label>
              <select 
                value={targetId} 
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-background/50 border border-white/10 rounded-lg h-10 px-3 text-xs font-bold"
              >
                <option value="">Selecciona un usuario...</option>
                {users.sort((a,b) => a.displayName.localeCompare(b.displayName)).map(u => <option key={u.id} value={u.id}>{u.displayName} ({u.role})</option>)}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold opacity-60">Mensaje del Comandante</Label>
            <textarea 
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Escribe el aviso aquí... Los usuarios lo recibirán en tiempo real."
              className="w-full bg-background/50 border border-white/10 rounded-xl p-4 text-sm font-medium h-32 focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all outline-none resize-none"
            />
          </div>

          <Button 
            disabled={sending || !message.trim() || (targetType !== 'GLOBAL' && !targetId)} 
            onClick={sendAlert}
            className="w-full bg-neon-blue text-black font-black italic uppercase tracking-tighter h-12 shadow-[0_0_20px_rgba(0,243,255,0.2)] hover:shadow-[0_0_30px_rgba(0,243,255,0.4)]"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'EMITIR COMUNICADO'}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-primary/20 bg-card/40 backdrop-blur-xl h-full min-h-[500px]">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-xs uppercase font-black text-muted-foreground flex items-center justify-between">
            HISTORIAL DE TRANSMISIONES
            <Badge variant="secondary" className="text-[8px] bg-white/5">{sentAlerts.length} REGISTROS</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[700px] overflow-auto custom-scrollbar">
            {sentAlerts.map(a => (
              <div key={a.id} className="p-6 border-b border-white/5 relative group hover:bg-white/5 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`text-[8px] font-black italic uppercase px-2 py-0.5 ${
                      a.target_type === 'GLOBAL' ? 'border-emerald-500 text-emerald-400 bg-emerald-400/5' :
                      a.target_type === 'GROUP' ? 'border-neon-purple text-neon-purple bg-neon-purple/5' :
                      'border-neon-blue text-neon-blue bg-neon-blue/5'
                    }`}>
                      {a.target_type}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground opacity-60">{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-neon-pink opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={async () => {
                       if (confirm('¿Eliminar alerta histórica?')) {
                         const { error } = await supabase.from('system_alerts').delete().eq('id', a.id);
                         if (error) errorService.handle(error, 'Delete Alert');
                         else notify('Transmisión purgada', 'success');
                       }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground leading-relaxed italic">"{a.message}"</p>
                  {a.target_id && a.target_type !== 'GLOBAL' && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[8px] uppercase font-black text-neon-blue opacity-70">Destinatario:</p>
                      <p className="text-[9px] font-bold text-muted-foreground">
                        {a.target_type === 'GROUP' ? groups.find(g => g.id === a.target_id)?.name || 'Grupo Desconocido' : users.find(u => u.id === a.target_id)?.full_name || 'ID: ' + a.target_id}
                      </p>
                    </div>
                  )}
                  {a.read_by && a.read_by.length > 0 && (
                    <p className="text-[8px] uppercase font-bold text-emerald-500/60">Interacción: {a.read_by.length} Lecturas Confirmadas</p>
                  )}
                </div>
              </div>
            ))}
            {sentAlerts.length === 0 && (
              <div className="text-center py-32 flex flex-col items-center gap-4 opacity-20">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                  <Bell className="w-8 h-8" />
                </div>
                <p className="text-sm italic uppercase tracking-[0.3em]">Cápsula de silencio: Sin historial.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubjectsGroupsManagement() {
  const { subjects, groups, addSubject, removeSubject, addGroup, removeGroup } = useSubjectsGroupsStore();
  const [newSub, setNewSub] = useState('');
  const [newGrp, setNewGrp] = useState('');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter text-neon-blue">GESTIÓN DE INFRAESTRUCTURA</h1>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Materias, Grupos y Entidades Organizativas</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card className="border-neon-blue/20 bg-card/40 backdrop-blur-xl">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="text-lg font-black italic text-neon-blue uppercase tracking-widest flex items-center justify-between">
              CATÁLOGO DE MATERIAS
              <BookOpen className="w-5 h-5" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex gap-2 mb-8">
              <Input 
                placeholder="Nombre de la nueva materia..." 
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                className="bg-background/50 border-white/10 italic"
                onKeyDown={e => e.key === 'Enter' && (addSubject(newSub), setNewSub(''))}
              />
              <Button onClick={() => { addSubject(newSub); setNewSub(''); }} className="bg-neon-blue text-black font-black italic px-6">
                AÑADIR
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-auto pr-2 custom-scrollbar">
              {subjects.map(s => (
                <div key={s.id} className="p-4 rounded-xl border border-white/5 bg-white/5 flex flex-col justify-between group hover:border-neon-blue/40 hover:bg-neon-blue/5 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-bold uppercase tracking-tight">{s.name}</p>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-neon-pink opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { if(confirm('¿Borrar materia?')) removeSubject(s.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-mono text-muted-foreground truncate opacity-40 group-hover:opacity-100">{s.id}</span>
                    <Badge variant="outline" className="text-[8px] border-neon-blue/30 text-neon-blue">ACTIVA</Badge>
                  </div>
                </div>
              ))}
              {subjects.length === 0 && (
                <p className="col-span-2 text-center py-10 text-muted-foreground italic text-xs">No hay materias registradas.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-neon-purple/20 bg-card/40 backdrop-blur-xl">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="text-lg font-black italic text-neon-purple uppercase tracking-widest flex items-center justify-between">
              DISTRITOS / GRUPOS Academia
              <Users className="w-5 h-5" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex gap-2 mb-8">
              <Input 
                placeholder="Identificador de grupo (Ej: 6-A Prog)..." 
                value={newGrp}
                onChange={e => setNewGrp(e.target.value)}
                className="bg-background/50 border-white/10 italic"
                onKeyDown={e => e.key === 'Enter' && (addGroup(newGrp), setNewGrp(''))}
              />
              <Button onClick={() => { addGroup(newGrp); setNewGrp(''); }} className="bg-neon-purple text-white font-black italic px-6 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                CREAR
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-auto pr-2 custom-scrollbar">
              {groups.map(g => (
                <div key={g.id} className="p-4 rounded-xl border border-white/5 bg-white/5 flex flex-col justify-between group hover:border-neon-purple/40 hover:bg-neon-purple/5 transition-all">
                  <div className="flex justify-between items-start mb-2 text-neon-purple">
                    <div className="flex flex-col">
                      <p className="text-sm font-black italic uppercase tracking-tighter">{g.name}</p>
                      <p className="text-[8px] font-mono opacity-50">{g.id}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-neon-pink opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { if(confirm('¿Borrar grupo?')) removeGroup(g.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[8px] border-emerald-500/30 text-emerald-400">NOMINAL</Badge>
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <p className="col-span-2 text-center py-10 text-muted-foreground italic text-xs">No hay grupos operativos.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SystemControlPanel() {
  const [activeTab, setActiveTab] = useState<'health' | 'errors' | 'alerts' | 'nexus' | 'config'>('health');
  const { subjects, groups } = useSubjectsGroupsStore();
  const [users, setUsers] = useState<any[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'STUDENT').limit(500);
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.warn('SystemControlPanel users fetch failed:', error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    // Poll users every 5 minutes instead of real-time to save massive quota
    const interval = setInterval(fetchUsers, 300000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-4 rounded-2xl border border-white/5 backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-black italic text-neon-blue uppercase tracking-widest leading-none">Control Maestro de Sistemas</h2>
          <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1 tracking-widest">Gobernanza de Infraestructura y Comunicaciones</p>
        </div>
        <div className="flex gap-2 bg-black/40 p-1 rounded-xl border border-white/5 overflow-x-auto max-w-full">
          <Button variant={activeTab === 'health' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('health')} className="text-[10px] gap-2 italic font-black">
            <HeartPulse className="w-3 h-3" /> SALUD
          </Button>
          <Button variant={activeTab === 'errors' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('errors')} className="text-[10px] gap-2 italic font-black">
            <Terminal className="w-3 h-3" /> ERRORES
          </Button>
          <Button variant={activeTab === 'alerts' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('alerts')} className="text-[10px] gap-2 italic font-black">
            <Bell className="w-3 h-3" /> ALERTAS
          </Button>
          <Button variant={activeTab === 'nexus' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('nexus')} className="text-[10px] gap-2 italic font-black">
            <Rocket className="w-3 h-3" /> NEXUS
          </Button>
          <Button variant={activeTab === 'config' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('config')} className="text-[10px] gap-2 italic font-black">
            <LayoutGrid className="w-3 h-3" /> CONFIG
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'health' && <SystemHealthView users={users} />}
        {activeTab === 'errors' && <ErrorDiagnostics />}
        {activeTab === 'alerts' && <AlertCenter users={users} groups={groups} />}
        {activeTab === 'nexus' && <NexusManager users={users} groups={groups} subjects={subjects} onRefresh={fetchUsers} />}
        {activeTab === 'config' && <GlobalConfigPanel />}
      </div>
    </div>
  );
}

function NexusManager({ users, groups, subjects, onRefresh }: { users: any[], groups: any[], subjects: any[], onRefresh: () => void }) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [targetSubjects, setTargetSubjects] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [roleFilter, setRoleFilter] = useState('STUDENT');

  const filteredUsers = users.filter(u => u.role === roleFilter);

  const [accessCode, setAccessCode] = useState('');

  const handleApplyNexus = async () => {
    if (selectedUsers.length === 0) {
      notify('Selecciona al menos un usuario', 'warning');
      return;
    }
    setProcessing(true);
    playSound.click();
    try {
      const updates = selectedUsers.map(uid => {
        const u = users.find(x => x.id === uid);
        const newGroupIds = Array.from(new Set([...(u.group_ids || []), ...targetGroups]));
        const newSubjectIds = Array.from(new Set([...(u.subject_ids || []), ...targetSubjects]));
        
        const updateData: any = {
          id: uid,
          group_ids: newGroupIds,
          subject_ids: newSubjectIds
        };

        if (accessCode.trim()) {
          const codeError = validateCode(accessCode.trim());
          if (codeError) {
             throw new Error(codeError);
          }
          updateData.student_code = accessCode.trim();
        }
        return updateData;
      });

      for (let i = 0; i < updates.length; i += 500) {
        const chunk = updates.slice(i, i + 500);
        const { error } = await supabase.from('profiles').upsert(chunk);
        if (error) throw error;
      }

      playSound.success();
      notify(`Nexus establecido: ${selectedUsers.length} usuarios vinculados`, 'success');
      setSelectedUsers([]);
      setAccessCode('');
      onRefresh();
    } catch (e: any) {
      playSound.error();
      errorService.handle(e, 'Nexus Batch Update');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-md">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-xs uppercase tracking-widest font-black text-neon-blue">1. Selección de Usuarios</CardTitle>
          <div className="flex gap-2 mt-2">
            <Button variant={roleFilter === 'STUDENT' ? 'default' : 'outline'} size="xs" onClick={() => setRoleFilter('STUDENT')} className="text-[9px]">ALUMNOS</Button>
            <Button variant={roleFilter === 'TEACHER' ? 'default' : 'outline'} size="xs" onClick={() => setRoleFilter('TEACHER')} className="text-[9px]">DOCENTES</Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-1 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
            {filteredUsers.map(u => (
              <label key={u.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${selectedUsers.includes(u.id) ? 'bg-neon-blue/10 border-neon-blue' : 'hover:bg-white/5 border-transparent'}`}>
                <input 
                  type="checkbox" 
                  checked={selectedUsers.includes(u.id)} 
                  onChange={() => setSelectedUsers(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                  className="w-4 h-4 rounded border-neon-blue accent-neon-blue"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold truncate max-w-[150px]">{u.full_name}</span>
                  <span className="text-[8px] font-mono opacity-50">{u.matricula || u.email}</span>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-md">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-xs uppercase tracking-widest font-black text-neon-purple">2. Destinos (Nexus Target)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-bold opacity-60 uppercase">Grupos / Carreras</Label>
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setTargetGroups(prev => prev.includes(g.id) ? prev.filter(id => id !== g.id) : [...prev, g.id])}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${targetGroups.includes(g.id) ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' : 'bg-secondary/20 border-transparent hover:border-neon-blue/30'}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Label className="text-[10px] font-bold opacity-60 uppercase">Materias / Especialidades</Label>
            <div className="flex flex-wrap gap-2">
              {subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setTargetSubjects(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${targetSubjects.includes(s.id) ? 'bg-neon-purple/20 border-neon-purple text-neon-purple' : 'bg-secondary/20 border-transparent hover:border-neon-purple/30'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-4 border-t border-white/5 space-y-3">
            <Label className="text-[10px] font-bold opacity-60 uppercase text-neon-pink">3. Código de Acceso (Opcional)</Label>
            <Input 
              value={accessCode}
              onChange={e => setAccessCode(e.target.value.toUpperCase())}
              placeholder="EJ: EXAM-2024"
              className="bg-background/40 border-white/10 font-mono text-center tracking-widest text-neon-pink"
            />
            <p className="text-[8px] text-muted-foreground italic">Este código se grabará en todos los perfiles seleccionados.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1 border-primary/20 bg-card/40 backdrop-blur-md flex flex-col pt-6">
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-4">
           <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 border-dashed ${selectedUsers.length > 0 ? 'border-neon-blue bg-neon-blue/5' : 'border-muted-foreground/30 opacity-30 animate-pulse'}`}>
              <Plus className={`w-8 h-8 ${selectedUsers.length > 0 ? 'text-neon-blue' : 'text-muted-foreground' }`} />
           </div>
           <div>
              <p className="text-xl font-black italic uppercase tracking-tighter">Vínculo de Nexus</p>
              <p className="text-[10px] text-muted-foreground uppercase mt-1">
                Vinculando <span className="text-neon-blue font-bold">{selectedUsers.length}</span> usuarios a <span className="text-neon-purple font-bold">{targetGroups.length + targetSubjects.length}</span> entidades.
              </p>
           </div>
           <Button 
            disabled={processing || selectedUsers.length === 0} 
            onClick={handleApplyNexus}
            className="w-full bg-neon-blue text-black font-black uppercase italic tracking-tighter py-6 shadow-[0_0_20px_rgba(0,243,255,0.3)]"
           >
             {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ejecutar Vinculación Automática'}
           </Button>
        </div>
        <div className="p-4 bg-black/40 border-t border-white/5">
           <p className="text-[8px] uppercase font-mono text-muted-foreground tracking-widest text-center">Protocolo de sincronización masiva Latt-Nexus v2.4</p>
        </div>
      </Card>
    </div>
  );
}
