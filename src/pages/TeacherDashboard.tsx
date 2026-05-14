import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, useParams } from 'react-router';
import { useAuthStore } from '../store/auth';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { supabase } from '../lib/supabase';
import { dbService } from '../services/dbService';
import { errorService, AppError, ErrorCategory } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { Gamepad2, BrainCircuit, Users, LogOut, FileText, Menu, X, Target, Plus, LayoutGrid, Rocket, Activity, PieChart, Trash2, ArrowLeft, Pencil, Trophy, ShieldAlert, Star, BookOpen, Loader2, Sparkles, Check, Pencil as PencilIcon, Save as SaveIcon, ChevronRight, Search, Eye, CheckSquare, History, RefreshCw, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import playSound from '../lib/sounds';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'motion/react';
import { MissionBuilder } from './MissionBuilder';
import LiveGameControl from './LiveGameControl';
import { QuestionLibrary } from './QuestionLibrary';
import { LiveMonitor } from './LiveMonitor';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import { generateQuestionsAI } from '../services/aiService';
import { AdminRoleSwitcher } from '../components/AdminRoleSwitcher';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, limit, orderBy, getDocs, doc, updateDoc, addDoc, getDocFromServer, startAfter } from 'firebase/firestore';
import { ThemeSelector } from '../components/ThemeSelector';
import { WelcomeModal } from '../components/WelcomeModal';
import { GlobalSearch } from '../components/GlobalSearch';
import { MissionPreview } from '../components/MissionPreview';
import { utils, writeFile } from 'xlsx';

function LoadingPulse({ message = "Cargando datos..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-6 animate-in fade-in duration-700">
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
        <p className="text-[8px] font-mono opacity-30 mt-1">Sincronizando con Neural Core...</p>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/teacher', icon: LayoutGrid, label: 'Dashboard', exact: true },
  { to: '/teacher/missions', icon: Rocket, label: 'Misiones' },
  { to: '/teacher/students', icon: Users, label: 'Alumnos' },
  { to: '/teacher/reports', icon: FileText, label: 'Reportes' },
  { to: '/teacher/telemetry', icon: Activity, label: 'Telemetría' },
  { to: '/teacher/surveys', icon: PieChart, label: 'Encuestas' },
  { to: '/teacher/library', icon: BookOpen, label: 'Biblioteca' },
  // { to: '/teacher/ai', icon: BrainCircuit, label: 'Latt AI' },
];

function ModeInfoButton({ type, onClick }: { type: string, onClick: (type: string) => void }) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-6 w-6 text-neon-blue ml-2 rounded-full border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/20"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(type);
      }}
      title="Ver como funciona este modo"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </Button>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  return (
    <nav className="flex items-center gap-2 text-[10px] uppercase font-mono tracking-widest text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap custom-scrollbar pb-2">
      <Link to="/teacher" className="hover:text-neon-blue transition-colors">ROOT</Link>
      {pathnames.slice(1).map((name, index) => {
        const routeTo = `/${pathnames.slice(0, index + 2).join('/')}`;
        const isLast = index === pathnames.slice(1).length - 1;
        
        const label = name === 'missions' ? 'MISIONES' 
                    : name === 'students' ? 'ALUMNOS'
                    : name === 'reports' ? 'REPORTES'
                    : name === 'telemetry' ? 'TELEMETRÍA'
                    : name === 'surveys' ? 'ENCUESTAS'
                    : name === 'library' ? 'BIBLIOTECA'
                    : name === 'ai' ? 'LATT-AI'
                    : name === 'builder' ? 'CONSTRUCTOR'
                    : name.toUpperCase();

        return (
          <React.Fragment key={name}>
            <ChevronRight className="w-3 h-3 opacity-30" />
            {isLast ? (
              <span className="text-neon-blue font-black">{label}</span>
            ) : (
              <Link to={routeTo} className="hover:text-neon-blue transition-colors">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [globalConfig, setGlobalConfig] = useState<any>({ maxProtocolViolations: 3 });
  const [previewType, setPreviewType] = useState<string | null>(null);
  
  const showWelcome = !!(user && user.isFirstTime);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [lastRequestFetch, setLastRequestFetch] = useState(0);

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('status', 'PENDING')
        .limit(100);
      
      if (error) throw error;

      const myReqs = data.filter(r => 
        (user.groupIds?.includes(r.group_id)) || 
        (user.subjectIds?.includes(r.subject_id))
      );
      setPendingRequests(myReqs);
      setLastRequestFetch(Date.now());
    } catch (error) {
      errorService.handle(error, 'Fetch Requests');
    }
  }, [user?.id, user?.groupIds, user?.subjectIds]);

  useEffect(() => {
    if (!user?.id) return;
    
    // Initial fetch for requests
    fetchRequests();
    
    const reqInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRequests();
      }
    }, 600000);

    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('config')
          .select('*')
          .eq('id', 'global')
          .single();
        if (data) setGlobalConfig(data);
      } catch (e) {}
    };

    fetchConfig();
    const configInterval = setInterval(fetchConfig, 600000); // 10 minutes

    return () => {
      clearInterval(reqInterval);
      clearInterval(configInterval);
    };
  }, [user?.id, fetchRequests]);

  const filteredNav = NAV_ITEMS.filter(item => 
    item.label.toLowerCase().includes(navSearch.toLowerCase())
  );

  const handleLogout = async () => {
    playSound.click();
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 relative">
            <img 
              src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
              alt="LattQuiz Logo" 
              className="w-full h-full object-contain mix-blend-screen"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-black tracking-tighter text-xl text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">LattQuiz</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSelector />
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
          <div className="hidden md:flex items-center gap-3 mb-6 p-2 rounded-xl border border-white/5 bg-white/5 group">
            <div className="w-10 h-10 relative">
              <div className="absolute inset-0 bg-neon-blue/20 blur-lg group-hover:bg-neon-blue/40 transition-all rounded-full" />
              <img 
                src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
                alt="LattQuiz Logo" 
                className="w-full h-full object-contain relative z-10 mix-blend-screen animate-pulse"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="font-black tracking-tighter text-xl text-foreground">LattQuiz</span>
              <div className="text-[7px] font-mono opacity-40 tracking-[0.2em] group-hover:opacity-70 transition-opacity uppercase">Neural Network Intel</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />
              <ThemeSelector />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 mb-4 px-2 opacity-30 hover:opacity-100 transition-opacity">
            <span className="text-[8px] font-mono uppercase tracking-[0.1em]">Latt Engine v4.0</span>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input 
              placeholder="Buscar sección..." 
              value={navSearch}
              onChange={e => setNavSearch(e.target.value)}
              className="h-8 pl-8 text-[10px] uppercase font-mono bg-secondary/20 border-border/50 focus:border-neon-blue/50"
            />
          </div>

          <nav className="flex-1 space-y-1">
            {filteredNav.map((item) => (
              <NavItem 
                key={item.to}
                to={item.to} 
                onClick={() => setSidebarOpen(false)} 
                icon={item.icon} 
                label={item.label} 
                active={item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to)} 
              />
            ))}
            {filteredNav.length === 0 && (
              <p className="text-[10px] text-center text-muted-foreground italic py-4">No hay resultados</p>
            )}
          </nav>

          <div className="pt-6 border-t border-border mt-auto">
            <div className="flex items-center gap-3 mb-6 p-2 rounded-xl bg-secondary/30">
               <div className="w-10 h-10 rounded-lg bg-neon-blue flex items-center justify-center text-black font-black italic">
                 {user?.displayName?.slice(0, 1).toUpperCase() || 'D'}
               </div>
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{user?.displayName || 'Docente'}</p>
                  <p className="text-[10px] text-muted-foreground truncate uppercase font-mono tracking-widest">Master Commander</p>
               </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/5 group px-4">
              <LogOut className="mr-3 h-5 w-5 group-hover:animate-pulse" />
              Desconectar
            </Button>
            
            <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
               <div className="px-4">
                 <p className="text-[8px] uppercase font-black text-muted-foreground tracking-[0.2em] mb-1">Autoría de Plataforma</p>
                 <p className="text-[10px] font-bold text-neon-blue italic">M.E.M.S. Wilfredo Chaparro Córdova</p>
               <p className="text-[8px] uppercase font-mono tracking-widest leading-tight opacity-40">"La voluntad de transformar la realidad"</p>
               </div>
               <div className="px-4 opacity-30 group-hover:opacity-100 transition-opacity">
                 <p className="text-[7px] uppercase font-mono tracking-widest leading-tight">LattQuiz / Education Systems<br/>v4.0.2 / Build 2026</p>
               </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-8 relative min-h-[calc(100vh-65px)] md:min-h-screen custom-scrollbar">
        <div className="absolute top-0 left-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-neon-blue/5 mix-blend-screen filter blur-[100px] pointer-events-none"></div>
        
        <Breadcrumbs />
        {showWelcome && <WelcomeModal user={user} onClose={() => {}} />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname.split('?')[0]}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Routes location={location}>
              <Route path="/" element={<DashboardView pendingRequests={pendingRequests} />} />
              <Route path="/missions" element={<MissionsPanel onPreview={setPreviewType} />} />
              <Route path="/missions/:id/builder" element={<MissionBuilder />} />
              <Route path="/sessions/:sessionId/control" element={<LiveGameControl />} />
              <Route path="/telemetry" element={<TelemetryViewContainer globalConfig={globalConfig} />} />
              <Route path="/reports" element={<ReportsPanel />} />
              <Route path="/surveys" element={<SurveysView />} />
              <Route path="/library" element={<QuestionLibrary />} />
              <Route path="/ai" element={<AIQuestGeneratorView globalConfig={globalConfig} />} />
              <Route path="/monitor/:sessionId" element={<LiveMonitor />} />
              <Route path="/students" element={<StudentsPanel pendingRequests={pendingRequests} onRefreshRequests={fetchRequests} />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {previewType && <MissionPreview type={previewType} onClose={() => setPreviewType(null)} />}
      </AnimatePresence>
    </div>
  );
}

