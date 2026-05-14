import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/auth';
import { useSubjectsGroupsStore } from './store/subjectsGroups';
import { NotificationContainer } from './components/NeonNotification';
import { AdminRoleSwitcher } from './components/AdminRoleSwitcher';
import { SystemAlertListener } from './components/SystemAlertListener';
import { useThemeStore } from './store/themeStore';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { errorService } from './services/errorService';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuotaExhaustedBanner } from './components/QuotaExhaustedBanner';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const QuizRunner = lazy(() => import('./pages/QuizRunner'));
const RequestAccessPage = lazy(() => import('./pages/RequestAccessPage'));

import { SystemAlertModal } from './components/SystemAlertModal';

function PrivateRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, loading, canonicalRole } = useAuthStore();
  const location = useLocation();
  
  useEffect(() => {
    if (!loading) {
      console.log(`[Navigation] Target: ${location.pathname}, Role: ${user?.role}, Canonical: ${canonicalRole}`);
    }
  }, [location, user?.role, canonicalRole, loading]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center cosmic-grid neo-glow">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-neon-blue font-black italic tracking-widest animate-pulse">Sincronizando Capas...</p>
      </div>
    </div>
  );
  
  if (!user) return <Navigate to="/" />;
  
  const isAllowed = allowedRoles.includes(user.role) || 
                    canonicalRole === 'ADMIN' ||
                    (canonicalRole && allowedRoles.includes(canonicalRole));

  if (!isAllowed) return <Navigate to="/" />;
  if (user.active === false || user.role === 'PENDING') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-neon-pink p-8 text-center">
      <ShieldAlert className="w-20 h-20 mb-6 animate-pulse" />
      <h1 className="text-4xl font-black italic mb-4">
        {user.role === 'PENDING' ? 'ACCESO EN TRÁMITE' : 'ACCESO BLOQUEADO'}
      </h1>
      <p className="text-muted-foreground max-w-md">
        {user.role === 'PENDING' 
          ? 'Tu cuenta aún está siendo validada por el Nucleus Central. Por favor, contacta con tu docente para que autorice tu entrada.'
          : 'Tu cuenta ha sido suspendida por el Administrador o por violaciones a los protocolos de seguridad de LattQuiz.'}
      </p>
      <Button variant="ghost" onClick={() => supabase.auth.signOut()} className="mt-8 text-[10px] font-black uppercase tracking-widest hover:bg-neon-pink/10">
        CERRAR SESIÓN E INTENTAR OTRO NODO
      </Button>
    </div>
  );
  
  return <>{children}</>;
}

function UserPresence() {
  const { user } = useAuthStore();
  
  useEffect(() => {
    if (!user?.uid) return;

    const updatePresence = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.uid);
      } catch (e) {}
    };

    updatePresence();
    const interval = setInterval(updatePresence, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, [user?.uid]);

  return null;
}

