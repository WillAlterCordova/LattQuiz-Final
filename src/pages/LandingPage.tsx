import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, ShieldAlert, Sparkles, Activity, BrainCircuit, GraduationCap, ShieldCheck, ChevronRight, FolderOpen, Folder, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { playSound } from '../lib/firebase';
import { errorService } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { cn } from '../lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ThemeSelector } from '@/components/ThemeSelector';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, setUser, setLoading } = useAuthStore();
  const [adminId, setAdminId] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [activeRole, setActiveRole] = useState<'student' | 'teacher' | 'admin' | null>(null);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (user && !isLoggingIn) {
      if (user.role === 'ADMIN') navigate('/admin');
      else if (user.role === 'TEACHER') navigate('/teacher');
      else if (user.role === 'STUDENT') navigate('/student');
    }
  }, [user, navigate, isLoggingIn]);

  const handleGoogleLogin = async () => {
    playSound.click();
    setError('');
    setIsLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/admin`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error en autenticación Google');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const attemptLogin = async (id: string, code: string, role: string) => {
    const cleanId = id.trim().toUpperCase();
    const cleanCode = code.trim();
    const dummyEmail = `${cleanId.toLowerCase()}@lattquiz.com`;
    const stablePass = `${role.toLowerCase()}-${cleanId.toLowerCase()}-pass`;

    // 1. Check if profile exists and code matches
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('student_code', cleanCode)
      .eq('role', role)
      // .eq('id', cleanId) // id is UUID in supabase, so we might need to search by another field like 'matricula'
      .or(`matricula.eq.${cleanId},student_code.eq.${cleanCode}`)
      .single();

    // Since Supabase uses UUID for IDs, we'll rely on matricula or a specific field for the teacher/student ID
    // or we can allow login by Email/Code if we store that.
    // For now, let's assume 'matricula' is used as the custom ID.
    
    // Simplification for the migration:
    // If the user wants to login with ID/Code, they should probably have an email associated.
    // But since the current system uses dummy emails, we'll try to sign in with the expected dummy email.
    
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: dummyEmail,
        password: stablePass,
      });

      if (authErr) {
        // Try sign up if not found (legacy behavior)
        if (authErr.message.includes('Invalid login credentials')) {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: dummyEmail,
            password: stablePass,
            options: {
              data: {
                full_name: cleanId,
                role: role
              }
            }
          });
          if (signUpErr) throw signUpErr;
          return signUpData.user;
        }
        throw authErr;
      }
      return data.user;
    } catch (err: any) {
      throw err;
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound.click();
    setIsLoggingIn(true);
    try {
      await attemptLogin(adminId, adminCode, 'ADMIN');
      navigate('/admin');
    } catch (e: any) {
      setError(e.message || 'Error de acceso administrativo.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound.click();
    setIsLoggingIn(true);
    try {
      await attemptLogin(teacherId, teacherCode, 'TEACHER');
      notify('Acceso Docente concedido', 'success');
      navigate('/teacher');
    } catch (e: any) {
      errorService.handle(e, 'Teacher Login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound.click();
    setIsLoggingIn(true);
    try {
      await attemptLogin(studentId, studentCode, 'STUDENT');
      notify('¡Misión aceptada, recluta!', 'success');
      navigate('/student');
    } catch (e: any) {
      errorService.handle(e, 'Student Login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen cosmic-grid relative overflow-hidden flex flex-col">
      {/* Theme Selector Floating */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeSelector />
      </div>
      
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-purple rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-blue rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
      
      <div className="flex-grow container mx-auto px-4 py-12 lg:py-20 relative z-10 flex flex-col items-center justify-center min-h-[85vh]">
        
        {/* Central Logo Section - Inspired by the neural network images */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center mb-16 relative"
        >
          <div className="relative inline-block">
            {/* Neural Backdrop Glow */}
            <div className="absolute inset-0 bg-neon-blue/20 blur-[80px] rounded-full animate-pulse"></div>
            
            {/* Neural Nodes Background Animation */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] pointer-events-none opacity-20">
               <svg viewBox="0 0 100 100" className="w-full h-full">
                  <motion.circle cx="20" cy="20" r="0.5" fill="var(--neon-blue)" animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 3, delay: 0.5 }} />
                  <motion.circle cx="80" cy="30" r="0.5" fill="var(--neon-purple)" animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 4, delay: 1 }} />
                  <motion.circle cx="40" cy="80" r="0.5" fill="var(--neon-pink)" animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 5, delay: 2 }} />
                  <motion.line x1="20" y1="20" x2="50" y2="50" stroke="var(--neon-blue)" strokeWidth="0.1" animate={{ opacity: [0, 0.5, 0] }} transition={{ repeat: Infinity, duration: 4 }} />
                  <motion.line x1="80" y1="30" x2="50" y2="50" stroke="var(--neon-purple)" strokeWidth="0.1" animate={{ opacity: [0, 0.5, 0] }} transition={{ repeat: Infinity, duration: 5, delay: 1 }} />
               </svg>
            </div>

            <div className="flex flex-col items-center relative z-10">
              <div className="flex items-center gap-4 md:gap-12 mb-8">
                <div className="relative">
                  <div className="absolute -inset-6 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink opacity-20 blur-3xl animate-pulse rounded-full"></div>
                  <motion.img 
                    initial={{ rotate: -5, scale: 0.9 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
                    alt="LattQuiz Neural Logo" 
                    className="w-32 h-32 md:w-52 md:h-52 object-contain mix-blend-screen drop-shadow-[0_0_35px_rgba(0,243,255,0.6)] hover:scale-110 transition-all duration-1000 cursor-none"
                    referrerPolicy="no-referrer"
                  />
                  {/* Decorative Neural Nodes */}
                  <div className="absolute -top-6 -right-2 w-4 h-4 bg-neon-blue rounded-full shadow-[0_0_20px_#00f3ff] animate-ping opacity-70"></div>
                  <div className="absolute -bottom-4 -left-10 w-3 h-3 bg-neon-purple rounded-full shadow-[0_0_20px_#a855f7] animate-pulse opacity-60" style={{ animationDelay: '1.5s' }}></div>
                  <div className="absolute top-1/3 -right-16 w-2.5 h-2.5 bg-neon-pink rounded-full shadow-[0_0_20px_#ff00e5] animate-pulse opacity-50" style={{ animationDelay: '2.5s' }}></div>
                </div>
                <div className="text-left flex flex-col items-center md:items-start">
                  <h1 className="text-8xl md:text-[12rem] font-black tracking-[-0.07em] leading-[0.8] select-none flex flex-col items-center md:items-start">
                    <span className="text-[#00f3ff] italic drop-shadow-[0_0_20px_rgba(0,243,255,0.4)]">Latt</span>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#a855f7] via-[#ff00e5] to-[#f97316] italic translate-y-[-0.1em] drop-shadow-[0_0_25px_rgba(168,85,247,0.4)]">Quiz</span>
                  </h1>
                </div>
              </div>
              
              <div className="max-w-3xl mx-auto px-4 text-center">
                <motion.div
                  initial={{ opacity: 0, letterSpacing: '0.1em' }}
                  animate={{ opacity: 1, letterSpacing: 'normal' }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                >
                   <p className="text-2xl md:text-5xl font-black text-white/95 tracking-tighter leading-tight italic">
                    "La red donde se crean nuevas conexiones al <span className="text-[#00f3ff] underline decoration-[#00f3ff]/40 underline-offset-[12px] decoration-8">conocimiento</span>."
                   </p>
                </motion.div>
                <div className="h-1.5 w-64 bg-gradient-to-r from-transparent via-[#00f3ff] to-transparent mx-auto mt-12 opacity-50 rounded-full animate-pulse shadow-[0_0_15px_#00f3ff]"></div>
                <div className="flex items-center justify-center gap-4 mt-8 opacity-40 group cursor-default">
                   <div className="h-px w-10 bg-white/30 group-hover:w-16 transition-all"></div>
                   <p className="text-[11px] md:text-xs font-black uppercase tracking-[0.8em] text-muted-foreground transition-all group-hover:text-neon-blue">
                    Neural Dynamic Academic Ecosystem v4.2
                   </p>
                   <div className="h-px w-10 bg-white/30 group-hover:w-16 transition-all"></div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dynamic Interface Selection - Folder Based */}
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-16 items-start">
          
          {/* Public Overview & Features */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <div className="p-1 px-3 bg-neon-blue/10 border border-neon-blue/20 rounded-full inline-block">
                <span className="text-[9px] font-black uppercase tracking-widest text-neon-blue">Protocolos de Sistema</span>
              </div>
              <h2 className="text-4xl font-black italic uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-white/40">Observar lo que ofrece</h2>
              <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                Explora las capas de ejecución dinámica de LattQuiz. Un entorno diseñado para la gamificación académica y el análisis neural de datos.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <FeaturePanel icon={Sparkles} title="Misiones" delay={0.4} desc="Evaluación reactiva mediante misiones de alto impacto visual." />
              <FeaturePanel icon={BrainCircuit} title="IA Avanzada" delay={0.5} desc="Nodos de conocimiento generados mediante oráculos inteligentes." />
              <FeaturePanel icon={ShieldAlert} title="Seguridad" delay={0.6} desc="Blindaje de sesiones y monitoreo de integridad total." />
              <FeaturePanel icon={Activity} title="Analíticas" delay={0.7} desc="Métricas vitales sobre el flujo y rendimiento académico." />
            </div>

            {/* Public Glimpse Card */}
            <div className="relative group overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-8 backdrop-blur-md">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                <Activity className="w-20 h-20 text-neon-blue" />
              </div>
              <div className="relative z-10 space-y-4">
                <h3 className="text-xl font-black italic uppercase text-white/90">Ecosistema Abierto</h3>
                <p className="text-xs text-muted-foreground leading-relaxed uppercase font-bold tracking-wider opacity-60">
                  Integración masiva, rankings competitivos y retroalimentación instantánea para una educación del siguiente nivel.
                </p>
                <div className="flex gap-4 pt-2">
                  <div className="text-center bg-black/40 p-2 px-4 rounded-xl border border-white/5">
                    <p className="text-neon-blue text-sm font-black italic tracking-tighter">99.9%</p>
                    <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest">Uptime</p>
                  </div>
                  <div className="text-center bg-black/40 p-2 px-4 rounded-xl border border-white/5">
                    <p className="text-neon-purple text-sm font-black italic tracking-tighter">&lt; 1ms</p>
                    <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest">Latencia</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Role Access column stays similarly structured but refined */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full space-y-4"
          >
            <div className="text-center lg:text-left mb-6">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Puertas de Enlace</h2>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest opacity-60">Selecciona tu nodo para iniciar sesión</p>
            </div>
            
            <div className="space-y-4">
              <RoleFolder 
                role="student" 
                active={activeRole === 'student'} 
                onClick={() => setActiveRole('student')}
                icon={GraduationCap}
                label="ALUMNOS"
                color="#00f3ff"
                colorName="neon-blue"
              >
                <form onSubmit={handleStudentLogin} className="space-y-4 pt-2">
                  {error && activeRole === 'student' && <p className="text-destructive text-[10px] font-bold uppercase italic animate-pulse">{error}</p>}
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Firma de Alumno (ID/Matrícula)</Label>
                    <Input 
                      placeholder="Identificador Único" 
                      value={studentId}
                      onChange={e => setStudentId(e.target.value)}
                      className="bg-black/60 border-white/10 focus:border-neon-blue uppercase font-mono italic text-neon-blue h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Clave de Enlace</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={studentCode}
                      onChange={e => setStudentCode(e.target.value)}
                      className="bg-black/60 border-white/10 focus:border-neon-blue h-12"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoggingIn}
                    className="w-full bg-neon-blue text-black font-black uppercase italic tracking-tighter h-12 shadow-[0_0_20px_rgba(0,243,255,0.2)] hover:shadow-[0_0_30px_rgba(0,243,255,0.4)] transition-all disabled:opacity-50"
                  >
                    {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                    {isLoggingIn ? 'Verificando Nodo...' : 'Iniciar Protocolo de Alumno'}
                  </Button>
                </form>
              </RoleFolder>

              <RoleFolder 
                role="teacher" 
                active={activeRole === 'teacher'} 
                onClick={() => setActiveRole('teacher')}
                icon={BrainCircuit}
                label="DOCENTES"
                color="#a855f7"
                colorName="neon-purple"
              >
                <form onSubmit={handleTeacherLogin} className="space-y-4 pt-2">
                  {error && activeRole === 'teacher' && <p className="text-destructive text-[10px] font-bold uppercase italic animate-pulse">{error}</p>}
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Identificación (ID o Correo)</Label>
                    <Input 
                      placeholder="Identificador o Email" 
                      value={teacherId}
                      onChange={e => setTeacherId(e.target.value)}
                      className="bg-black/60 border-white/10 focus:border-neon-purple italic text-neon-purple h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Firma de Autorización (Código)</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={teacherCode}
                      onChange={e => setTeacherCode(e.target.value)}
                      className="bg-black/60 border-white/10 focus:border-neon-purple h-12"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoggingIn}
                    className="w-full bg-neon-purple text-white font-black uppercase italic tracking-tighter h-12 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50"
                  >
                    {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
                    {isLoggingIn ? 'Sincronizando...' : 'Iniciar Protocolo de Docente'}
                  </Button>
                </form>
              </RoleFolder>

              <RoleFolder 
                role="admin" 
                active={activeRole === 'admin'} 
                onClick={() => setActiveRole('admin')}
                icon={ShieldCheck}
                label="ADMINISTRACIÓN"
                color="#ff00e5"
                colorName="neon-pink"
              >
                <div className="space-y-4 pt-2">
                  {error && activeRole === 'admin' && <p className="text-destructive text-[10px] font-bold uppercase italic animate-pulse">{error}</p>}
                  <p className="text-[10px] text-muted-foreground uppercase font-medium leading-relaxed opacity-70 mb-4">
                    Acceso exclusivo para el Nucleus Central mediante verificación biométrica de Google.
                  </p>
                  
                  <Button 
                    type="button" 
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="w-full bg-neon-pink text-white font-black uppercase italic tracking-tighter h-14 shadow-[0_0_30px_rgba(255,0,229,0.3)] hover:shadow-[0_0_50px_rgba(255,0,229,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    {isLoggingIn ? 'Autenticando...' : 'Acceder con Google (Admin)'}
                  </Button>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center text-[8px] uppercase font-black">
                      <span className="bg-black/20 backdrop-blur-md px-2 text-muted-foreground/40">Protocolos Alternos</span>
                    </div>
                  </div>

                  <form onSubmit={handleAdminLogin} className="space-y-3 opacity-40 hover:opacity-100 transition-opacity">
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest opacity-50">ID Central</Label>
                      <Input 
                        placeholder="ADMIN-ID" 
                        value={adminId}
                        onChange={e => setAdminId(e.target.value)}
                        className="bg-black/40 border-white/5 focus:border-neon-pink h-9 text-[10px] uppercase font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest opacity-50">Código Master</Label>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        value={adminCode}
                        onChange={e => setAdminCode(e.target.value)}
                        className="bg-black/40 border-white/5 focus:border-neon-pink h-9"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      disabled={isLoggingIn}
                      variant="ghost"
                      className="w-full text-neon-pink/60 hover:text-neon-pink font-black uppercase text-[9px] h-8"
                    >
                      Bypass Manual
                    </Button>
                  </form>
                </div>
              </RoleFolder>
            </div>

            <div className="text-center mt-8">
              <Button 
                variant="link" 
                className="text-[11px] text-muted-foreground/40 hover:text-neon-blue uppercase font-black tracking-[0.3em] transition-all group" 
                onClick={() => navigate('/request-access')}
              >
                SOLICITAR ACCESO AL NÚCLEO CENTRAL <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      <footer className="relative z-10 py-12 border-t border-white/5 bg-black/40 backdrop-blur-md mt-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <img 
                src="/src/assets/images/lattquiz_brain_logo_1778115325874.png" 
                alt="LattQuiz Logo" 
                className="w-8 h-8 object-contain mix-blend-screen"
                referrerPolicy="no-referrer"
              />
              <h3 className="text-xl font-bold tracking-tighter">Latt<span className="text-neon-blue">Quiz</span></h3>
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground italic">Powered by Will Alter</p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground italic">
            <p>Soporte Técnico: cordova.wil@gmail.com</p>
            <p className="text-neon-purple mt-1 font-bold">Will Alter | LattQuiz © M.E.M.S. Wilfredo Chaparro Córdova</p>
            <p className="opacity-50">La voluntad de transformar la realidad</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RoleFolder({ role, active, onClick, icon: Icon, label, color, colorName, children }: { role: string, active: boolean, onClick: () => void, icon: any, label: string, color: string, colorName: string, children: React.ReactNode }) {
  return (
    <div className={`relative transition-all duration-500 rounded-3xl ${active ? 'z-20' : 'z-10'}`}>
      {/* Folder Tab Effect */}
      <div 
        className={cn(
          "absolute -top-4 left-0 h-6 w-20 rounded-t-xl transition-all duration-500",
          active ? "" : "opacity-0"
        )}
        style={{ backgroundColor: active ? `${color}40` : 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}
      ></div>

      <button 
        onClick={() => {
          playSound.selection();
          onClick();
        }}
        className={cn(
          "w-full flex items-center justify-between p-6 rounded-3xl rounded-tl-none border transition-all duration-500 group relative overflow-hidden",
          active 
            ? "bg-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] scale-[1.02]" 
            : "bg-black/40 border-white/5 hover:border-white/10 hover:bg-black/60"
        )}
        style={{ borderColor: active ? `${color}60` : undefined }}
      >
        <div className="flex items-center gap-5 relative z-10">
          <div 
            className="p-4 rounded-2xl transition-all duration-700" 
            style={{ 
              backgroundColor: active ? `${color}20` : 'rgba(255,255,255,0.05)', 
              color: active ? color : 'inherit',
              boxShadow: active ? `0 0 20px ${color}30` : 'none'
            }}
          >
            <Icon className={cn("w-6 h-6 transition-all duration-700", active ? "scale-110 rotate-3" : "opacity-40 group-hover:opacity-100")} />
          </div>
          <div className="text-left">
            <p 
              className="text-[11px] font-black uppercase tracking-[0.3em] mb-1 transition-colors duration-500" 
              style={{ color: active ? color : 'rgba(255,255,255,0.4)' }}
            >
              {label}
            </p>
            <p className="text-sm font-black italic tracking-tighter text-foreground/80 uppercase">Nodo de Acceso</p>
          </div>
        </div>
        
        <div className={cn("transition-all duration-700 flex items-center gap-3", active ? "rotate-0 scale-125 translate-x-[-10px]" : "opacity-20 translate-x-0")}>
           {active ? <FolderOpen className="w-6 h-6" style={{ color }} /> : <Folder className="w-6 h-6" />}
        </div>
      </button>

      <motion.div
        initial={false}
        animate={{ 
          height: active ? 'auto' : 0,
          opacity: active ? 1 : 0,
          marginTop: active ? 8 : 0
        }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className="overflow-hidden bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl"
        style={{ borderColor: active ? `${color}30` : undefined }}
      >
        <div className="p-8 relative">
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 opacity-10 blur-[80px] rounded-full pointer-events-none" 
            style={{ backgroundColor: color }}
          ></div>
          
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={role}
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -10, opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="relative z-10"
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function FeaturePanel({ icon: Icon, title, desc, delay = 0 }: { icon: any, title: string, desc: string, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -5, scale: 1.02 }}
      className="flex bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/5 hover:border-neon-blue/30 transition-all group"
    >
      <div className="mr-4 mt-1 bg-neon-blue/10 p-2 rounded-lg group-hover:bg-neon-blue/20 transition-colors">
        <Icon className="w-6 h-6 text-neon-blue" />
      </div>
      <div>
        <h3 className="font-black italic uppercase text-[11px] tracking-widest text-foreground mb-1">{title}</h3>
        <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70 font-medium">{desc}</p>
      </div>
    </motion.div>
  );
}