function CounterCard({ label, value, subValue, icon: Icon, color = "text-neon-blue" }: any) {
  const glowClass = color.includes('neon-blue') ? 'neo-glow-blue' : 'neo-glow';
  return (
    <Card className={`border-border/50 bg-card/30 backdrop-blur-xl p-6 ${glowClass} border-t-2 ${color.replace('text-', 'border-')}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-secondary/50 rounded-lg">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{label}</p>
          <p className={`text-3xl font-black italic ${color}`}>{value}</p>
        </div>
      </div>
      {subValue && <p className="text-[10px] font-mono text-muted-foreground uppercase">{subValue}</p>}
    </Card>
  );
}

function ReportsPanel() {
  const { user } = useAuthStore();
  const { subjects, groups } = useSubjectsGroupsStore();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [hasMoreAttempts, setHasMoreAttempts] = useState(true);
  const [loadingMoreAttempts, setLoadingMoreAttempts] = useState(false);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewAttempt, setReviewAttempt] = useState<any | null>(null);
  
  // Filters
  const [selSubjectId, setSelSubjectId] = useState('ALL');
  const [selGroupId, setSelGroupId] = useState('ALL');
  const [selQuizId, setSelQuizId] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => { setCurrentPage(1); }, [selSubjectId, selGroupId, selQuizId, searchTerm]);

  const fetchReportsData = async (isNextPage = false) => {
    try {
      if (isNextPage) setLoadingMoreAttempts(true);
      else setLoading(true);

      let query = supabase
        .from('attempts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (isNextPage && lastAttemptId) {
        // Need to handle pagination differently with Supabase if using range or gt/lt
        // Simplified for now: just fetch a larger batch or use a proper pagination strategy
      }

      const [{ data: attemptsData, error: attemptsError }, { data: quizzesData, error: quizzesError }] = await Promise.all([
        query,
        !isNextPage ? supabase.from('quizzes').select('*').eq('teacher_id', user?.id).limit(200) : Promise.resolve({ data: [], error: null })
      ]);

      if (attemptsError) throw attemptsError;
      if (quizzesError) throw quizzesError;

      const newAttempts = attemptsData || [];
      
      if (isNextPage) {
        setAttempts(prev => [...prev, ...newAttempts]);
      } else {
        setAttempts(newAttempts);
        setQuizzes(quizzesData || []);
      }

      if (newAttempts.length > 0) {
        setLastAttemptId(newAttempts[newAttempts.length - 1].id);
      }
      setHasMoreAttempts(newAttempts.length === 50);
    } catch (err: any) {
      errorService.handle(err, 'Fetch Reports');
    } finally {
      setLoading(false);
      setLoadingMoreAttempts(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchReportsData();
  }, [user?.id]);

  const filteredAttempts = attempts.filter(a => {
    const matchesSubject = selSubjectId === 'ALL' || a.subjectId === selSubjectId;
    const matchesGroup = selGroupId === 'ALL' || a.groupId === selGroupId;
    const matchesQuiz = selQuizId === 'ALL' || a.quizId === selQuizId;
    const matchesSearch = a.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          a.quizTitle?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSubject && matchesGroup && matchesQuiz && matchesSearch;
  });

  const avgScore = filteredAttempts.length > 0 
    ? (filteredAttempts.reduce((acc, curr) => {
        const total = curr.totalQuestions || 0;
        const score = curr.score || 0;
        const calculated = total > 0 ? (score / (total * 10) * 10) : 0;
        return acc + calculated;
      }, 0) / filteredAttempts.length).toFixed(1)
    : '0.0';

  const downloadCSV = () => {
    const headers = ['Fecha', 'Alumno', 'Materia', 'Grupo', 'Prueba', 'Puntaje', 'Calificación'];
    const rows = filteredAttempts.map(a => {
      const total = a.totalQuestions || 0;
      const scoreScale = total > 0 ? (a.score / (total * 10) * 10).toFixed(1) : '0.0';
      return [
        new Date(a.timestamp).toLocaleDateString(),
        a.studentName,
        a.subjectName || 'N/A',
        groups.find(g => g.id === a.groupId)?.name || 'N/A',
        a.quizTitle,
        a.score,
        scoreScale
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_lattquiz_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <LoadingPulse message="Generando Síntesis de Datos" />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter">CENTRO DE REPORTES</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1 opacity-70">Sistemas de Analítica Transversal // Consultas Globales</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.location.reload()}
            className="border-neon-blue/30 text-neon-blue font-bold h-10 px-4"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> ACTUALIZAR DATOS
          </Button>
          <Button onClick={downloadCSV} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black italic h-10">
            <FileText className="w-4 h-4 mr-2" /> EXPORTAR CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CounterCard label="Misiones Evaluadas" value={filteredAttempts.length.toString()} icon={Target} color="text-neon-blue" />
        <CounterCard label="Promedio de Selección" value={avgScore} icon={Star} color="text-yellow-500" subValue="Escala 0.0 - 10.0" />
        <CounterCard label="Alumnos Participantes" value={new Set(filteredAttempts.map(a => a.studentId)).size.toString()} icon={Users} color="text-neon-purple" />
      </div>

      <Card className="border-border bg-card/30 backdrop-blur-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase opacity-60">Materia</Label>
            <select value={selSubjectId} onChange={e => setSelSubjectId(e.target.value)} className="w-full bg-background border border-border h-10 px-3 rounded-md text-xs font-bold uppercase">
              <option value="ALL">Todas las Materias</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase opacity-60">Grupo</Label>
            <select value={selGroupId} onChange={e => setSelGroupId(e.target.value)} className="w-full bg-background border border-border h-10 px-3 rounded-md text-xs font-bold uppercase">
              <option value="ALL">Todos los Grupos</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase opacity-60">Misión / Prueba</Label>
            <select value={selQuizId} onChange={e => setSelQuizId(e.target.value)} className="w-full bg-background border border-border h-10 px-3 rounded-md text-xs font-bold uppercase">
              <option value="ALL">Todas las Misiones</option>
              {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase opacity-60">Buscar Alumno</Label>
            <Input 
              placeholder="Nombre o ID..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="h-10 text-xs italic"
            />
          </div>
        </div>

        <div className="rounded-xl border border-divider overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow>
                <TableHead className="text-[9px] uppercase font-black">Fecha</TableHead>
                <TableHead className="text-[9px] uppercase font-black">Alumno</TableHead>
                <TableHead className="text-[9px] uppercase font-black">Misión</TableHead>
                <TableHead className="text-[9px] uppercase font-black text-center">Score</TableHead>
                <TableHead className="text-[9px] uppercase font-black text-right">Calificación</TableHead>
                <TableHead className="text-[9px] uppercase font-black text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttempts.length > 0 ? filteredAttempts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((a) => (
                <TableRow key={a.id} className="hover:bg-white/5 border-b border-border/10">
                  <TableCell className="py-4 text-[10px] font-mono text-muted-foreground">
                    {new Date(a.timestamp).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{a.studentName}</span>
                      <span className="text-[9px] font-mono opacity-50 uppercase tracking-tighter">Matrícula vinculada</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{a.quizTitle}</span>
                      <span className="text-[8px] font-black text-neon-blue uppercase">{a.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold text-muted-foreground">
                    {a.score} pts
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className={`font-black italic px-3 ${ (a.totalQuestions > 0 ? (a.score / (a.totalQuestions * 10) * 10) : 0) >= 6 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {(a.totalQuestions > 0 ? (a.score / (a.totalQuestions * 10) * 10) : 0).toFixed(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-neon-blue hover:bg-neon-blue/10" onClick={() => setReviewAttempt(a)}>
                       <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-20 text-center text-muted-foreground italic text-sm">
                    No hay intentos que coincidan con la búsqueda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {filteredAttempts.length > itemsPerPage && (
          <div className="p-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between bg-black/5 gap-4">
            <div className="text-[10px] font-black uppercase opacity-60">
               Mostrando {Math.min(filteredAttempts.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredAttempts.length, currentPage * itemsPerPage)} de {filteredAttempts.length}
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
                  {Array.from({ length: Math.min(5, Math.ceil(filteredAttempts.length / itemsPerPage)) }).map((_, i) => (
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
               </div>
               <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === Math.ceil(filteredAttempts.length / itemsPerPage)}
                onClick={() => { playSound.click(); setCurrentPage(prev => prev + 1); }}
                className="h-8 border-white/10 text-[10px] font-black uppercase"
               >
                 Siguiente
               </Button>
            </div>
          </div>
        )}

        {hasMoreAttempts && (
          <div className="p-4 border-t border-white/5 flex justify-center">
            <Button 
              variant="ghost" 
              onClick={() => fetchReportsData(true)} 
              disabled={loadingMoreAttempts}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-neon-blue"
            >
              {loadingMoreAttempts ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
              {loadingMoreAttempts ? 'Sincronizando...' : 'Ver Más Registros'}
            </Button>
          </div>
        )}
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewAttempt} onOpenChange={() => setReviewAttempt(null)}>
        <DialogContent className="max-w-3xl bg-card border-border backdrop-blur-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic tracking-tighter">REVISIÓN DE PRUEBA</DialogTitle>
            <DialogDescription className="text-xs font-mono uppercase">Detalle pedagógico del intento: {reviewAttempt?.id}</DialogDescription>
          </DialogHeader>

          {reviewAttempt && (
            <div className="flex-1 overflow-auto space-y-6 py-4 px-2">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/50">
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Alumno</span>
                     <span className="text-xs font-bold leading-none">{reviewAttempt.studentName}</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Misión</span>
                     <span className="text-xs font-bold leading-none">{reviewAttempt.quizTitle}</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Score Total</span>
                     <span className="text-xs font-bold leading-none text-neon-blue">{reviewAttempt.score} pts</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black opacity-50 uppercase">Calificación</span>
                     <span className={`text-xs font-bold leading-none ${(reviewAttempt.totalQuestions > 0 ? (reviewAttempt.score / (reviewAttempt.totalQuestions * 10) * 10) : 0) >= 6 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(reviewAttempt.totalQuestions > 0 ? (reviewAttempt.score / (reviewAttempt.totalQuestions * 10) * 10) : 0).toFixed(1)} / 10.0
                     </span>
                  </div>
               </div>

               <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60">Resultados por Reactivo</h3>
                  {reviewAttempt.responses ? reviewAttempt.responses.map((resp: any, idx: number) => (
                    <div key={idx} className={`p-4 rounded-xl border transition-all ${resp.isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                       <div className="flex justify-between gap-4 mb-2">
                          <p className="text-sm font-bold flex-1">{idx + 1}. {resp.questionText}</p>
                          <Badge variant="outline" className={resp.isCorrect ? 'text-emerald-400 border-emerald-400/50' : 'text-red-400 border-red-400/50'}>
                             {resp.isCorrect ? '+ ' + resp.points : 'FALLO'}
                          </Badge>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                          <div className="space-y-1">
                             <p className="opacity-50 uppercase font-bold">Respuesta del Alumno</p>
                             <p className={`font-mono px-2 py-1 rounded bg-black/20 ${resp.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>{resp.studentAnswer}</p>
                          </div>
                          {!resp.isCorrect && (
                            <div className="space-y-1">
                               <p className="opacity-50 uppercase font-bold">Respuesta Correcta</p>
                               <p className="font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">{resp.correctAnswer}</p>
                            </div>
                          )}
                       </div>
                    </div>
                  )) : (
                    <div className="p-10 border-2 border-dashed border-border rounded-2xl text-center opacity-50">
                       <p className="italic text-sm">Este intento no posee metadatos de respuesta detallados (Versión Anterior).</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border mt-auto">
             <Button onClick={() => setReviewAttempt(null)} className="bg-neon-blue text-black font-black italic">CERRAR REVISIÓN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PROMPT_TEMPLATES = [
  { id: 'diag', label: 'Evaluación Diagnóstica', prompt: 'Enfócate en identificar conocimientos previos y lagunas conceptuales básicas.' },
  { id: 'review', label: 'Refuerzo de Conceptos', prompt: 'Preguntas diseñadas para consolidar lo aprendido en clase con retroalimentación detallada.' },
  { id: 'challenge', label: 'Desafío Avanzado', prompt: 'Problemas de alto nivel cognitivo que requieren síntesis y evaluación de múltiples conceptos.' },
  { id: 'exam', label: 'Simulador de Examen', prompt: 'Estructura formal de reactivos alineados a estándares de evaluación oficial.' },
  { id: 'gamified', label: 'Ludificación / Aventura', prompt: 'Preguntas narrativas integradas en una temática de misión espacial o búsqueda del tesoro.' },
];

function AIQuestGeneratorView({ globalConfig }: { globalConfig: any }) {
  if (globalConfig?.aiEnabled === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
        <div className="w-20 h-20 bg-neon-pink/10 rounded-full flex items-center justify-center animate-pulse border border-neon-pink/30">
          <BrainCircuit className="w-10 h-10 text-neon-pink" />
        </div>
        <h1 className="text-3xl font-black italic uppercase text-neon-pink text-glow">Latt AI Desactivada Temporalmente</h1>
        <p className="text-muted-foreground max-w-md text-sm uppercase font-bold tracking-widest opacity-60">
          El generador de misiones con Inteligencia Artificial ha sido suspendido por el Administrador para optimizar los recursos del núcleo.
        </p>
        <Button variant="outline" onClick={() => window.history.back()} className="font-bold border-white/20 hover:bg-white/5 uppercase text-[10px] italic tracking-widest">
          VOLVER AL NODO PRINCIPAL
        </Button>
      </div>
    );
  }

  const { user } = useAuthStore();
  const [topics, setTopics] = useState<string[]>(['']);
  const [genTitle, setGenTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(PROMPT_TEMPLATES[0].id);
  const [count, setCount] = useState(5);
  const [type, setType] = useState('CLASICO');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [generatedQuests, setGeneratedQuests] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Quizzes
    const fetchQuizzes = async () => {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('teacher_id', user.id);
      if (data) setQuizzes(data);
    };
    fetchQuizzes();

    // History
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('ai_generation_history')
        .select('*')
        .eq('teacher_id', user.id)
        .order('timestamp', { ascending: false });
      if (data) setHistory(data);
    };
    fetchHistory();

    // In a real app we'd use real-time listeners, but for now we'll stick to fetches to simplify migration
  }, [user]);

  const handleGenerate = async () => {
    const validTopics = topics.filter(t => t.trim() !== '');
    if (validTopics.length === 0) {
      notify('Define al menos una temática.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const templatePrompt = PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.prompt || '';
      const results = await generateQuestionsAI(validTopics, count, type, difficulty, genTitle, templatePrompt);
      setGeneratedQuests(results);
      
      // Save to history
      const { error } = await supabase
        .from('ai_generation_history')
        .insert([{
          teacher_id: user?.id,
          topics: validTopics,
          title: genTitle,
          template_id: selectedTemplate,
          count,
          type,
          difficulty,
          results,
          timestamp: new Date().toISOString()
        }]);
      
      if (error) throw error;
    } catch (e) {
      errorService.handle(e, 'Generate AI Questions');
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: any) => {
    setTopics(item.topics || [item.topic || '']);
    setGenTitle(item.title || '');
    setSelectedTemplate(item.template_id || PROMPT_TEMPLATES[0].id);
    setCount(item.count);
    setType(item.type);
    setDifficulty(item.difficulty);
    setGeneratedQuests(item.results);
    setShowHistory(false);
  };

  const addTopicField = () => {
    if (topics.length < 8) {
      setTopics([...topics, '']);
    } else {
      notify('Máximo 8 temáticas por generación.', 'info');
    }
  };

  const removeTopicField = (index: number) => {
    if (topics.length > 1) {
      const newTopics = [...topics];
      newTopics.splice(index, 1);
      setTopics(newTopics);
    }
  };

  const updateTopicValue = (index: number, value: string) => {
    const newTopics = [...topics];
    newTopics[index] = value;
    setTopics(newTopics);
  };

  const saveToQuiz = async () => {
    if (!selectedQuizId) {
      notify('Selecciona una misión para guardar las preguntas.', 'warning');
      return;
    }
    
    setLoading(true);
    try {
      const questionsToInsert = generatedQuests.map(q => ({
        quiz_id: selectedQuizId,
        text: q.text,
        type: q.type,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        media_url: q.mediaUrl,
        points: q.points || 10
      }));

      const { error } = await supabase
        .from('questions')
        .insert(questionsToInsert);

      if (error) throw error;

      notify('¡Preguntas integradas exitosamente!', 'success');
      setGeneratedQuests([]);
      setTopics(['']);
    } catch (e) {
      errorService.handle(e, 'Save AI Questions to Quiz');
    } finally {
      setLoading(false);
    }
  };

  const updateQuest = (index: number, updates: any) => {
    const newQuests = [...generatedQuests];
    newQuests[index] = { ...newQuests[index], ...updates };
    setGeneratedQuests(newQuests);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter flex items-center gap-3">
            <BrainCircuit className="w-10 h-10 text-neon-blue" /> LATT AI GENERATOR
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1 opacity-70">Sincronización con Neuro-Red Gemini Pro // Generación de Reactivos</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setShowHistory(true)}
          className="border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10 font-bold italic"
        >
          <History className="w-4 h-4 mr-2" /> VER HISTORIAL
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Configuration Panel */}
        <Card className="lg:col-span-1 border-neon-blue/20 bg-card/30 backdrop-blur-xl p-8 h-fit sticky top-8">
           <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Título de la Evaluación (Opcional)</Label>
                <Input 
                  value={genTitle} 
                  onChange={e => setGenTitle(e.target.value)}
                  placeholder="Ej. Primer Parcial, Quiz Semanal..."
                  className="bg-background/50 border-neon-blue/30 h-10 text-xs italic"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Plantilla Pedagógica</Label>
                <select 
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-neon-blue/30 bg-background/50 px-3 py-2 text-[10px] font-black uppercase focus:ring-1 focus:ring-neon-blue transition-all"
                >
                  {PROMPT_TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <p className="text-[8px] text-muted-foreground italic px-1">
                  {PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.prompt}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Temáticas a Evaluar</Label>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={addTopicField}
                    className="h-6 w-6 rounded-full hover:bg-neon-blue/10 text-neon-blue"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {topics.map((t, idx) => (
                    <div key={idx} className="flex gap-2 animate-in slide-in-from-right-4 duration-300">
                      <Input 
                        value={t} 
                        onChange={e => updateTopicValue(idx, e.target.value)}
                        placeholder={`Temática ${idx + 1}...`}
                        className="bg-background/50 border-neon-blue/20 h-10 text-xs italic focus:border-neon-blue"
                      />
                      {topics.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeTopicField(idx)}
                          className="h-10 w-10 shrink-0 opacity-40 hover:opacity-100 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Cantidad</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    max={15} 
                    value={count} 
                    onChange={e => setCount(parseInt(e.target.value))}
                    className="bg-background/50 border-neon-blue/30 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Tipo de Prueba</Label>
                  <select 
                    value={type}
                    onChange={e => setType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-neon-blue/30 bg-background/50 px-3 py-2 text-[10px] font-black uppercase focus:ring-1 focus:ring-neon-blue transition-all"
                  >
                    <option value="CLASICO">Opción Múltiple</option>
                    <option value="IDENTIFICADOR">Identificar en Imagen</option>
                    <option value="MEMORAMA">Memorama Lógico</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Grado de Complejidad</Label>
                <select 
                  value={difficulty}
                  onChange={e => setDifficulty(e.target.value as any)}
                  className="flex h-12 w-full rounded-md border border-neon-blue/30 bg-background/50 px-3 py-2 text-xs font-black uppercase focus:ring-1 focus:ring-neon-blue transition-all text-neon-blue"
                >
                  <option value="EASY">🟢 NIVEL 1 (FÁCIL)</option>
                  <option value="MEDIUM">🟡 NIVEL 2 (MEDIO)</option>
                  <option value="HARD">🔴 NIVEL 3 (DIFÍCIL)</option>
                </select>
              </div>

              <Button 
                onClick={handleGenerate} 
                disabled={loading || topics.every(t => t.trim() === '')}
                className="w-full bg-neon-blue text-black font-black italic h-14 shadow-[0_0_30px_rgba(0,243,255,0.2)] hover:shadow-[0_0_40px_rgba(0,243,255,0.4)] transition-all group"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 group-hover:animate-pulse mr-2" />} 
                {loading ? 'SINTETIZANDO...' : 'GENERAR CON INTELIGENCIA ARTIFICIAL'}
              </Button>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Destino de los Datos</Label>
                  <select 
                    value={selectedQuizId}
                    onChange={e => setSelectedQuizId(e.target.value)}
                    className="flex h-12 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-neon-blue"
                  >
                    <option value="">Seleccionar Misión...</option>
                    {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                  </select>
                </div>
                <Button 
                  onClick={saveToQuiz} 
                  disabled={loading || generatedQuests.length === 0 || !selectedQuizId}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black italic h-12 disabled:opacity-30"
                >
                  <SaveIcon className="w-4 h-4 mr-2" /> INTEGRAR A LA MISIÓN
                </Button>
              </div>
           </div>
        </Card>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
           {generatedQuests.length === 0 && !loading && (
             <div className="h-full min-h-[400px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-card/10 opacity-50">
               <div className="w-20 h-20 bg-neon-blue/10 rounded-full flex items-center justify-center mb-4">
                 <BrainCircuit className="w-10 h-10 text-neon-blue" />
               </div>
               <h3 className="text-xl font-black italic uppercase italic">Zona de Despliegue Vacía</h3>
               <p className="text-xs text-muted-foreground max-w-xs mt-2">Introduce un tema y la IA de Will Alter generará reactivos pedagógicamente validados para tus misiones.</p>
             </div>
           )}

           {loading && (
             <div className="space-y-6">
                {[1,2,3].map(i => (
                  <div key={i} className="h-40 rounded-2xl bg-white/5 border border-white/5 animate-pulse flex items-center justify-center">
                    <div className="w-2/3 h-4 bg-white/10 rounded-full"></div>
                  </div>
                ))}
             </div>
           )}

           <div className="space-y-4">
              {generatedQuests.map((q, idx) => (
                <Card key={idx} className="border-border/50 bg-card/40 backdrop-blur-xl p-6 group relative overflow-hidden transition-all hover:border-neon-blue/40">
                   <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => setEditingIndex(idx)}><PencilIcon className="w-4 h-4 text-neon-blue" /></Button>
                   </div>
                   
                   <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-neon-blue/10 flex items-center justify-center text-neon-blue font-black italic text-xs border border-neon-blue/20">
                        {idx + 1}
                      </div>
                      <div className="flex-1 space-y-4">
                         <h4 className="font-bold text-lg leading-tight">{q.text}</h4>
                         
                         {q.type === 'CLASICO' && (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.options.map((opt: string, oi: number) => (
                                <div key={oi} className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${opt === q.correctAnswer ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-black/20 border-white/5 opacity-70'}`}>
                                   {opt}
                                   {opt === q.correctAnswer && <Check className="w-3 h-3" />}
                                </div>
                              ))}
                           </div>
                         )}

                         {q.type === 'MEMORAMA_PAIR' && (
                           <div className="flex gap-2 items-center">
                              <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/30">{q.itemA.content}</Badge>
                              <div className="w-4 h-0.5 bg-muted-foreground/20"></div>
                              <Badge variant="outline" className="opacity-70">{q.itemB.content}</Badge>
                           </div>
                         )}

                         <p className="text-[10px] text-muted-foreground italic font-mono uppercase bg-black/40 p-2 rounded-lg border border-white/5">
                            Retroalimentación: {q.explanation || 'Se identificará la relación lógica correcta.'}
                         </p>
                      </div>
                   </div>
                </Card>
              ))}
           </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editingIndex !== null} onOpenChange={() => setEditingIndex(null)}>
        <DialogContent className="max-w-2xl bg-card border-border backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="font-black italic text-neon-blue text-2xl">EDITAR NEURO-REACTIVO</DialogTitle>
            <DialogDescription className="text-xs font-mono uppercase">Ajuste manual de la síntesis de IA</DialogDescription>
          </DialogHeader>
          
          {editingIndex !== null && (
            <div className="space-y-6 pt-4">
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase opacity-60">Cuerpo de la Pregunta</Label>
                 <Input 
                   value={generatedQuests[editingIndex].text} 
                   onChange={e => updateQuest(editingIndex, { text: e.target.value })}
                   className="font-bold"
                 />
               </div>

               {generatedQuests[editingIndex].type === 'CLASICO' && (
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase opacity-60">Opciones de Respuesta</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                       {generatedQuests[editingIndex].options.map((opt: string, i: number) => (
                         <div key={i} className="flex gap-2">
                           <Input 
                             value={opt} 
                             onChange={e => {
                               const newOpts = [...generatedQuests[editingIndex].options];
                               newOpts[i] = e.target.value;
                               updateQuest(editingIndex, { options: newOpts });
                             }}
                             className={`text-xs ${opt === generatedQuests[editingIndex].correctAnswer ? 'border-emerald-500' : ''}`}
                           />
                           <Button 
                             variant="ghost" 
                             size="icon" 
                             className={opt === generatedQuests[editingIndex].correctAnswer ? 'text-emerald-500' : 'text-muted-foreground'}
                             onClick={() => updateQuest(editingIndex, { correctAnswer: opt })}
                           >
                              <Check className="w-4 h-4" />
                           </Button>
                         </div>
                       ))}
                    </div>
                 </div>
               )}

               {generatedQuests[editingIndex].type === 'IDENTIFICADOR' && (
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase opacity-60">Puntos a Identificar (JSON Config)</Label>
                    <div className="grid gap-2">
                       {generatedQuests[editingIndex].options.map((optStr: string, i: number) => {
                         const data = JSON.parse(optStr);
                         return (
                           <div key={i} className="flex gap-2 items-center bg-secondary/20 p-2 rounded-lg">
                              <span className="w-6 h-6 bg-neon-blue rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0">{i+1}</span>
                              <Input 
                                placeholder="Respuesta" 
                                value={data.answer} 
                                onChange={e => {
                                  const newOpts = [...generatedQuests[editingIndex].options];
                                  const updated = { ...data, answer: e.target.value };
                                  newOpts[i] = JSON.stringify(updated);
                                  updateQuest(editingIndex, { options: newOpts });
                                }}
                                className="h-8 text-xs font-bold"
                              />
                              <div className="flex gap-1 items-center">
                                <Label className="text-[8px] opacity-40">X:</Label>
                                <Input type="number" value={data.x || 0} onChange={e => {
                                  const newOpts = [...generatedQuests[editingIndex].options];
                                  newOpts[i] = JSON.stringify({...data, x: parseInt(e.target.value) || 0});
                                  updateQuest(editingIndex, { options: newOpts });
                                }} className="w-12 h-8 text-[10px]" />
                                <Label className="text-[8px] opacity-40">Y:</Label>
                                <Input type="number" value={data.y || 0} onChange={e => {
                                  const newOpts = [...generatedQuests[editingIndex].options];
                                  newOpts[i] = JSON.stringify({...data, y: parseInt(e.target.value) || 0});
                                  updateQuest(editingIndex, { options: newOpts });
                                }} className="w-12 h-8 text-[10px]" />
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
               )}

               {generatedQuests[editingIndex].type === 'MEMORAMA_PAIR' && (
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase opacity-60">Elemento A (Concepto)</Label>
                       <Input 
                         value={generatedQuests[editingIndex].itemA?.content || ''}
                         onChange={e => updateQuest(editingIndex, { itemA: { ...(generatedQuests[editingIndex].itemA || {}), content: e.target.value, type: 'TEXT' } })}
                         className="text-xs font-bold"
                       />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase opacity-60">Elemento B (Definición)</Label>
                       <Input 
                         value={generatedQuests[editingIndex].itemB?.content || ''}
                         onChange={e => updateQuest(editingIndex, { itemB: { ...(generatedQuests[editingIndex].itemB || {}), content: e.target.value, type: 'TEXT' } })}
                         className="text-xs font-bold"
                       />
                    </div>
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase opacity-60">URL de Imagen/Audio/Media</Label>
                    <Input 
                      placeholder="https://..." 
                      value={generatedQuests[editingIndex].mediaUrl || ''} 
                      onChange={e => updateQuest(editingIndex, { mediaUrl: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase opacity-60">Base Teórica (Retroalimentación)</Label>
                    <Input 
                      value={generatedQuests[editingIndex].explanation || ''} 
                      onChange={e => updateQuest(editingIndex, { explanation: e.target.value })}
                      className="italic text-xs"
                    />
                  </div>
               </div>
            </div>
          )}

          <DialogFooter className="pt-8">
             <Button onClick={() => setEditingIndex(null)} className="bg-neon-blue text-black font-black italic px-8">FINALIZAR EDICIÓN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl bg-card/95 border-border backdrop-blur-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic tracking-tighter text-neon-blue">HISTORIAL DE GENERACIÓN</DialogTitle>
            <DialogDescription className="text-xs font-mono uppercase">Prompts y resultados previos sintetizados por Latt AI</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-6">
            {history.length === 0 ? (
              <div className="text-center py-20 opacity-40 italic">No hay registros previos en la neuro-memoria.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.map((item) => (
                  <Card key={item.id} className="border-white/5 bg-white/5 p-4 hover:border-neon-blue/30 transition-all group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <Badge className="bg-neon-blue/10 text-neon-blue border-neon-blue/20 text-[8px]">{new Date(item.timestamp).toLocaleString()}</Badge>
                        <Badge variant="outline" className="text-[8px] opacity-60 uppercase">{item.type}</Badge>
                      </div>
                      <h4 className="text-sm font-bold truncate mb-1">{item.topic}</h4>
                      <p className="text-[10px] text-muted-foreground mb-4 uppercase font-mono">{item.results.length} Reactivos // Nivel {item.difficulty}</p>
                    </div>
                    <Button 
                      onClick={() => loadFromHistory(item)}
                      className="w-full bg-secondary/50 hover:bg-neon-blue/20 text-xs font-black uppercase tracking-widest h-8"
                    >
                      Restaurar Preguntas
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border/50">
            <Button onClick={() => setShowHistory(false)} variant="ghost" className="font-bold italic uppercase text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">Cerrar Historial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentsPanel({ pendingRequests, onRefreshRequests }: { pendingRequests: any[], onRefreshRequests: () => void }) {
  const { user } = useAuthStore();
  const { groups, subjects } = useSubjectsGroupsStore();
  const [myStudents, setMyStudents] = useState<any[]>([]);
  const [lastStudentDoc, setLastStudentDoc] = useState<any>(null);
  const [hasMoreStudents, setHasMoreStudents] = useState(true);
  const [loadingMoreStudents, setLoadingMoreStudents] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState('ALL');
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchStudents = async (isNextPage = false) => {
    if (!user?.id) return;
    try {
      if (isNextPage) setLoadingMoreStudents(true);
      else setLoading(true);

      const teacherGroupIds = user.groupIds || [];
      const teacherSubjectIds = user.subjectIds || [];

      let query = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'STUDENT')
        .limit(50);

      // Filter by teacher's groups/subjects
      if (teacherGroupIds.length > 0) {
        // query = query.contains('group_ids', teacherGroupIds); // Postgres array contains
      }

      const { data: students, error } = await query;
      if (error) throw error;
      
      const assignedToMe = students.filter(s => 
        (s.group_ids?.some((ig: string) => teacherGroupIds.includes(ig))) ||
        (s.subject_ids?.some((is: string) => teacherSubjectIds.includes(is)))
      );

      const unassigned = students.filter(s => 
        (!s.group_ids || s.group_ids.length === 0) && 
        (!s.subject_ids || s.subject_ids.length === 0)
      );

      if (isNextPage) {
        setMyStudents(prev => [...prev, ...assignedToMe]);
        setUnassignedStudents(prev => [...prev, ...unassigned]);
      } else {
        setMyStudents(assignedToMe);
        setUnassignedStudents(unassigned);
      }

      if (students.length > 0) {
        setLastStudentDoc(null); // Pagination index if needed
      }
      setHasMoreStudents(students.length === 50);
      setLoading(false);
      setLoadingMoreStudents(false);
    } catch (err) {
      console.error('Fetch Students Error:', err);
      setLoading(false);
      setLoadingMoreStudents(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [user?.id]);

  const filteredStudents = selectedGroupId === 'ALL' 
    ? myStudents 
    : myStudents.filter(s => s.group_ids?.includes(selectedGroupId));

  const handleDeleteStudent = async (student: any) => {
    if (!confirm(`¿Estás seguro de eliminar a ${student.full_name} del registro? Esta acción es irreversible.`)) return;
    playSound.click();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          active: false,
          // metadata or logs could store unassignedBy
        })
        .eq('id', student.id);
      
      if (error) throw error;
      notify('Alumno removido exitosamente.', 'success');
      fetchStudents();
    } catch (e) {
      errorService.handle(e, 'Remove Student');
    }
  };

  const handleToggleSelectAll = () => {
    playSound.click();
    if (selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map(s => s.id));
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    playSound.click();
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const handleBulkRemove = async () => {
    if (selectedStudentIds.length === 0) return;
    if (!confirm(`¿Remover a ${selectedStudentIds.length} alumnos de tus grupos?`)) return;
    
    playSound.click();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active: false })
        .in('id', selectedStudentIds);
      
      if (error) throw error;
      setSelectedStudentIds([]);
      notify('Alumnos removidos exitosamente.', 'success');
      fetchStudents();
    } catch (e) {
      errorService.handle(e, 'Bulk Remove Students');
    }
  };

  const handleBulkResetAlerts = async () => {
    if (selectedStudentIds.length === 0) return;
    if (!confirm(`¿Reiniciar contadores de alerta de ${selectedStudentIds.length} alumnos?`)) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          // Assuming these fields exist in extra_data or similar, or added to schema
          // For now, let's assume they are columns if we added them
          // tab_violations: 0, 
          // phone_violations: 0 
        })
        .in('id', selectedStudentIds);
      if (error) throw error;
      setSelectedStudentIds([]);
      notify('Contadores reiniciados en masa.', 'success');
    } catch (e) {
      errorService.handle(e, 'Reset Alerts Bulk');
    }
  };

  const handleBulkBlockStudents = async (blocked: boolean) => {
    if (selectedStudentIds.length === 0) return;
    const action = blocked ? 'Bloquear' : 'Desbloquear';
    if (!confirm(`¿${action} a ${selectedStudentIds.length} alumnos seleccionados?`)) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_blocked: blocked,
          block_reason: blocked ? 'Bloqueo masivo por docente' : null
        })
        .in('id', selectedStudentIds);
      if (error) throw error;
      setSelectedStudentIds([]);
      notify(`Alumnos ${blocked ? 'bloqueados' : 'desbloqueados'} en masa.`, 'success');
    } catch (e) {
      errorService.handle(e, 'Bulk Block Students');
    }
  };

  const handleExportExcel = () => {
    if (selectedStudentIds.length === 0) return;
    const studentsToExport = filteredStudents.filter(s => selectedStudentIds.includes(s.id));
    
    const data = studentsToExport.map(s => ({
      'ID de Usuario': s.id,
      'Nombre Completo': s.full_name,
      'Matrícula': s.matricula || 'N/A',
      'Código de Acceso': s.student_code || 'N/A',
      'Grupos': (s.group_ids || []).map((id: string) => groups.find(g => g.id === id)?.name).filter(Boolean).join(', '),
      'Materias': (s.subject_ids || []).map((id: string) => subjects.find(sub => sub.id === id)?.name).filter(Boolean).join(', '),
      'Promedio': s.average_grade?.toFixed(1) || '0.0'
    }));

    const worksheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Alumnos');
    
    writeFile(workbook, `Reporte_Alumnos_${new Date().toISOString().split('T')[0]}.xlsx`);
    notify('Reporte Excel generado', 'success');
  };

  if (loading) return <LoadingPulse message="Analizando Base de Datos de Cadetes" />;

  const handleClaimStudent = async (req: any) => {
    playSound.click();
    try {
      const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('matricula', req.matricula || 'NONE')
        .single();
      
      if (userProfile) {
        await supabase
          .from('profiles')
          .update({
            group_ids: [req.group_id],
            subject_ids: [req.subject_id],
            active: true
          })
          .eq('id', userProfile.id);
      }

      await supabase
        .from('requests')
        .update({ status: 'APPROVED', approved_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', req.id);
      
      notify('Solicitud procesada: Alumno vinculado exitosamente.', 'success');
      onRefreshRequests();
      fetchStudents();
    } catch (e) {
      errorService.handle(e, 'Claim Student');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {pendingRequests.length > 0 && (
         <section className="space-y-4">
            <div className="flex items-center gap-2 text-neon-purple">
               <ShieldAlert className="w-5 h-5 animate-pulse" />
               <h2 className="text-lg font-black italic uppercase">Solicitudes de Acceso Pendientes</h2>
            </div>
            <Card className="border-neon-purple/20 bg-neon-purple/5 backdrop-blur-xl">
               <Table>
                 <TableHeader>
                   <TableRow className="border-neon-purple/20">
                     <TableHead className="text-neon-purple text-[10px] uppercase font-black">Identidad</TableHead>
                     <TableHead className="text-neon-purple text-[10px] uppercase font-black">Materia / Grupo</TableHead>
                     <TableHead className="text-neon-purple text-[10px] uppercase font-black text-right">Acción</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {pendingRequests.map(req => (
                     <TableRow key={req.id} className="hover:bg-neon-purple/5 border-neon-purple/10">
                       <TableCell>
                          <div className="flex flex-col">
                             <span className="font-bold text-sm tracking-tight uppercase">{req.name} {req.lastName}</span>
                             <span className="text-[10px] font-mono opacity-60 uppercase">{req.matricula || 'Sin Matrícula'}</span>
                          </div>
                       </TableCell>
                       <TableCell>
                          <div className="flex flex-col text-[10px] items-start gap-1">
                             <Badge variant="outline" className="border-neon-blue/40 text-neon-blue bg-neon-blue/5 text-[8px]">{subjects.find(s => s.id === req.subjectId)?.name || 'Materia Desconocida'}</Badge>
                             <Badge variant="outline" className="border-neon-purple/40 text-neon-purple bg-neon-purple/5 text-[8px]">{groups.find(g => g.id === req.groupId)?.name || 'Grupo Desconocido'}</Badge>
                          </div>
                       </TableCell>
                       <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[9px] font-black border-emerald-500/50 hover:bg-emerald-500 hover:text-black"
                            onClick={() => handleClaimStudent(req)}
                          >
                             VINCULAR ALUMNO
                          </Button>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
            </Card>
         </section>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter">MIS ALUMNOS</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase opacity-70">Seguimiento de desempeño // Grupos Asignados</p>
        </div>
        <div className="w-full md:w-64">
           <Label className="text-[10px] font-black uppercase opacity-60 mb-1 block">Filtrar por Grupo</Label>
           <select 
             value={selectedGroupId} 
             onChange={e => setSelectedGroupId(e.target.value)}
             className="w-full bg-background border border-border h-10 px-3 rounded-md text-xs font-bold uppercase"
           >
             <option value="ALL">Todos mis alumnos</option>
             {groups.map(g => (
               <option key={g.id} value={g.id}>{g.name}</option>
             ))}
           </select>
        </div>
      </div>

      <div className="flex justify-between items-center bg-card/40 border border-border p-3 rounded-lg">
         <div className="flex items-center gap-2">
           <button 
             onClick={handleToggleSelectAll}
             className={`flex items-center justify-center w-5 h-5 rounded border transition-all ${
               selectedStudentIds.length > 0 && selectedStudentIds.length === filteredStudents.length
               ? 'bg-neon-blue border-neon-blue text-white shadow-[0_0_8px_rgba(0,255,255,0.3)]' 
               : 'border-white/20 hover:border-neon-blue/50'
             }`}
           >
             {selectedStudentIds.length > 0 && selectedStudentIds.length === filteredStudents.length && <CheckSquare className="w-4 h-4" />}
           </button>
           <span className="text-[10px] font-black uppercase opacity-60">Seleccionar Todo ({filteredStudents.length})</span>
         </div>
         {selectedStudentIds.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-7 text-[10px] font-bold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"><FileText className="w-3 h-3 mr-1" /> EXPORTAR EXCEL ({selectedStudentIds.length})</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkResetAlerts()} className="h-7 text-[10px] font-bold border-amber-500/30 text-amber-500 hover:bg-amber-500/10"><RefreshCw className="w-3 h-3 mr-1" /> REINICIAR ALERTAS ({selectedStudentIds.length})</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkBlockStudents(true)} className="h-7 text-[10px] font-bold border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10"><ShieldAlert className="w-3 h-3 mr-1" /> BLOQUEAR MASIVO ({selectedStudentIds.length})</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkBlockStudents(false)} className="h-7 text-[10px] font-bold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"><ShieldAlert className="w-3 h-3 mr-1" /> DESBLOQUEAR MASIVO ({selectedStudentIds.length})</Button>
              <Button variant="destructive" size="sm" onClick={handleBulkRemove} className="h-7 text-[10px] font-bold bg-red-500/80 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"><Trash2 className="w-3 h-3 mr-1" /> REMOVER SELECCIONADOS ({selectedStudentIds.length})</Button>
            </div>
         )}
      </div>

      {unassignedStudents.length > 0 && (
        <section className="space-y-4">
           <div className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
              <h2 className="text-lg font-black italic uppercase">Alumnos Sin Asignar Detectados</h2>
           </div>
           <Card className="border-red-500/20 bg-red-500/5 backdrop-blur-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-red-500/20">
                    <TableHead className="text-red-500 text-[10px] uppercase font-black">Identidad</TableHead>
                    <TableHead className="text-red-500 text-[10px] uppercase font-black">Correo</TableHead>
                    <TableHead className="text-red-500 text-[10px] uppercase font-black text-right">Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassignedStudents.map(s => (
                    <TableRow key={s.id} className="hover:bg-red-500/5 border-red-500/10">
                      <TableCell className="font-bold text-sm tracking-tight">{s.displayName}</TableCell>
                      <TableCell className="text-xs font-mono opacity-60 lowercase">{s.email}</TableCell>
                      <TableCell className="text-right">
                         <Badge variant="outline" className="bg-red-500/20 text-red-500 border-red-500/30 text-[9px]">EN ESPERA</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-3 bg-red-500/10 text-[9px] text-red-400 border-t border-red-500/20 uppercase font-mono italic">
                 Contacta al administrador para que estos alumnos sean asignados a tus grupos.
              </div>
           </Card>
        </section>
      )}

      <Card className="border-border bg-card/30 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/10">
              <TableHead className="w-[40px] px-4">
                 <div className="w-4" />
              </TableHead>
              <TableHead className="text-[10px] uppercase font-black">Alumno</TableHead>
              <TableHead className="text-[10px] uppercase font-black">Identificador</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-center">Avg. Gral</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-center text-neon-pink">Alertas</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-right">Estatus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map(s => (
              <TableRow key={s.id} className={`hover:bg-white/5 border-b border-border/20 transition-colors ${selectedStudentIds.includes(s.id) ? 'bg-neon-blue/5' : ''}`}>
                <TableCell className="px-4">
                  <button 
                    onClick={() => handleToggleSelectStudent(s.id)}
                    className={`flex items-center justify-center w-5 h-5 rounded border transition-all ${
                      selectedStudentIds.includes(s.id) 
                      ? 'bg-neon-blue border-neon-blue text-white shadow-[0_0_8px_rgba(0,255,255,0.3)]' 
                      : 'border-white/20 hover:border-neon-blue/50 bg-background/20'
                    }`}
                  >
                    {selectedStudentIds.includes(s.id) && <CheckSquare className="w-3 h-3" />}
                  </button>
                </TableCell>
                <TableCell>
                   <div className="flex flex-col">
                      <span className="font-bold text-sm">{s.displayName}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.groupIds?.map((gid: string) => (
                           <Badge key={gid} variant="outline" className="text-[8px] bg-neon-blue/5 border-neon-blue/20 text-neon-blue">
                             {groups.find(g => g.id === gid)?.name || 'N/A'}
                           </Badge>
                        ))}
                      </div>
                   </div>
                </TableCell>
                <TableCell className="font-mono text-[10px] uppercase opacity-70">
                   {s.matricula || s.id}
                </TableCell>
                <TableCell className="text-center font-black text-neon-blue">
                   {s.averageGrade?.toFixed(1) || '0.0'}
                </TableCell>
                <TableCell className="text-center">
                   <div className="flex flex-col items-center">
                      <span className={`text-xs font-black ${((s.tabViolations || 0) + (s.phoneViolations || 0)) > 0 ? 'text-neon-pink' : 'text-muted-foreground opacity-30'}`}>
                         {(s.tabViolations || 0) + (s.phoneViolations || 0)}
                      </span>
                      {s.isBlocked && (
                        <Badge variant="outline" className="text-[7px] border-neon-pink text-neon-pink bg-neon-pink/5 mt-0.5 px-1 py-0 shadow-[0_0_5px_rgba(255,0,255,0.2)]">BLOQUEADO</Badge>
                      )}
                   </div>
                </TableCell>
                <TableCell className="text-right">
                   <div className="flex items-center justify-end gap-1">
                      <div className={`w-2 h-2 rounded-full mr-2 ${s.lastSeenAt && (Date.now() - s.lastSeenAt < 5 * 60000) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted'}`} />
                      
                      {s.isBlocked ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10" title="Desbloquear Alumno" onClick={async () => {
                           if (confirm(`¿Desbloquear a ${s.displayName}?`)) {
                             await updateDoc(doc(db, 'users', s.id), { isBlocked: false, active: true, blockReason: null });
                             notify('Alumno desbloqueado.', 'success');
                           }
                        }}>
                           <ShieldAlert className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-neon-pink hover:bg-neon-pink/10" title="Bloquear Alumno" onClick={async () => {
                           if (confirm(`¿Bloquear a ${s.displayName} por violación de protocolos?`)) {
                             await updateDoc(doc(db, 'users', s.id), { isBlocked: true, blockReason: 'Bloqueo manual por el docente' });
                             notify('Alumno bloqueado.', 'error');
                           }
                        }}>
                           <ShieldAlert className="w-4 h-4 opacity-40 hover:opacity-100" />
                        </Button>
                      )}
                      
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500 hover:bg-amber-500/10" title="Reiniciar Alertas" onClick={async () => {
                         if (confirm(`¿Reiniciar contadores de alerta de ${s.displayName}?`)) {
                            await updateDoc(doc(db, 'users', s.id), { tabViolations: 0, phoneViolations: 0 });
                            notify('Contadores reiniciados.', 'success');
                         }
                      }}>
                         <RefreshCw className="w-4 h-4" />
                      </Button>

                      <Button variant="ghost" size="icon" className="h-8 w-8 text-neon-blue hover:bg-neon-blue/10" onClick={() => { setEditingStudent(s); playSound.click(); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteStudent(s)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                   </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredStudents.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic text-sm">
                   No se encontraron alumnos en este criterio.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {hasMoreStudents && (
          <div className="p-4 border-t border-white/5 flex justify-center">
            <Button 
              variant="ghost" 
              onClick={() => fetchStudents(true)} 
              disabled={loadingMoreStudents}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-neon-blue"
            >
              {loadingMoreStudents ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
              {loadingMoreStudents ? 'Escaneando...' : 'Cargar Más Alumnos'}
            </Button>
          </div>
        )}
      </Card>

      {/* Edit Student Dialog */}
      <Dialog open={!!editingStudent} onOpenChange={() => setEditingStudent(null)}>
        <DialogContent className="border-border bg-card/95 backdrop-blur-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-neon-blue">
               Modificar Perfil de Alumno
            </DialogTitle>
            <DialogDescription className="text-xs uppercase font-mono opacity-50">Ajuste de parámetros y accesos académicos</DialogDescription>
          </DialogHeader>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            setIsUpdating(true);
            const formData = new FormData(e.currentTarget);
            const name = formData.get('displayName') as string;
            const matricula = formData.get('matricula') as string;
            const groupIds = Array.from(formData.getAll('groupIds')) as string[];
            const subjectIds = Array.from(formData.getAll('subjectIds')) as string[];
            
            try {
              await updateDoc(doc(db, 'users', editingStudent.id), {
                displayName: name,
                matricula: matricula,
                groupIds,
                subjectIds,
                updatedAt: Date.now()
              });
              notify('Perfil de alumno actualizado correctamente.', 'success');
              setEditingStudent(null);
              playSound.success();
            } catch (err) {
              errorService.handle(err, 'Update Student Profile');
            } finally {
              setIsUpdating(false);
            }
          }} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Nombre Completo / Identidad</Label>
              <Input name="displayName" defaultValue={editingStudent?.displayName} className="bg-secondary/30 h-10" required />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Matrícula / ID de Acceso</Label>
              <Input name="matricula" defaultValue={editingStudent?.matricula} className="bg-secondary/30 h-10 font-mono" placeholder="NO ASIGNADA" />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold">Grupo Asignado</Label>
                  <select 
                    name="groupIds" 
                    defaultValue={editingStudent?.groupIds?.[0] || ''} 
                    className="w-full bg-secondary/30 border border-white/5 h-10 px-3 rounded-md text-xs font-bold uppercase"
                  >
                     <option value="">Ninguno</option>
                     {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold">Materia Principal</Label>
                  <select 
                    name="subjectIds" 
                    defaultValue={editingStudent?.subjectIds?.[0] || ''} 
                    className="w-full bg-secondary/30 border border-white/5 h-10 px-3 rounded-md text-xs font-bold uppercase"
                  >
                     <option value="">Ninguno</option>
                     {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
               </div>
            </div>
            
            <DialogFooter className="pt-4">
               <Button type="button" variant="ghost" onClick={() => setEditingStudent(null)} className="text-[10px] font-black uppercase italic">Cancelar</Button>
               <Button type="submit" disabled={isUpdating} className="bg-neon-blue text-black font-black uppercase italic text-[10px] px-8 h-10">
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Cambios'}
               </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardView({ pendingRequests }: { pendingRequests: any[] }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalAssigned: 0,
    onlineCount: 0,
    absentCount: 0,
    atRiskCount: 0,
    pendingRequestsCount: 0,
    topStudents: [] as any[],
    activeSessions: [] as any[],
    subjectStats: [] as any[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    // DASHBOARD DATA LOGIC
    // 1. Get my students (One-time fetch or limited listener)
    // To minimize reads, we don't listen to ALL users.
    // Instead, we fetch the groups/subjects the teacher manages and then fetch users.
    
    const fetchDashboardStats = async () => {
      try {
        const teacherDocSnap = await getDocFromServer(doc(db, 'users', user.uid));
        const teacherData = teacherDocSnap.data() || {};
        const teacherGroupIds = teacherData.groupIds || [];
        const teacherSubjectIds = teacherData.subjectIds || [];

        // Fetch students related to my groups
        let myStudents: any[] = [];
        if (teacherGroupIds.length > 0) {
          const qGroups = query(collection(db, 'users'), where('groupIds', 'array-contains-any', teacherGroupIds), limit(500));
          const snapGroups = await getDocs(qGroups);
          myStudents = snapGroups.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const quizzesSnap = await getDocs(query(collection(db, 'quizzes'), where('teacherId', '==', user.uid), limit(100)));
        const allQuizzes = quizzesSnap.docs.map(d => d.data());
        
        const now = Date.now();
        const onlineCount = myStudents.filter(s => s.lastSeenAt && (now - s.lastSeenAt < 5 * 60 * 1000)).length;
        const absentCount = myStudents.filter(s => !s.lastSeenAt || (now - s.lastSeenAt > 24 * 60 * 60 * 1000)).length;
        const atRiskCount = myStudents.filter(s => (s.averageGrade !== undefined && s.averageGrade < 6)).length;
        const topStudents = [...myStudents].sort((a,b) => (b.averageGrade || 0) - (a.averageGrade || 0)).slice(0, 5);

        const subjectMap: Record<string, any> = {};
        allQuizzes.forEach(q => {
          const sId = q.subjectId || 'default';
          if (!subjectMap[sId]) {
            subjectMap[sId] = { name: q.subjectName || 'Materia', quizCount: 0, avg: 0 };
          }
          subjectMap[sId].quizCount++;
        });

        setStats(prev => ({
          ...prev,
          totalAssigned: myStudents.length,
          onlineCount,
          absentCount,
          atRiskCount,
          pendingRequestsCount: pendingRequests.length,
          topStudents,
          subjectStats: Object.values(subjectMap)
        }));
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'dashboard_stats');
      }
    };

    fetchDashboardStats();

    const unsubSessions = onSnapshot(query(collection(db, 'sessions'), where('teacherId', '==', user.uid), where('status', '!=', 'COMPLETED'), limit(20)), (snap) => {
      setStats(prev => ({ ...prev, activeSessions: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'sessions');
    });

    return () => {
      unsubSessions();
    };
  }, [user?.uid, pendingRequests.length]);

  if (loading) return <LoadingPulse message="Sincronizando Telemetría Docente" />;

  return <DashboardOverview stats={stats} user={user} setTab={(t) => navigate(`/teacher/${t}`)} pendingRequests={pendingRequests} />;
}

function TelemetryViewContainer({ globalConfig }: { globalConfig: any }) {
  const { user } = useAuthStore();
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchTelemetry = async () => {
      try {
        const teacherDocSnap = await getDocFromServer(doc(db, 'users', user.uid));
        const teacherData = teacherDocSnap.data() || {};
        const teacherGroupIds = teacherData.groupIds || [];

        let myStudents: any[] = [];
        if (teacherGroupIds.length > 0) {
          const q = query(collection(db, 'users'), where('groupIds', 'array-contains-any', teacherGroupIds), limit(500));
          const snap = await getDocs(q);
          myStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        setBlockedUsers(myStudents.filter(s => s.isBlocked));

        const now = Date.now();
        setTelemetry(myStudents.map(s => ({
          id: s.id,
          name: s.displayName,
          lastAction: s.lastAction || 'Explorando plataforma',
          lastActionTime: s.lastSeenAt || Date.now(),
          progress: s.lastProgress || 0,
          tabViolations: s.tabViolations || 0,
          phoneViolations: s.phoneViolations || 0,
          status: (s.lastSeenAt && (now - s.lastSeenAt < 5 * 60 * 1000)) ? 'online' : 'offline'
        })));
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'telemetry_users');
      }
    };

    fetchTelemetry();

    const unsubViolations = onSnapshot(
      query(collection(db, 'violations'), orderBy('timestamp', 'desc'), limit(50)), 
      (snap) => {
        setViolations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'violations')
    );

    return () => {
      unsubViolations();
    };
  }, [user?.uid]);

  if (loading) return <LoadingPulse message="Sincronizando Flujos de Telemetría" />;

  return <TelemetryView telemetry={telemetry} violations={violations} blockedUsers={blockedUsers} globalConfig={globalConfig} />;
}

function DashboardOverview({ stats, user, setTab, pendingRequests }: { stats: any, user: any, setTab: (t: string) => void, pendingRequests: any[] }) {
  // Use existing dashboard UI logic here
  return (
    <div className="space-y-8">
      {pendingRequests.length > 0 && (
         <motion.div 
           initial={{ opacity: 0, y: -20 }}
           animate={{ opacity: 1, y: 0 }}
           className="p-4 rounded-xl border border-neon-purple bg-neon-purple/5 shadow-[0_0_20px_rgba(188,19,254,0.1)] flex flex-col md:flex-row items-center justify-between gap-4"
         >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-neon-purple/20 flex items-center justify-center">
                 <ShieldAlert className="w-6 h-6 text-neon-purple animate-pulse" />
              </div>
              <div>
                 <h4 className="font-bold text-sm text-neon-purple uppercase">Acceso Pendiente Detectado</h4>
                 <p className="text-[10px] opacity-60 font-mono tracking-widest">HAY {pendingRequests.length} ALUMNOS SOLICITANDO UNIRSE A TUS GRUPOS</p>
              </div>
            </div>
            <Button onClick={() => setTab('students')} className="bg-neon-purple text-white hover:bg-neon-purple/80 font-black italic h-8 text-[10px]">
               GESTIONAR SOLICITUDES
            </Button>
         </motion.div>
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter">OPERACIONES</h1>
          <p className="text-muted-foreground uppercase tracking-widest text-[10px] font-mono mt-1">Conexión Segura // Estado: Online</p>
        </div>
        <div className="flex gap-2">
           <Badge variant="outline" className="border-emerald-500/50 text-emerald-500 bg-emerald-500/5 px-3 py-1">
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
             {stats.onlineCount} LIVE
           </Badge>
           <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/5 px-3 py-1 font-mono text-[9px]">
             {stats.absentCount} INACTIVOS
           </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Alumnos Asignados" value={stats.totalAssigned.toString()} icon={Users} />
        <StatCard title="Promedio Grupal" value="8.2" icon={Star} info="Meta: 9.0" />
        <StatCard title="Misiones Activas" value={stats.activeSessions.length.toString()} icon={Rocket} highlight={stats.activeSessions.length > 0} />
        <StatCard title="Alumnos en Riesgo" value={stats.atRiskCount.toString()} icon={ShieldAlert} highlight={stats.atRiskCount > 0} info="Promedio < 6.0" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/50 bg-card/30 backdrop-blur-xl group overflow-hidden">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-neon-blue" /> Desempeño por Materia
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[400px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-[9px] uppercase font-bold text-muted-foreground">Materia</TableHead>
                  <TableHead className="text-center text-[9px] uppercase font-bold text-muted-foreground">Pruebas</TableHead>
                  <TableHead className="text-[9px] uppercase font-bold text-muted-foreground">Asignados</TableHead>
                  <TableHead className="text-right text-[9px] uppercase font-bold text-muted-foreground">Avg. Gral.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.subjectStats.map((s: any, i: number) => (
                  <TableRow key={i} className="border-b border-border/30 hover:bg-white/5">
                    <TableCell className="font-medium text-sm">{s.name}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{s.quizCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground text-center">{stats.totalAssigned}</TableCell>
                    <TableCell className="text-right font-black text-emerald-400">8.5</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-border/50 bg-card/30 backdrop-blur-xl group overflow-hidden">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-yellow-500">
              <Trophy className="w-4 h-4" /> Cuadro de Honor
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 overflow-y-auto max-h-[400px] custom-scrollbar">
            <div className="space-y-4">
              {stats.topStudents.map((s: any, i: number) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-neon-blue/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${
                      i === 0 ? 'bg-yellow-500 text-black' : 
                      i === 1 ? 'bg-slate-300 text-black' : 
                      i === 2 ? 'bg-orange-400 text-black' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold group-hover:text-neon-blue transition-colors truncate max-w-[120px]">{s.displayName}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{s.matricula || s.id.slice(-6)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-400">{s.averageGrade?.toFixed(1) || '0.0'}</p>
                    <p className="text-[8px] uppercase font-bold text-muted-foreground">Promedio</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card className="border-border/50 bg-card/30 backdrop-blur-xl shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 font-black italic">
            <Rocket className="w-5 h-5 text-neon-blue" /> SESIONES EN CURSO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.activeSessions.map((s: any) => (
                <div key={s.id} className="p-4 rounded-xl border border-border/50 bg-white/5 hover:border-neon-blue transition-all group flex flex-col justify-between h-40">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                       <h4 className="font-bold text-sm group-hover:text-neon-blue transition-colors line-clamp-1">{s.quizTitle}</h4>
                       <Badge variant="outline" className="text-[8px] border-neon-blue/20">{s.type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span className="px-2 py-0.5 bg-secondary rounded text-neon-blue">{s.joinCode}</span>
                      <span>•</span>
                      <span>{new Date(s.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex flex-row md:flex-col items-center md:items-start gap-2 md:gap-0">
                      <span className="text-[9px] uppercase font-bold text-muted-foreground">Estatus Matrix</span>
                      <span className="text-xs font-black text-neon-blue italic">{s.status === 'WAITING' ? 'EN LOBBY' : 'DESPEGANDO'}</span>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] font-black border-neon-blue/40 hover:bg-neon-blue hover:text-black" onClick={() => (window.location.href = `/teacher/sessions/${s.id}/control`)}>
                      INGRESAR
                    </Button>
                  </div>
                </div>
              ))}
              {stats.activeSessions.length === 0 && (
                <div className="col-span-full py-12 text-center bg-secondary/10 rounded-xl border border-dashed border-border">
                    <p className="text-sm text-muted-foreground italic">No hay misiones activas en el espacio.</p>
                    <Button variant="ghost" size="sm" className="mt-2 text-neon-blue" onClick={() => setTab('missions')}>Iniciar Nueva Misión</Button>
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TelemetryView({ telemetry, violations, blockedUsers, globalConfig }: { telemetry: any[], violations: any[], blockedUsers: any[], globalConfig: any }) {
  const [activeTab, setActiveTab] = useState<'ACTIVITY' | 'VIOLATIONS' | 'BLOCKED'>('ACTIVITY');

  const updateConfig = async (val: number) => {
    await updateDoc(doc(db, 'config', 'global'), { maxProtocolViolations: val });
    notify('Límite de violaciones actualizado', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-4 border-b border-white/5 pb-4">
          {[
            { id: 'ACTIVITY', label: 'Monitor de Actividad', icon: Activity },
            { id: 'VIOLATIONS', label: 'Alertas de Seguridad', icon: ShieldAlert },
            { id: 'BLOCKED', label: 'Usuarios Bloqueados', icon: X },
          ].map(tab => (
            <Button 
              key={tab.id}
              variant="ghost" 
              onClick={() => setActiveTab(tab.id as any)}
              className={`text-xs font-black italic gap-2 ${activeTab === tab.id ? 'bg-secondary text-neon-blue' : 'opacity-40'}`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
              {tab.id === 'VIOLATIONS' && violations.length > 0 && <Badge className="bg-red-500 text-white ml-2 h-4 px-1 min-w-4 text-[8px] animate-pulse">{violations.length}</Badge>}
              {tab.id === 'BLOCKED' && blockedUsers.length > 0 && <Badge className="bg-orange-500 text-white ml-2 h-4 px-1 min-w-4 text-[8px]">{blockedUsers.length}</Badge>}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-md">
           <Label className="text-[10px] font-black uppercase text-neon-pink opacity-80">Umbral de Bloqueo:</Label>
           <Input 
             type="number"
             min="1"
             max="10"
             value={globalConfig?.maxProtocolViolations || 3}
             onChange={(e) => updateConfig(parseInt(e.target.value))}
             className="w-16 h-8 bg-background/50 border-neon-pink/20 text-center font-black italic text-neon-pink"
           />
           <ShieldAlert className="w-4 h-4 text-neon-pink opacity-50" />
        </div>
      </div>

      {activeTab === 'ACTIVITY' && (
        <Card className="border-border/50 bg-card/30 backdrop-blur-xl">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-lg font-black italic flex items-center gap-2">
              <Activity className="w-5 h-5 text-neon-blue" /> LOG DE ACTIVIDAD EN TIEMPO REAL
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase">Usuario</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Última Acción Detectada</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Alertas</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Tiempo Total</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Último Acceso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {telemetry.map(t => (
                  <TableRow key={t.id} className="hover:bg-white/5 border-b border-border/20">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${t.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted'}`}></div>
                        <span className="font-bold text-sm">{t.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground italic font-mono">
                      {t.lastAction}
                    </TableCell>
                    <TableCell className="text-center">
                       <div className="flex justify-center gap-2">
                          {t.tabViolations > 0 && <Badge variant="outline" className="border-red-500/50 text-red-500 text-[8px]">TAB: {t.tabViolations}</Badge>}
                          {t.phoneViolations > 0 && <Badge variant="outline" className="border-orange-500/50 text-orange-400 text-[8px]">PHO: {t.phoneViolations}</Badge>}
                          {t.tabViolations === 0 && t.phoneViolations === 0 && <span className="text-[8px] opacity-30 uppercase">Limpio</span>}
                       </div>
                    </TableCell>
                    <TableCell className="text-center">
                       <span className="text-xs font-mono font-bold text-neon-blue">
                         {t.timeSpent ? `${Math.floor(t.timeSpent / 60)}h ${t.timeSpent % 60}m` : '0m'}
                       </span>
                    </TableCell>
                    <TableCell className="text-right text-[10px] font-mono opacity-60">
                       {new Date(t.lastActionTime).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'VIOLATIONS' && (
        <Card className="border-red-500/30 bg-red-500/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-black italic flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-5 h-5 animate-pulse" /> HISTORIAL DE VIOLACIONES DE PROTOCOLO
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="border-none">
                <TableHead className="text-[10px] font-black uppercase">Fecha/Hora</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Alumno</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Tipo</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Evaluación / Misión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {violations.map(v => (
                <TableRow key={v.id} className="border-red-500/10">
                  <TableCell className="text-[10px] font-mono opacity-60">{new Date(v.timestamp).toLocaleString()}</TableCell>
                  <TableCell className="font-bold text-sm">{v.userName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-red-500/20 text-red-500 border-red-500/30 text-[8px]">
                      {v.type === 'tab' ? 'CAMBIO DE PESTAÑA' : 'PÉRDIDA DE FOCO'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs italic opacity-70">{v.quizTitle}</TableCell>
                </TableRow>
              ))}
              {violations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center opacity-40 italic">No se han detectado violaciones recientemente.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === 'BLOCKED' && (
        <Card className="border-orange-500/30 bg-orange-500/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-black italic flex items-center gap-2 text-orange-500">
              <X className="w-5 h-5" /> ALUMNOS BLOQUEADOS POR EL SISTEMA
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="border-none">
                <TableHead className="text-[10px] font-black uppercase">Alumno</TableHead>
                <TableHead className="text-[10px] font-black uppercase">ID / Correo</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Motivo del Bloqueo</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blockedUsers.map(u => (
                <TableRow key={u.id} className="border-orange-500/10">
                  <TableCell className="font-bold text-sm tracking-tight">{u.displayName}</TableCell>
                  <TableCell className="text-[10px] font-mono opacity-50">{u.email || u.id}</TableCell>
                  <TableCell className="text-xs italic text-orange-400">{u.blockReason || 'Violaciones acumuladas (Anti-Cheat)'}</TableCell>
                  <TableCell className="text-right">
                     <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-7 text-[9px] border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 font-bold"
                       onClick={async () => {
                         if (confirm(`¿Desbloquear a ${u.displayName}? Se reiniciarán sus contadores de alerta.`)) {
                           await updateDoc(doc(db, 'users', u.id), {
                             isBlocked: false,
                             active: true,
                             tabViolations: 0,
                             phoneViolations: 0,
                             blockReason: null
                           });
                           notify('Alumno desbloqueado correctamente.', 'success');
                         }
                       }}
                     >
                        LEVANTAR BLOQUEO
                     </Button>
                  </TableCell>
                </TableRow>
              ))}
              {blockedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center opacity-40 italic">Cielo despejado. No hay alumnos bloqueados.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SurveysView() {
  const [designing, setDesigning] = useState(false);
  const { user } = useAuthStore();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [newSurvey, setNewSurvey] = useState<any>({
    title: '',
    quizId: '',
    questions: [{ id: '1', text: '', type: 'LIKERT' }]
  });

  useEffect(() => {
    if (!user) return;
    const qSub = query(collection(db, 'quizzes'), where('teacherId', '==', user.uid));
    const unsubQuizzes = onSnapshot(qSub, (snap) => {
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const sSub = query(collection(db, 'surveys'), where('teacherId', '==', user.uid));
    const unsubSurveys = onSnapshot(sSub, (snap) => {
      setSurveys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubQuizzes();
      unsubSurveys();
    };
  }, [user]);

  const addQuestion = () => {
    setNewSurvey((prev: any) => ({
      ...prev,
      questions: [...prev.questions, { id: Math.random().toString(36).substr(2, 9), text: '', type: 'LIKERT' }]
    }));
  };

  const removeQuestion = (id: string) => {
    setNewSurvey((prev: any) => ({
      ...prev,
      questions: prev.questions.filter((q: any) => q.id !== id)
    }));
  };

  const updateQuestion = (id: string, field: string, value: string) => {
    setNewSurvey((prev: any) => ({
      ...prev,
      questions: prev.questions.map((q: any) => q.id === id ? { ...q, [field]: value } : q)
    }));
  };

  const handlePublish = async () => {
    if (!newSurvey.title || !newSurvey.quizId || newSurvey.questions.some((q: any) => !q.text)) {
      alert('Completa todos los campos obligatorios.');
      return;
    }

    try {
      await addDoc(collection(db, 'surveys'), {
        ...newSurvey,
        teacherId: user?.uid,
        active: true,
        createdAt: Date.now()
      });
      setDesigning(false);
      setNewSurvey({ title: '', quizId: '', questions: [{ id: '1', text: '', type: 'LIKERT' }] });
    } catch (error) {
      console.error(error);
      alert('Error al publicar encuesta');
    }
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <h2 className="text-3xl font-black italic">SISTEMA DE FEEDBACK</h2>
          {!designing && <Button onClick={() => setDesigning(true)} className="bg-neon-purple text-white font-black italic text-xs">DISEÑAR NUEVA ENCUESTA</Button>}
       </div>

       {designing ? (
          <Card className="border-neon-purple/50 bg-neon-purple/5 backdrop-blur-xl p-8">
             <div className="flex justify-between mb-6">
                <h3 className="text-xl font-bold italic text-neon-purple">DISEÑADOR DE REACTIVOS</h3>
                <Button variant="ghost" size="icon" onClick={() => setDesigning(false)}><X className="w-4 h-4" /></Button>
             </div>
             
             <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                   <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase opacity-60">Título de la Encuesta</Label>
                     <Input 
                       value={newSurvey.title}
                       onChange={e => setNewSurvey({ ...newSurvey, title: e.target.value })}
                       placeholder="Ej. Evaluación de Dificultad" 
                       className="bg-background/50 border-neon-purple/30" 
                     />
                   </div>
                   <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase opacity-60">Vincular a Prueba / Misión</Label>
                     <select 
                       value={newSurvey.quizId}
                       onChange={e => setNewSurvey({ ...newSurvey, quizId: e.target.value })}
                       className="flex h-10 w-full rounded-md border border-neon-purple/30 bg-background/50 px-3 py-2 text-sm focus:ring-1 focus:ring-neon-purple"
                     >
                       <option value="">Seleccionar Misión...</option>
                       {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                     </select>
                   </div>
                   <Button onClick={handlePublish} className="w-full bg-neon-purple h-12 font-black italic shadow-[0_0_20px_rgba(168,85,247,0.3)]">PUBLICAR ENCUESTA</Button>
                </div>

                <div className="lg:col-span-2 space-y-4 max-h-[500px] overflow-y-auto pr-2">
                   <div className="flex justify-between items-center mb-2">
                      <Label className="text-[10px] font-black uppercase opacity-60">Preguntas de Feedback</Label>
                      <Button variant="outline" size="sm" onClick={addQuestion} className="h-7 text-[10px] border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10">
                        <Plus className="w-3 h-3 mr-1" /> AÑADIR PREGUNTA
                      </Button>
                   </div>
                   
                   {newSurvey.questions.map((q: any, idx: number) => (
                      <div key={q.id} className="p-4 bg-black/40 rounded-xl border border-border/50 space-y-3 relative group">
                         <div className="flex gap-3">
                            <div className="flex-1 space-y-2">
                               <Input 
                                 value={q.text}
                                 onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                                 placeholder={`Pregunta #${idx + 1}`} 
                                 className="bg-transparent border-none p-0 h-auto text-sm font-bold focus-visible:ring-0" 
                               />
                               <select 
                                 value={q.type}
                                 onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                                 className="bg-secondary/50 text-[10px] uppercase font-black px-2 py-1 rounded-md border-none outline-none"
                               >
                                  <option value="LIKERT">Escala Likert (1-5)</option>
                                  <option value="TEXT">Pregunta Abierta</option>
                                  <option value="YES_NO">Sí / No</option>
                                </select>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)} className="opacity-0 group-hover:opacity-100 text-destructive">
                               <Trash2 className="w-4 h-4" />
                            </Button>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </Card>
       ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {surveys.map(s => (
               <Card key={s.id} className="border-border/50 bg-card/30 backdrop-blur-xl p-6 group hover:border-neon-purple/30 transition-all">
                  <div className="flex justify-between items-start mb-4">
                     <div className="w-10 h-10 rounded-lg bg-neon-purple/10 flex items-center justify-center text-neon-purple text-xl">
                        <PieChart className="w-5 h-5" />
                     </div>
                     <Badge variant="outline" className="text-[8px] uppercase tracking-tighter border-neon-purple/30 text-neon-purple">ACTIVA</Badge>
                  </div>
                  <h3 className="font-bold text-sm tracking-tight mb-1">{s.title}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase mb-4">{quizzes.find(q => q.id === s.quizId)?.title || 'Misión no encontrada'}</p>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-border/20">
                     <span className="text-[10px] font-mono opacity-50">{s.questions.length} Reactivos</span>
                     <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black italic hover:text-neon-purple">VER RESULTADOS</Button>
                  </div>
               </Card>
            ))}
            {surveys.length === 0 && (
              <Card className="border-dashed border-border/50 bg-card/10 backdrop-blur-xl p-8 flex flex-col items-center justify-center text-center space-y-4 col-span-full">
                 <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center opacity-40">
                   <PieChart className="w-8 h-8" />
                 </div>
                 <div>
                   <p className="text-sm font-bold uppercase">No hay encuestas activas</p>
                   <p className="text-xs text-muted-foreground mt-1">Crea una encuesta de feedback para mejorar la experiencia de tus alumnos.</p>
                 </div>
              </Card>
            )}
          </div>
       )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, info, highlight = false }: { title: string, value: string, icon: any, info?: string, highlight?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border transition-all neo-glow-blue border-t-2 border-neon-blue bg-card/40 backdrop-blur-md`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">{title}</h3>
        <div className="p-2 bg-neon-blue/10 rounded-lg">
          <Icon className={`w-4 h-4 text-neon-blue`} />
        </div>
      </div>
      <p className={`text-4xl font-black italic text-neon-blue`}>{value}</p>
      {info && <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase tracking-widest">{info}</p>}
    </div>
  );
}


function NavItem({ to, icon: Icon, label, active, onClick }: { to: string, icon: any, label: string, active?: boolean, onClick?: () => void, key?: string }) {
  return (
    <Link 
      to={to} 
      onClick={() => {
        playSound.click();
        if (onClick) onClick();
      }} 
      className={`flex items-center px-4 py-3 rounded-lg transition-colors text-sm font-medium ${active ? 'bg-secondary text-foreground' : 'hover:bg-secondary/50 text-muted-foreground'}`}
    >
      <Icon className="mr-3 h-5 w-5" />
      {label}
    </Link>
  );
}

function MissionsPanel({ onPreview }: { onPreview: (type: string) => void }) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [missions, setMissions] = useState<any[]>([]);
  const [lastMissionDoc, setLastMissionDoc] = useState<any>(null);
  const [hasMoreMissions, setHasMoreMissions] = useState(true);
  const [loadingMoreMissions, setLoadingMoreMissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newMission, setNewMission] = useState({ 
    title: '', 
    type: 'CLASICO',
    availableFrom: '',
    availableTo: ''
  });
  const { user } = useAuthStore();
  const { subjects, groups } = useSubjectsGroupsStore();
  const [subjectId, setSubjectId] = useState('');
  const [groupId, setGroupId] = useState('');

  const [showQuickTest, setShowQuickTest] = useState(false);

  const fetchMissions = async (isNextPage = false) => {
    if (!user) return;
    try {
      if (isNextPage) setLoadingMoreMissions(true);
      else setLoading(true);

      const q = isNextPage && lastMissionDoc
        ? query(collection(db, 'quizzes'), where('teacherId', '==', user.uid), orderBy('createdAt', 'desc'), startAfter(lastMissionDoc), limit(20))
        : query(collection(db, 'quizzes'), where('teacherId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));

      const snap = await getDocs(q);
      const data: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (isNextPage) {
        setMissions(prev => [...prev, ...data]);
      } else {
        setMissions(data);
      }

      setLastMissionDoc(snap.docs[snap.docs.length - 1]);
      setHasMoreMissions(snap.docs.length === 20);
      setLoading(false);
      setLoadingMoreMissions(false);
    } catch (err) {
      console.error('Fetch Missions Error:', err);
      setLoading(false);
      setLoadingMoreMissions(false);
    }
  };

  useEffect(() => {
    fetchMissions();
  }, [user]);

  const handleCreate = async () => {
    if (newMission.title.trim() === '') {
      notify('Debes ingresar un título para la misión.', 'warning');
      return;
    }
    if (!user) return;

    try {
      const { collection, addDoc } = await import('firebase/firestore');

      const docRef = await addDoc(collection(db, 'quizzes'), {
        title: newMission.title,
        type: newMission.type,
        teacherId: user.uid,
        subjectId: subjectId || null,
        subjectName: subjects.find(s => s.id === subjectId)?.name || null,
        groupId: groupId || null,
        assignedUserIds: [],
        maxEntriesPerStudent: 1,
        maxCompletionsPerStudent: 1,
        chancesPerQuestion: 1,
        evaluationType: 'HIGHEST',
        isOpen: false,
        isPublic: false,
        status: 'DRAFT',
        questionsCount: 0,
        createdAt: Date.now(),
        availableFrom: newMission.availableFrom ? new Date(newMission.availableFrom).getTime() : null,
        availableTo: newMission.availableTo ? new Date(newMission.availableTo).getTime() : null,
      });

      setNewMission({ 
        title: '', 
        type: 'CLASICO',
        availableFrom: '',
        availableTo: ''
      });
      setIsCreating(false);
      navigate(`/teacher/missions/${docRef.id}/builder`);
    } catch (error) {
      errorService.handle(error, 'Create Mission');
    }
  };

  const handleLaunchLive = async (mission: any) => {
    try {
      const { db } = await import('../lib/firebase');
      const { collection, addDoc } = await import('firebase/firestore');
      
      const joinCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      
      const sessionRef = await addDoc(collection(db, 'sessions'), {
        quizId: mission.id,
        quizTitle: mission.title,
        teacherId: user?.uid,
        status: 'LOBBY',
        type: mission.type,
        joinCode: joinCode,
        currentQuestionIndex: -1, // -1 means lobby
        createdAt: Date.now(),
        // For Teams mode we might need specific version config
        config: {
          isClassroom: mission.type === 'POR_EQUIPOS', // default to classroom if it's teams for now
          minPlayers: 6,
          maxPlayers: 10
        }
      });
      
      navigate(`/teacher/sessions/${sessionRef.id}/control`);
    } catch (error) {
      console.error(error);
      alert('Error al iniciar sesión en vivo');
    }
  };

  const handleDeleteMission = async (id: string, title: string) => {
    if (!confirm(`¿Estás seguro de eliminar la misión "${title}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { db } = await import('../lib/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'quizzes', id));
      alert('Misión eliminada correctamente.');
    } catch (e) {
      console.error(e);
      alert('Error al eliminar la misión.');
    }
  };

  if (isCreating) {
    return (
      <div className="animate-in zoom-in-95 duration-300 max-w-2xl mx-auto py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)} className="rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-neon-blue">NUEVA MISIÓN</h1>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Iniciando diseño de sistema evaluativo...</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <Card className="border-neon-blue/30 bg-card/40 backdrop-blur-xl shadow-[0_0_30px_rgba(0,243,255,0.05)] overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-neon-blue/5">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Target className="w-4 h-4 text-neon-blue" /> Parametrización Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Identificador de la Misión (Título)</Label>
                <Input 
                  className="bg-background/50 border-border/50 text-lg font-bold"
                  placeholder="Ej. UNIDAD 1: LA CÉLULA"
                  value={newMission.title}
                  onChange={e => setNewMission({ ...newMission, title: e.target.value })}
                />
              </div>
              
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
                        Motor de Ejecución (Modo)
                        <ModeInfoButton type={newMission.type} onClick={onPreview} />
                      </Label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:ring-2 focus:ring-neon-blue font-bold"
                        value={newMission.type}
                        onChange={e => setNewMission({ ...newMission, type: e.target.value })}
                      >
                        <option value="CLASICO">📊 MODO CLÁSICO</option>
                        <option value="POR_EQUIPOS">⚔️ DUELO DE ESCUADRONES</option>
                        <option value="A_LA_CIMA">🏔️ A LA CIMA (COMPETITIVO)</option>
                        <option value="LA_TORRE">🏗️ EL JUEGO DE LA TORRE</option>
                        <option value="IDENTIFICACION">🔍 IDENTIFICACIÓN DE COMPONENTES</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Asignación de Grupo (Segmentación)</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:ring-2 focus:ring-neon-blue"
                    value={groupId} 
                    onChange={e => setGroupId(e.target.value)}
                  >
                    <option value="">TODOS LOS ALUMNOS</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-white/5">
                <Button variant="ghost" onClick={() => setIsCreating(false)} className="text-xs font-bold uppercase">Abortar</Button>
                <Button 
                  onClick={handleCreate} 
                  className="bg-neon-blue text-black font-black uppercase italic px-10 hover:shadow-[0_0_20px_rgba(0,243,255,0.5)]"
                >
                  DESPLEGAR MISIÓN
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 rounded-xl bg-neon-purple/5 border border-neon-purple/20 flex gap-4 items-start">
             <div className="w-10 h-10 rounded-full bg-neon-purple/20 flex items-center justify-center shrink-0">
               <BrainCircuit className="w-5 h-5 text-neon-purple" />
             </div>
             <div>
               <p className="text-xs font-bold text-neon-purple uppercase italic">Iniciación Rápida</p>
               <p className="text-[10px] text-muted-foreground">Al desplegar, ingresarás al Hangar de Diseño (Builder) donde podrás cargar preguntas manualmente o utilizar la Inteligencia Artificial para generar reactivos en segundos.</p>
             </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingPulse message="Sincronizando Hangar de Misiones" />;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter text-foreground">HANGAR DE MISIONES</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase opacity-70">Sistemas de evaluación // Banco de Pruebas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowQuickTest(true)} variant="outline" className="border-neon-purple text-neon-purple font-black italic hover:bg-neon-purple/10">
            <Sparkles className="w-4 h-4 mr-2" /> MISIÓN RÁPIDA (TEST)
          </Button>
          <Button onClick={() => setIsCreating(true)} className="bg-neon-blue text-black font-black italic shadow-[0_0_15px_rgba(0,243,255,0.3)]">
            <Plus className="w-4 h-4 mr-2" /> CREAR NUEVA MISIÓN
          </Button>
        </div>
      </div>

      {/* Quick Test Mission Dialog */}
      <QuickTestDialog 
        isOpen={showQuickTest} 
        onClose={() => setShowQuickTest(false)} 
        onCreated={() => fetchMissions()}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {missions.map(mission => (
          <div 
            key={mission.id} 
            className="p-1 rounded-2xl bg-gradient-to-br from-border/50 to-transparent hover:from-neon-blue/20 transition-all duration-300 group"
          >
            <div className="p-6 rounded-[calc(1rem-1px)] bg-card border border-border/10 h-full flex flex-col justify-between group-hover:bg-card/80 transition-colors">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className="bg-secondary/50 text-[9px] uppercase font-bold text-muted-foreground border-none px-2">
                    {mission.type}
                  </Badge>
                  <div className={`w-1.5 h-1.5 rounded-full ${mission.status === 'PUBLISHED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-yellow-500'}`} />
                </div>
                <h3 className="font-bold text-lg leading-tight mb-2 group-hover:text-neon-blue transition-colors">{mission.title}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
                   <Target className="w-3 h-3" />
                   <span>{mission.questionsCount || 0} reactivos en banco</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                {(mission.type === 'A_LA_CIMA' || mission.type === 'POR_EQUIPOS' || mission.type === 'LA_TORRE') && mission.status === 'PUBLISHED' && (
                  <Button 
                    size="sm" 
                    className="flex-1 h-8 bg-neon-blue hover:bg-neon-blue/80 text-black font-black text-[10px] uppercase italic"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchLive(mission);
                    }}
                  >
                    LANZAR VIVO
                  </Button>
                )}
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="flex-1 h-8 text-[10px] font-bold uppercase tracking-tight" 
                  onClick={() => navigate(`/teacher/missions/${mission.id}/builder`)}
                >
                  <Pencil className="w-3 h-3 mr-1" /> Editar
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive hover:bg-destructive/10" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMission(mission.id, mission.title);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {missions.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border/30 rounded-3xl flex flex-col items-center gap-4 bg-secondary/5">
            <Rocket className="w-12 h-12 text-muted-foreground opacity-20" />
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase opacity-60">Hangar en Silencio</p>
              <p className="text-xs text-muted-foreground">No hay misiones configuradas en este sector.</p>
            </div>
            <Button variant="outline" className="mt-2 border-neon-blue text-neon-blue font-bold px-8 h-10" onClick={() => setIsCreating(true)}>
              INICIAR PROTOCOLO DE CREACIÓN
            </Button>
          </div>
        )}
      </div>

      {hasMoreMissions && (
        <div className="flex justify-center mt-8 pb-12">
          <Button 
            variant="ghost" 
            onClick={() => fetchMissions(true)} 
            disabled={loadingMoreMissions}
            className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-neon-blue"
          >
            {loadingMoreMissions ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
            {loadingMoreMissions ? 'Sincronizando Sector...' : 'Ver Más Misiones'}
          </Button>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-lg font-black italic text-muted-foreground tracking-widest uppercase">Tecnologías de Evaluación Disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ModeCard
            title="Síncrono Competitivo"
            desc="Duelos en tiempo real como 'A la Cima' o 'La Torre'. Ideal para el aula física o remota con control de avance centralizado."
            icon={Rocket}
            color="text-neon-blue"
          />
          <ModeCard
            title="Asíncrono (Abierto)"
            desc="Misiones clásicas que el alumno resuelve a su ritmo. Ideal para tareas, repasos o exámenes parciales con ventana de tiempo."
            icon={BookOpen}
            color="text-neon-purple"
          />
          <ModeCard
            title="Identificación Visual"
            desc="Actividades basadas en diagramas e imágenes reales donde el alumno debe señalar componentes específicos."
            icon={Target}
            color="text-neon-pink"
          />
        </div>
      </div>
    </div>
  );
}

function ModeCard({ title, desc, icon: Icon, color }: { title: string, desc: string, icon: any, color: string }) {
  return (
    <div className="p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm group hover:border-neon-blue/30 transition-all">
      <Icon className={`w-8 h-8 ${color} mb-4 opacity-50 group-hover:opacity-100 transition-opacity`} />
      <h3 className="font-bold text-sm uppercase tracking-tight mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function QuickTestDialog({ isOpen, onClose, onCreated }: { isOpen: boolean, onClose: () => void, onCreated: () => void }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    title: 'Misión de Prueba Rápida',
    type: 'CLASICO',
    difficulty: 'MEDIUM',
    questionCount: 5
  });

  const handleCreate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { collection, addDoc, doc, writeBatch } = await import('firebase/firestore');
      
      // 1. Create the quiz
      const quizRef = await addDoc(collection(db, 'quizzes'), {
        title: data.title,
        type: data.type,
        difficulty: data.difficulty,
        teacherId: user.uid,
        questionsCount: data.questionCount,
        status: 'DRAFT',
        createdAt: Date.now(),
        isTest: true // Mark it as a test mission
      });

      // 2. Add placeholder questions
      const batch = writeBatch(db);
      for (let i = 0; i < data.questionCount; i++) {
        const qRef = doc(collection(db, `quizzes/${quizRef.id}/questions`));
        batch.set(qRef, {
          quizId: quizRef.id,
          text: `Pregunta de Prueba #${i + 1}`,
          type: 'MULTIPLE_CHOICE',
          options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
          correctAnswer: 'Opción A',
          points: 10,
          difficulty: data.difficulty,
          order: i,
          createdAt: Date.now()
        });
      }
      await batch.commit();

      notify('Misión de prueba generada con éxito.', 'success');
      onCreated();
      onClose();
      navigate(`/teacher/missions/${quizRef.id}/builder`);
    } catch (err) {
      errorService.handle(err, 'Create Quick Test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-neon-purple bg-card/90 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-neon-purple flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> GENERACIÓN RÁPIDA
          </DialogTitle>
          <DialogDescription className="text-xs uppercase font-mono opacity-50">Configura una misión de prueba instantánea</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold">Nombre del Test</Label>
            <Input 
              value={data.title}
              onChange={e => setData({...data, title: e.target.value})}
              className="bg-secondary/30 h-10 font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold">Tipo</Label>
                <select 
                  className="w-full bg-secondary/30 border border-white/5 h-10 px-3 rounded-md text-xs font-bold"
                  value={data.type}
                  onChange={e => setData({...data, type: e.target.value})}
                >
                  <option value="CLASICO">CLÁSICO</option>
                  <option value="A_LA_CIMA">COMPETITIVO</option>
                  <option value="POR_EQUIPOS">DUELO</option>
                </select>
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold">Complejidad</Label>
                <select 
                  className="w-full bg-secondary/30 border border-white/5 h-10 px-3 rounded-md text-xs font-bold"
                  value={data.difficulty}
                  onChange={e => setData({...data, difficulty: e.target.value})}
                >
                  <option value="EASY">FÁCIL</option>
                  <option value="MEDIUM">MEDIO</option>
                  <option value="HARD">DIFÍCIL</option>
                </select>
             </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold">Número de Preguntas</Label>
            <Input 
              type="number"
              min="1"
              max="50"
              value={data.questionCount}
              onChange={e => setData({...data, questionCount: parseInt(e.target.value)})}
              className="bg-secondary/30 h-10 font-mono"
            />
          </div>
        </div>

        <DialogFooter>
           <Button variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase italic">Cancelar</Button>
           <Button onClick={handleCreate} disabled={loading} className="bg-neon-purple text-white font-black uppercase italic text-xs px-8 h-10 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'GENERAR Y CONSTRUIR'}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
