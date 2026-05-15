import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, ShieldAlert, Sparkles, Activity, BrainCircuit, GraduationCap, ShieldCheck, ChevronRight, FolderOpen, Folder, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import playSound from '../lib/sounds'; // Cambiado de lib/firebase a lib/sounds
import { errorService } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { cn } from '../lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeSelector } from '@/components/ThemeSelector';

// Componentes auxiliares locales
function FeaturePanel({ icon: Icon, title, desc, delay }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-neon-blue/50 transition-colors group"
    >
      <Icon className="w-6 h-6 text-neon-blue mb-2 group-hover:scale-110 transition-transform" />
      <h3 className="text-sm font-black italic uppercase text-white/90">{title}</h3>
      <p className="text-[10px] text-muted-foreground font-medium leading-tight">{desc}</p>
    </motion.div>
  );
}

function RoleFolder({ active, onClick, icon: Icon, label, children, color, colorName }: any) {
  return (
    <div className={cn(
      "rounded-3xl border transition-all duration-500 overflow-hidden",
      active ? `bg-white/5 border-${colorName}/40 shadow-[0_0_40px_rgba(0,0,0,0.3)]` : "bg-transparent border-white/5 hover:border-white/20"
    )}>
      <button 
        onClick={onClick}
        className="w-full flex items-center justify-between p-6 text-left group"
      >
        <div className="flex items-center gap-4">
          <div className={cn("p-3 rounded-2xl transition-colors", active ? `bg-${colorName}/20` : "bg-white/5")}>
            <Icon className={cn("w-6 h-6", active ? `text-${colorName}` : "text-white/40")} />
          </div>
          <div>
            <p className={cn("text-[10px] font-black tracking-[0.2em]", active ? `text-${colorName}` : "text-white/40")}>ACCESO</p>
            <h3 className="text-xl font-black italic text-white tracking-tighter">{label}</h3>
          </div>
        </div>
        <ChevronRight className={cn("w-5 h-5 transition-transform duration-500", active ? "rotate-90 text-white" : "text-white/20")} />
      </button>
      <AnimatePresence>
        {active && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 pb-6"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
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

  const attemptLogin = async (id: string, code: string, role: string) => {
    const cleanId = id.trim().toUpperCase();
    const dummyEmail = `${cleanId.toLowerCase()}@lattquiz.com`;
    const stablePass = `${role.toLowerCase()}-${cleanId.toLowerCase()}-pass`;

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: dummyEmail,
      password: stablePass,
    });

    if (authErr) throw authErr;
    return data.user;
  };

  const handleLogin = async (id: string, code: string, role: string) => {
    playSound.click();
    setIsLoggingIn(true);
    setError('');
    try {
      await attemptLogin(id, code, role);
      notify(`Acceso ${role} concedido`, 'success');
      navigate(`/${role.toLowerCase()}`);
    } catch (err: any) {
      setError(err.message || 'Error de autenticación');
      notify('Error en las credenciales', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen cosmic-grid relative overflow-hidden flex flex-col">
      <div className="absolute top-6 right-6 z-50">
        <ThemeSelector />
      </div>
      
      <div className="flex-grow container mx-auto px-4 py-12 flex flex-col items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-white">
            Latt<span className="text-neon-blue">Quiz</span>
          </h1>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm mt-4">
            Sistema de Gestión Académica Neural
          </p>
        </motion.div>

        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <FeaturePanel icon={Sparkles} title="Misiones" delay={0.1} desc="Evaluación dinámica interactiva." />
            <FeaturePanel icon={BrainCircuit} title="IA Core" delay={0.2} desc="Generación de nodos de conocimiento." />
          </div>

          <div className="space-y-4">
            <RoleFolder 
              role="student" 
              active={activeRole === 'student'} 
              onClick={() => setActiveRole('student')}
              icon={GraduationCap}
              label="ALUMNOS"
              colorName="neon-blue"
            >
              <div className="space-y-4 pt-2">
                <Input placeholder="Matrícula" value={studentId} onChange={e => setStudentId(e.target.value)} className="bg-black/40 border-white/10" />
                <Input type="password" placeholder="Código" value={studentCode} onChange={e => setStudentCode(e.target.value)} className="bg-black/40 border-white/10" />
                <Button onClick={() => handleLogin(studentId, studentCode, 'STUDENT')} disabled={isLoggingIn} className="w-full bg-neon-blue text-black font-black">
                  {isLoggingIn ? 'CONECTANDO...' : 'INICIAR SESIÓN'}
                </Button>
              </div>
            </RoleFolder>

            <RoleFolder 
              role="teacher" 
              active={activeRole === 'teacher'} 
              onClick={() => setActiveRole('teacher')}
              icon={BrainCircuit}
              label="DOCENTES"
              colorName="neon-purple"
            >
              <div className="space-y-4 pt-2">
                <Input placeholder="ID Docente" value={teacherId} onChange={e => setTeacherId(e.target.value)} className="bg-black/40 border-white/10" />
                <Input type="password" placeholder="Código" value={teacherCode} onChange={e => setTeacherCode(e.target.value)} className="bg-black/40 border-white/10" />
                <Button onClick={() => handleLogin(teacherId, teacherCode, 'TEACHER')} disabled={isLoggingIn} className="w-full bg-neon-purple text-white font-black">
                  {isLoggingIn ? 'VERIFICANDO...' : 'ENTRAR AL SISTEMA'}
                </Button>
              </div>
            </RoleFolder>
          </div>
        </div>
      </div>
    </div>
  );
}
