import React, { useState } from 'react';
import { useAuthStore, UserRole } from '../store/auth';
import { Button } from './ui/button';
import { Shield, User, GraduationCap, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import playSound from '../lib/sounds';

export function AdminRoleSwitcher() {
  const { user, canonicalRole, setActiveRole } = useAuthStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (canonicalRole !== 'ADMIN' && canonicalRole !== 'TEACHER') return null;

  const allRoles: { role: UserRole; icon: any; label: string; color: string; path: string }[] = [
    { role: 'ADMIN', icon: Shield, label: 'Admin', color: 'text-neon-purple', path: '/admin' },
    { role: 'TEACHER', icon: GraduationCap, label: 'Docente', color: 'text-neon-blue', path: '/teacher' },
    { role: 'STUDENT', icon: User, label: 'Alumno', color: 'text-neon-pink', path: '/student' },
  ];

  const roles = allRoles.filter(r => {
    if (canonicalRole === 'ADMIN') return true;
    if (canonicalRole === 'TEACHER') return r.role === 'TEACHER' || r.role === 'STUDENT';
    return false;
  });

  const handleSwitch = (role: UserRole, path: string) => {
    playSound.powerUp();
    setActiveRole(role);
    setExpanded(false);
    navigate(path);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3 pointer-events-none">
      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.8 }}
            className="bg-black/90 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl shadow-[0_0_50px_rgba(0,243,255,0.2)] flex flex-col md:flex-row gap-2 pointer-events-auto"
          >
            <div className="flex items-center px-3 border-b md:border-b-0 md:border-r border-white/10 mb-2 md:mb-0 md:mr-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-neon-blue">Vista de Rol</span>
            </div>
            
            {roles.map((r) => {
              const isActive = user?.role === r.role;
              return (
                <Button
                  key={r.role}
                  size="sm"
                  variant={isActive ? "default" : "ghost"}
                  onClick={() => handleSwitch(r.role, r.path)}
                  className={`h-11 px-4 rounded-xl flex items-center gap-3 transition-all duration-300 ${
                    isActive 
                      ? `bg-white/10 ${r.color} border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]` 
                      : 'text-muted-foreground hover:text-white hover:bg-white/5'
                  }`}
                >
                  <r.icon className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{r.label}</span>
                </Button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.button
        whileHover={{ scale: 1.1, rotate: 10 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setExpanded(!expanded)}
        className={`w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto transition-all duration-500 shadow-2xl relative group ${
          expanded ? 'bg-neon-blue text-black rotate-180' : 'bg-black/80 text-neon-blue border border-neon-blue/40'
        }`}
      >
        <div className="absolute inset-0 bg-neon-blue/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        <Eye className={`w-7 h-7 relative z-10 ${!expanded ? 'animate-pulse' : ''}`} />
      </motion.button>
    </div>
  );
}