function MaintenanceGuard() {
  const { user } = useAuthStore();
  const [maintenance, setMaintenance] = React.useState(false);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const { data } = await supabase
          .from('config')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single();
        if (data) {
          setMaintenance(!!data.value);
        }
      } catch (e) {}
    };
    
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 900000);
    return () => clearInterval(interval);
  }, []);

  if (maintenance && user?.role !== 'ADMIN') {
    return (
      <div className="fixed inset-0 z-[1000] bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-neon-pink/10 rounded-full flex items-center justify-center mx-auto animate-pulse border border-neon-pink/30">
            <ShieldAlert className="w-10 h-10 text-neon-pink" />
          </div>
          <h1 className="text-4xl font-black italic text-neon-pink uppercase tracking-tighter">PROTOCOLOS DE MANTENIMIENTO ACTIVO</h1>
          <p className="text-muted-foreground text-sm uppercase font-bold leading-relaxed opacity-60">
            El Nucleus Central está siendo optimizado. Todos los accesos no-administrativos han sido suspendidos temporalmente.
          </p>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 font-mono text-[10px] text-neon-blue uppercase">
            Sincronización de Capas de Datos en Progreso...
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <>
      <QuotaExhaustedBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname.split('/')[1] || 'root'} 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="min-h-screen"
        >
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/request-access" element={<RequestAccessPage />} />
            
            <Route path="/admin/*" element={
              <PrivateRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </PrivateRoute>
            } />
            
            <Route path="/teacher/*" element={
              <PrivateRoute allowedRoles={['ADMIN', 'TEACHER']}>
                <TeacherDashboard />
              </PrivateRoute>
            } />
            
            <Route path="/student/*" element={
              <PrivateRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <StudentDashboard />
              </PrivateRoute>
            } />
            
            <Route path="/quiz/:quizId" element={
              <PrivateRoute allowedRoles={['STUDENT', 'TEACHER', 'ADMIN']}>
                <QuizRunner />
              </PrivateRoute>
            } />

            <Route path="/session/:sessionId" element={
              <PrivateRoute allowedRoles={['STUDENT', 'TEACHER', 'ADMIN']}>
                <QuizRunner />
              </PrivateRoute>
            } />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default function App() {
  const { setUser, setLoading, fetchProfile } = useAuthStore();
  const initSubjectsGroups = useSubjectsGroupsStore(s => s.init);
  const theme = useThemeStore(s => s.theme);
  
  const authUnsubRef = React.useRef<any>(null);
  const profileUnsubRef = React.useRef<any>(null);

  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      errorService.handle(event.reason, 'Global Promise Rejection');
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add(`theme-${theme}`);
    return () => document.documentElement.classList.remove(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    // 1. Auth State Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const sbUser = session?.user || null;
      
      if (sbUser) {
        setLoading(true);
        
        // Initial Fetch
        const profile = await fetchProfile(sbUser.id);
        if (profile) {
          setUser(profile, sbUser);
          
          // Realtime Listener for Profile updates
          if (profileUnsubRef.current) supabase.removeChannel(profileUnsubRef.current);
          
          profileUnsubRef.current = supabase
            .channel(`profile-${sbUser.id}`)
            .on('postgres_changes', { 
              event: 'UPDATE', 
              schema: 'public', 
              table: 'profiles', 
              filter: `id=eq.${sbUser.id}` 
            }, (payload) => {
              const updatedData = payload.new;
              const mappedProfile = {
                uid: updatedData.id,
                email: updatedData.email,
                role: updatedData.role,
                displayName: updatedData.display_name,
                active: updatedData.active,
                groupIds: updatedData.group_ids,
                subjectIds: updatedData.subject_ids,
                matricula: updatedData.matricula,
                wildcards: updatedData.wildcards,
                averageGrade: updatedData.average_grade,
                lastSeenAt: updatedData.last_seen_at ? new Date(updatedData.last_seen_at).getTime() : undefined
              };
              setUser(mappedProfile as any, sbUser);
            })
            .subscribe();

        } else {
          setUser(null, sbUser);
        }
        setLoading(false);
      } else {
        if (profileUnsubRef.current) supabase.removeChannel(profileUnsubRef.current);
        setUser(null, null);
        setLoading(false);
      }
    });

    authUnsubRef.current = subscription;
    
    // Init other stores
    initSubjectsGroups();

    return () => {
      if (authUnsubRef.current) authUnsubRef.current.unsubscribe();
      if (profileUnsubRef.current) supabase.removeChannel(profileUnsubRef.current);
    };
  }, [fetchProfile, setUser, initSubjectsGroups, setLoading]);

  return (
    <AppErrorBoundary>
      <SystemAlertModal />
      <BrowserRouter>
        <NotificationContainer />
        <UserPresence />
        <SystemAlertListener />
        <MaintenanceGuard />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center cosmic-grid neo-glow text-neon-blue">Inicializando...</div>}>
          <AdminRoleSwitcher />
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center cosmic-grid neo-glow text-neon-blue">Inicializando...</div>}>
            <AnimatedRoutes />
          </Suspense>
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
