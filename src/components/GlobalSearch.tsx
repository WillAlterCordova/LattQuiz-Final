import React, { useState, useEffect, useRef } from 'react';
import { Search, Rocket, Users, BookOpen, Layers, Trophy, X, Hash, GraduationCap, Star, ShieldAlert } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import Fuse from 'fuse.js';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SearchResult {
  id: string;
  title: string;
  type: 'QUIZ' | 'STUDENT' | 'GROUP' | 'SUBJECT' | 'TOPIC' | 'TEACHER' | 'WILDCARD' | 'THEME';
  description?: string;
  metadata?: any;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const { user } = useAuthStore();
  const { subjects, groups } = useSubjectsGroupsStore();
  const navigate = useNavigate();
  const fuseRef = useRef<Fuse<SearchResult> | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    
    const fetchData = async () => {
      const aggregateData: SearchResult[] = [];

      // 1. Quizzes
      const quizSnap = await getDocs(query(collection(db, 'quizzes')));
      quizSnap.docs.forEach(doc => {
        const data = doc.data();
        // Permission check
        if (user.role === 'ADMIN' || data.teacherId === user.uid || data.isOpen || data.isPublic) {
          aggregateData.push({
            id: doc.id,
            title: data.title,
            type: 'QUIZ',
            description: `Misión ${data.type} • ${data.subjectName || 'General'}`,
            metadata: { path: user.role === 'STUDENT' ? `/quiz/${doc.id}` : `/teacher/missions/${doc.id}/builder` }
          });
        }
      });

      // 2. Users (Students, Teachers)
      if (user.role !== 'STUDENT') {
        const userSnap = await getDocs(collection(db, 'users'));
        userSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.role === 'STUDENT' || data.role === 'TEACHER') {
             aggregateData.push({
               id: doc.id,
               title: data.displayName || 'Usuario sin nombre',
               type: data.role === 'STUDENT' ? 'STUDENT' : 'TEACHER',
               description: data.role === 'STUDENT' ? `Alumno • ${data.matricula || 'N/A'}` : 'Docente / Instructor',
               metadata: { path: user.role === 'TEACHER' ? '/teacher/students' : '/admin' }
             });
          }
        });
      }

      // 3. Subjects & Groups (from store)
      subjects.forEach(s => {
        aggregateData.push({ id: s.id, title: s.name, type: 'SUBJECT', description: 'Materia Académica' });
      });
      groups.forEach(g => {
        aggregateData.push({ id: g.id, title: g.name, type: 'GROUP', description: 'Grupo / Salón' });
      });

      // 4. Wildcards (Static)
      const wildcards = [
        { id: '50_50', title: 'Comodín 50/50', description: 'Elimina opciones incorrectas' },
        { id: 'EXTRA_POINTS', title: 'Puntos Extra', description: 'Bono de puntaje' },
        { id: 'CHANGE_QUESTION', title: 'Cambio de Pregunta', description: 'Saltar reactivo' },
        { id: 'REVEAL_ANSWER', title: 'Revelar Respuesta', description: 'Muestra la solución' }
      ];
      wildcards.forEach(w => {
         aggregateData.push({ id: w.id, title: w.title, type: 'WILDCARD', description: w.description });
      });

      fuseRef.current = new Fuse(aggregateData, {
        keys: ['title', 'description', 'type'],
        threshold: 0.3,
        distance: 100
      });
    };

    fetchData();
  }, [open, user, subjects, groups]);

  useEffect(() => {
    if (fuseRef.current && queryText) {
      const searchResults = fuseRef.current.search(queryText);
      setResults(searchResults.map(r => r.item));
    } else {
      setResults([]);
    }
  }, [queryText]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQueryText('');
    if (result.metadata?.path) {
      navigate(result.metadata.path);
    } else if (result.type === 'QUIZ') {
       navigate(user?.role === 'STUDENT' ? `/quiz/${result.id}` : `/teacher/missions/${result.id}/builder`);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'QUIZ': return <Rocket className="w-4 h-4 text-neon-blue" />;
      case 'STUDENT': return <Users className="w-4 h-4 text-neon-purple" />;
      case 'TEACHER': return <ShieldAlert className="w-4 h-4 text-yellow-500" />;
      case 'GROUP': return <Layers className="w-4 h-4 text-emerald-500" />;
      case 'SUBJECT': return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'WILDCARD': return <Star className="w-4 h-4 text-amber-500" />;
      default: return <Hash className="w-4 h-4 opacity-30" />;
    }
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-neon-blue/30 transition-all text-muted-foreground group"
      >
        <Search className="w-4 h-4 group-hover:text-neon-blue transition-colors" />
        <span className="text-xs uppercase font-mono tracking-widest">Búsqueda Inteligente...</span>
        <kbd className="ml-8 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-white/50 opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl bg-black/90 backdrop-blur-3xl border-neon-blue/20 p-0 overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.1)]">
          <div className="relative p-6 border-b border-white/10">
            <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-5 h-5 text-neon-blue pointer-events-none" />
            <input 
              autoFocus
              placeholder="¿Qué estás buscando? (Pruebas, Alumnos, Materias...)"
              className="w-full bg-transparent pl-12 pr-4 h-12 text-lg font-bold italic tracking-tight placeholder:text-white/20 outline-none text-white"
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
            {results.length > 0 ? (
              <div className="space-y-1">
                 {results.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result)}
                      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-neon-blue/10 border border-transparent hover:border-neon-blue/30 transition-all text-left group"
                    >
                       <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center transition-transform group-hover:scale-110">
                          {getTypeIcon(result.type)}
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-black uppercase italic text-white group-hover:text-neon-blue transition-colors">{result.title}</p>
                          <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{result.description}</p>
                       </div>
                       <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Rocket className="w-4 h-4 text-neon-blue" />
                       </div>
                    </button>
                 ))}
              </div>
            ) : queryText ? (
              <div className="py-20 text-center space-y-4 opacity-50">
                 <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8" />
                 </div>
                 <p className="text-sm italic uppercase font-mono tracking-widest">Sin concordancias en la red neural</p>
              </div>
            ) : (
              <div className="p-8 space-y-6">
                 <div>
                    <h4 className="text-[10px] font-black uppercase text-neon-blue tracking-[0.2em] mb-4">Sugerencias de Red</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold uppercase italic text-white/60">
                       <button onClick={() => setQueryText('Misión')} className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-neon-blue/30 text-left">
                          <Rocket className="w-3.5 h-3.5" /> Ver Pruebas
                       </button>
                       <button onClick={() => setQueryText('Comodín')} className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-neon-blue/30 text-left">
                          <Star className="w-3.5 h-3.5" /> Ver Comodines
                       </button>
                    </div>
                 </div>
                 
                 <div className="p-4 rounded-xl bg-neon-blue/5 border border-neon-blue/20">
                    <div className="flex items-center gap-3">
                       <ShieldAlert className="w-5 h-5 text-neon-blue" />
                       <div>
                          <p className="text-[10px] font-black uppercase text-neon-blue tracking-widest">Tip de Operación</p>
                          <p className="text-[9px] text-white/50 leading-tight mt-0.5">Utiliza palabras clave como el nombre de una materia o la matrícula de un alumno para búsquedas rápidas.</p>
                       </div>
                    </div>
                 </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10 flex items-center justify-between text-[10px] font-mono opacity-50 uppercase tracking-widest">
             <div className="flex gap-4">
                <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5">⏎</kbd> Seleccionar</span>
                <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5">ESC</kbd> Cerrar</span>
             </div>
             <span>Latt Engine Search v1.2</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
