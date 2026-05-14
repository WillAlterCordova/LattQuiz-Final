import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Image as ImageIcon, Type, Target, Plus, Trash2, Volume2, Save, Play, Sigma, Music, RefreshCw, ChevronUp, ChevronDown, Upload, ShieldAlert } from 'lucide-react';
import { doc, getDoc, updateDoc, collection, onSnapshot, addDoc, deleteDoc, writeBatch, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { errorService } from '../services/errorService';
import { notify } from '../components/NeonNotification';
import { useAuthStore } from '../store/auth';
import playSound from '../lib/sounds';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { generateQuestionsAI } from '../services/aiService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles, BrainCircuit, LayoutGrid, FileAudio, BookMarked, Settings, Filter, Wand2, Users, Search, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { QuestionLibrarySelector } from '../components/QuestionLibrarySelector';
import { MissionPreview } from '../components/MissionPreview';
import 'katex/dist/katex.min.css';
// @ts-ignore
import { InlineMath } from 'react-katex';

const PROMPT_TEMPLATES = [
  { id: 'diag', label: 'Evaluación Diagnóstica', prompt: 'Enfócate en identificar conocimientos previos y lagunas conceptuales básicas.' },
  { id: 'review', label: 'Refuerzo de Conceptos', prompt: 'Preguntas diseñadas para consolidar lo aprendido en clase con retroalimentación detallada.' },
  { id: 'challenge', label: 'Desafío Avanzado', prompt: 'Problemas de alto nivel cognitivo que requieren síntesis y evaluación de múltiples conceptos.' },
  { id: 'exam', label: 'Simulador de Examen', prompt: 'Estructura formal de reactivos alineados a estándares de evaluación oficial.' },
  { id: 'gamified', label: 'Ludificación / Aventura', prompt: 'Preguntas narrativas integradas en una temática de misión espacial o búsqueda del tesoro.' },
];

export function MissionBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const { user } = useAuthStore();
  const { subjects, groups } = useSubjectsGroupsStore();
  const [saving, setSaving] = useState(false);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [showRandomImport, setShowRandomImport] = useState(false);
  const [showSaveToBank, setShowSaveToBank] = useState(false);
  const [questionToSave, setQuestionToSave] = useState<any>(null);
  const [savedPhrases, setSavedPhrases] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [showBulkQuestions, setShowBulkQuestions] = useState(false);
  const [bulkQuestionsData, setBulkQuestionsData] = useState('');
  const [isProcessingBulkQuestions, setIsProcessingBulkQuestions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  useEffect(() => {
    if (!id || !user) return;
    // Check for active sessions for this quiz
    const fetchSession = async () => {
      try {
        const q = query(collection(db, 'sessions'), where('quizId', '==', id), where('status', 'in', ['LOBBY', 'IN_PROGRESS']), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setActiveSessionId(snap.docs[0].id);
        } else {
          setActiveSessionId(null);
        }
      } catch (e) {}
    };
    
    fetchSession();
    const interval = setInterval(fetchSession, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [id, user]);

  useEffect(() => {
    if (user?.uid) {
      // Fetch saved phrases from teacher document - one time fetch at start
      getDoc(doc(db, 'users', user.uid)).then(snap => {
        if (snap.exists()) {
          setSavedPhrases(snap.data().savedPhrases || []);
        }
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!id || !user) return;
    const fetchMission = async () => {
      try {
        const d = await getDoc(doc(db, 'quizzes', id));
        if (d.exists()) {
          setMission({ id, ...d.data() });
        } else {
          navigate('/teacher/missions');
        }
      } catch (e) {
        errorService.handle(e, 'Fetch Mission');
      }
    };
    fetchMission();

    const unsubQ = onSnapshot(collection(db, `quizzes/${id}/questions`), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubQ();
  }, [id, user, navigate]);

  useEffect(() => {
    const handler = (q: any) => {
      setQuestionToSave(q);
      setShowSaveToBank(true);
    };
    const batchHandler = (qs: any[]) => {
      setQuestionToSave({ isBatch: true, questions: qs });
      setShowSaveToBank(true);
    };
    (window as any).dispatchSaveToBank = handler;
    (window as any).dispatchSaveBatchToBank = batchHandler;
    return () => { 
      (window as any).dispatchSaveToBank = undefined; 
      (window as any).dispatchSaveBatchToBank = undefined;
    };
  }, []);

  const saveSettings = async () => {
    if (!mission || !id) return;
    
    // Validation
    if (!mission.title.trim()) {
      playSound.warning();
      notify('La misión debe tener un título.', 'warning');
      return;
    }
    
    if (mission.status === 'PUBLISHED' && questions.length === 0) {
      playSound.warning();
      notify('No puedes publicar una misión sin preguntas.', 'warning');
      return;
    }

    setSaving(true);
    playSound.click();
    try {
      if (mission.customPhrase && !savedPhrases.includes(mission.customPhrase)) {
        const newPhrases = [mission.customPhrase, ...savedPhrases].slice(0, 15);
        await updateDoc(doc(db, 'users', user!.uid), { savedPhrases: newPhrases });
      }

      await updateDoc(doc(db, 'quizzes', id), {
        title: mission.title,
        type: mission.type, 
        maxEntriesPerStudent: parseInt(mission.maxEntriesPerStudent) || 1,
        maxCompletionsPerStudent: parseInt(mission.maxCompletionsPerStudent) || 1,
        chancesPerQuestion: parseInt(mission.chancesPerQuestion) || 1,
        questionsPerAttempt: parseInt(mission.questionsPerAttempt) || questions.length,
        evaluationType: mission.evaluationType || 'HIGHEST',
        isOpen: mission.isOpen || false,
        showFeedback: mission.showFeedback ?? true,
        status: mission.status || 'DRAFT',
        groupId: mission.groupId || null,
        subjectId: mission.subjectId || null,
        assignedUserIds: mission.assignedUserIds || [],
        assignedGroupIds: mission.assignedGroupIds || [],
        durationMinutes: parseInt(mission.durationMinutes) || 60,
        availableFrom: mission.availableFrom || null,
        availableTo: mission.availableTo || null,
        customLogoUrl: mission.customLogoUrl || null,
        customPhrase: mission.customPhrase || null,
        difficulty: mission.difficulty || 'MEDIUM',
        enableAiFeedback: mission.enableAiFeedback || false
      });
      playSound.success();
      notify('Sincronización con la nube completada.', 'success');
    } catch (e) {
      playSound.error();
      errorService.handle(e, 'Save Mission Settings');
    }
    setSaving(false);
  };

  const handleImportedQuestions = async (importedQs: any[]) => {
    if (!id) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      for (const q of importedQs) {
         // Create a copy of the question for the specific quiz
         const qRef = doc(collection(db, `quizzes/${id}/questions`));
         batch.set(qRef, {
           quizId: id,
           text: q.text,
           type: q.type,
           options: q.options,
           correctAnswer: q.correctAnswer,
           explanation: q.explanation || '',
           points: q.points || 10,
           difficulty: q.difficulty || 'MEDIUM',
           topic: q.topic || '',
           subtopic: q.subtopic || '',
           mediaUrl: q.mediaUrl || '',
           createdAt: Date.now()
         });
      }
      await batch.commit();
      await updateDoc(doc(db, 'quizzes', id), {
        questionsCount: questions.length + importedQs.length
      });
      notify(`${importedQs.length} reactivos importados con éxito.`, 'success');
    } catch (e) {
      errorService.handle(e, 'Import Questions');
    } finally {
      setSaving(false);
    }
  };

  const handleRandomImport = async (filters: any) => {
    if (!id || !user) return;
    setSaving(true);
    try {
       const qRef = collection(db, 'library_questions');
       let fireQuery = query(qRef, where('teacherId', '==', user.uid));
       
       if (filters.subjectId) {
          fireQuery = query(fireQuery, where('subjectId', '==', filters.subjectId));
       }
       if (filters.difficulty !== 'ALL') {
          fireQuery = query(fireQuery, where('difficulty', '==', filters.difficulty));
       }

       const snap = await getDocs(fireQuery);
       let allQs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

       // Search filter if topic exists
       if (filters.topic) {
          allQs = allQs.filter((q: any) => 
             q.text.toLowerCase().includes(filters.topic.toLowerCase()) ||
             q.topic?.toLowerCase().includes(filters.topic.toLowerCase())
          );
       }

       // Pick random
       const shuffled = allQs.sort(() => 0.5 - Math.random());
       const selected = shuffled.slice(0, filters.count);

       if (selected.length === 0) {
          notify('No se encontraron reactivos con esos filtros en tu biblioteca.', 'warning');
          return;
       }

       await handleImportedQuestions(selected);
       setShowRandomImport(false);
    } catch (err) {
       errorService.handle(err, 'Random Import');
    } finally {
       setSaving(false);
    }
  };

  const moveQuestion = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return;
    
    setSaving(true);
    try {
      const sorted = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0));
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      const q1 = sorted[index];
      const q2 = sorted[targetIndex];
      
      const batch = writeBatch(db);
      batch.update(doc(db, `quizzes/${id}/questions`, q1.id), { order: q2.order || targetIndex });
      batch.update(doc(db, `quizzes/${id}/questions`, q2.id), { order: q1.order || index });
      
      await batch.commit();
      playSound.powerUp();
    } catch (e) {
      errorService.handle(e, 'Move Question');
    } finally {
      setSaving(false);
    }
  };

  const addQuestionByType = async (type: string) => {
    if (!id) return;
    playSound.click();
    try {
      const questionData: any = {
        quizId: id,
        text: type === 'IDENTIFIER_IMAGE' ? 'Identifica el elemento' : (type === 'MEMORAMA_PAIR' ? 'Encuentra el par' : ''), 
        type: type,
        options: type === 'IDENTIFIER_IMAGE' ? [] : (type === 'MEMORAMA_PAIR' ? [] : (type === 'TRUE_FALSE' ? ['Verdadero', 'Falso'] : ['', '', '', ''])),
        correctAnswer: '',
        explanation: '',
        points: 10,
        mediaUrl: '',
        topic: '',
        difficulty: 'MEDIUM',
        createdAt: Date.now(),
        order: questions.length
      };

      if (type === 'MEMORAMA_PAIR') {
        questionData.itemA = { type: 'TEXT', content: '' };
        questionData.itemB = { type: 'TEXT', content: '' };
      }

      await addDoc(collection(db, `quizzes/${id}/questions`), questionData);
      await updateDoc(doc(db, 'quizzes', id), {
        questionsCount: questions.length + 1
      });
      playSound.powerUp();
      notify('Reactivo creado con éxito.', 'success');
    } catch(e) {
      errorService.handle(e, 'Add Question');
    }
  };

  const handleBulkQuestionsAdd = async () => {
    if (!bulkQuestionsData.trim() || !id) return;
    setIsProcessingBulkQuestions(true);
    try {
      const lines = bulkQuestionsData.split('\n');
      const batch = writeBatch(db);
      let count = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        // Format: Pregunta, Opcion1|Opcion2|Opcion3|Opcion4, Correcta, Puntos
        const parts = line.split(',').map(s => s?.trim());
        if (parts.length < 3) continue;

        const [text, optionsRaw, correct, pts] = parts;
        if (!text || !optionsRaw || !correct) continue;

        const options = optionsRaw.split('|').map(o => o.trim());
        const points = parseInt(pts) || 10;

        const qRef = doc(collection(db, `quizzes/${id}/questions`));
        batch.set(qRef, {
          quizId: id,
          text,
          type: 'MULTIPLE_CHOICE',
          options,
          correctAnswer: correct,
          points,
          createdAt: Date.now(),
          order: questions.length + count
        });
        count++;
      }

      await batch.commit();
      await updateDoc(doc(db, 'quizzes', id), {
        questionsCount: (mission?.questionsCount || 0) + count
      });

      setShowBulkQuestions(false);
      setBulkQuestionsData('');
      notify(`${count} preguntas importadas con éxito.`, 'success');
      playSound.powerUp();
    } catch (e) {
      errorService.handle(e, 'Bulk Questions');
    } finally {
      setIsProcessingBulkQuestions(false);
    }
  };

  if (!mission) return <div className="p-12 text-center">Cargando misión...</div>;

  const sortedQuestions = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/teacher/missions')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{mission.title}</h1>
          <p className="text-muted-foreground text-sm">Modo de juego: {mission.type}</p>
        </div>
        <Button variant="outline" onClick={() => setShowPreview(true)} className="border-neon-blue text-neon-blue font-bold">
          <Play className="w-4 h-4 mr-2" /> VISTA PREVIA
        </Button>
        {activeSessionId && (
          <Button 
            onClick={() => navigate(`/teacher/monitor/${activeSessionId}`)} 
            className="bg-neon-purple hover:bg-neon-purple/80 text-white font-bold ml-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-pulse"
          >
            <Users className="w-4 h-4 mr-2" /> MONITOR EN VIVO
          </Button>
        )}
        <Button onClick={saveSettings} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold ml-2">
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Guardando...' : 'Guardar Todo'}
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1 border border-border bg-card/60 p-6 rounded-xl space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar sticky top-24">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Configuración</h2>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase italic transition-all ${
              new Set(questions.map(q => q.type)).size >= 3 
              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
              : 'bg-amber-500/10 border-amber-500/50 text-amber-500'
            }`}>
              {new Set(questions.map(q => q.type)).size >= 3 ? (
                <>⭐ Batería Óptima ({new Set(questions.map(q => q.type)).size} tipos)</>
              ) : (
                <>⚠️ Requiere +{3 - new Set(questions.map(q => q.type)).size} tipos</>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2 italic">Diferencia tu examen con al menos 3 tipos de reactivos para mayor validez pedagógica.</p>
          <div className="space-y-2">
            <Label>Título del Examen</Label>
            <Input value={mission.title} onChange={e => { playSound.hover(); setMission({...mission, title: e.target.value}); }} />
          </div>
          <div className="space-y-2">
            <Label>Tipo de Misión / Modo de Juego</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-neon-blue font-bold shadow-inner"
              value={mission.type} onChange={e => { playSound.selection(); setMission({...mission, type: e.target.value}); }}>
              <optgroup label="Síncrono Competitivo" className="text-neon-blue">
                <option value="A_LA_CIMA">🚀 A LA CIMA (INDIVIDUAL)</option>
                <option value="POR_EQUIPOS">⚔️ DUELO DE ESCUADRONES</option>
                <option value="LA_TORRE">🏹 LA TORRE (COLABORATIVO)</option>
              </optgroup>
              <optgroup label="Formatos de Banco" className="text-neon-purple">
                <option value="CLASICO">📊 MODO CLÁSICO (BANCO)</option>
                <option value="IDENTIFICADOR">🔍 IDENTIFICADOR VISUAL</option>
                <option value="MEMORAMA">🃏 MEMORAMA COGNITIVO</option>
                <option value="EXAMEN">📝 EXAMEN TRADICIONAL</option>
                <option value="CUESTIONARIO">⚡ CUESTIONARIO RÁPIDO</option>
              </optgroup>
            </select>
          </div>
          <div className="space-y-2 flex items-center justify-between p-3 bg-secondary/20 rounded-lg border border-white/5">
            <Label className="cursor-pointer" htmlFor="isOpen">¿Examen Abierto?</Label>
            <input id="isOpen" type="checkbox" checked={mission.isOpen} onChange={e => { playSound.selection(); setMission({...mission, isOpen: e.target.checked}); }} className="w-5 h-5 accent-neon-blue cursor-pointer" />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black opacity-50">Grupo Objetivo</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-bold"
                value={mission.groupId || ''} onChange={e => { playSound.selection(); setMission({...mission, groupId: e.target.value}); }}>
                <option value="">Abierto a todos</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black opacity-50">Materia / Área</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-bold"
                value={mission.subjectId || ''} onChange={e => { playSound.selection(); setMission({...mission, subjectId: e.target.value}); }}>
                <option value="">Sin Materia</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-black opacity-50">Asignación Individual</Label>
              <Badge variant="outline" className="text-[8px] font-bold border-neon-blue text-neon-blue">
                {mission.assignedUserIds?.length || 0} Usuarios
              </Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full h-8 text-[10px] font-bold border-dashed border-white/20"
              onClick={() => setShowUserSelector(true)}
            >
              <Users className="w-3.5 h-3.5 mr-2" /> Gestionar Usuarios
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Estado de Publicación</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={mission.status} onChange={e => setMission({...mission, status: e.target.value})}>
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Duración del examen (minutos)</Label>
            <Input type="number" min="1" value={mission.durationMinutes || 60} onChange={e => setMission({...mission, durationMinutes: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Disponible desde</Label>
            <Input type="datetime-local" value={mission.availableFrom || ''} onChange={e => setMission({...mission, availableFrom: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Disponible hasta</Label>
            <Input type="datetime-local" value={mission.availableTo || ''} onChange={e => setMission({...mission, availableTo: e.target.value})} />
          </div>
          <div className="space-y-4 pt-4 border-t border-white/10">
             <h3 className="text-xs font-black uppercase text-neon-purple tracking-widest flex items-center gap-2">
               <LayoutGrid className="w-3 h-3" /> Vinculación Académica
             </h3>
             <div className="grid grid-cols-1 gap-3">
                <div className="p-4 bg-neon-purple/5 border border-neon-purple/20 rounded-xl space-y-3">
                   <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold">Distribución en el Mapa</Label>
                      <Badge variant="outline" className="text-[8px] border-neon-purple text-neon-purple uppercase italic">Plan 2024</Badge>
                   </div>
                   <div className="space-y-2">
                      <p className="text-[9px] text-white/50 leading-tight">Al vincular esta misión, los alumnos la verán organizada por asignatura en su tablero neural.</p>
                      <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1 bg-black/20 rounded-lg">
                         {subjects.filter(s => s.id === mission.subjectId).map(s => (
                           <Badge key={s.id} className="bg-neon-purple text-white text-[9px] px-2 py-0">
                             {s.name}
                           </Badge>
                         ))}
                         {groups.filter(g => g.id === mission.groupId).map(g => (
                           <Badge key={g.id} className="bg-neon-blue text-white text-[9px] px-2 py-0">
                             {g.name}
                           </Badge>
                         ))}
                         {!mission.subjectId && !mission.groupId && <span className="text-[10px] italic opacity-30 italic">Sin vinculación activa</span>}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/5">
             <h3 className="text-xs font-black uppercase text-neon-blue tracking-widest">Identidad Visual</h3>
             <div className="space-y-2">
               <Label className="text-[10px]">Logo de la Misión</Label>
               <div className="flex gap-2">
                 <Input 
                   placeholder="https://..." 
                   value={mission.customLogoUrl || ''} 
                   onChange={e => setMission({...mission, customLogoUrl: e.target.value})} 
                   className="h-8 text-xs bg-background/40 flex-1"
                 />
                 <AILogoButton quizTitle={mission.title} onGenerated={(url) => setMission({...mission, customLogoUrl: url})} />
               </div>
               <div className="flex gap-2 mt-1">
                  <Button 
                    variant="outline" 
                    size="xs" 
                    className="text-[8px] h-6"
                    onClick={() => setMission({...mission, customLogoUrl: 'https://i.imgur.com/vHqY7pX.png'})} // DGETAyCM logic-ish proxy or real if artifact
                  >DGETAyCM</Button>
                  <Button 
                    variant="outline" 
                    size="xs" 
                    className="text-[8px] h-6"
                    onClick={() => setMission({...mission, customLogoUrl: 'https://i.imgur.com/3pQY7wK.png'})} // CBTA#147 proxy
                  >CBTA#147</Button>
               </div>
             </div>
             <div className="space-y-2">
               <Label className="text-[10px]">Frase Personalizada</Label>
               <Input 
                 placeholder="Ej. ¡Éxito en tu evaluación!" 
                 value={mission.customPhrase || ''} 
                 onChange={e => setMission({...mission, customPhrase: e.target.value})} 
                 className="h-8 text-xs bg-background/40"
               />
             </div>
          </div>
          <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
               <div className="space-y-0.5">
                  <Label className="text-xs font-bold uppercase">Feedback Post-Misión</Label>
                  <p className="text-[9px] text-muted-foreground italic">Muestra respuestas correctas al finalizar</p>
               </div>
               <button 
                 onClick={() => setMission({...mission, showFeedback: !mission.showFeedback})}
                 className={`w-10 h-5 rounded-full transition-colors relative ${mission.showFeedback ? 'bg-neon-blue' : 'bg-secondary'}`}
               >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${mission.showFeedback ? 'left-6' : 'left-1'}`} />
               </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-neon-purple/5 rounded-xl border border-neon-purple/20">
               <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-bold uppercase">Explicaciones con IA</Label>
                    <Badge className="bg-neon-purple text-[8px] h-3 px-1">GROQ</Badge>
                  </div>
                  <p className="text-[9px] text-muted-foreground italic">Genera feedback personalizado tras cada respuesta</p>
               </div>
               <button 
                 onClick={() => setMission({...mission, enableAiFeedback: !mission.enableAiFeedback})}
                 className={`w-10 h-5 rounded-full transition-colors relative ${mission.enableAiFeedback ? 'bg-neon-purple' : 'bg-secondary'}`}
               >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${mission.enableAiFeedback ? 'left-6' : 'left-1'}`} />
               </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dificultad de la Misión</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-neon-blue font-bold"
              value={mission.difficulty || 'MEDIUM'} onChange={e => { playSound.click(); setMission({...mission, difficulty: e.target.value}); }}>
              <option value="EASY">🟢 NIVEL FÁCIL (INTRODUCCIÓN)</option>
              <option value="MEDIUM">🟡 NIVEL MEDIO (CONSOLIDACIÓN)</option>
              <option value="HARD">🔴 NIVEL DIFÍCIL (DESAFÍO TOTAL)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Ingresos permitidos a la app (Intentos)</Label>
            <Input type="number" min="1" value={mission.maxEntriesPerStudent || 1} onChange={e => setMission({...mission, maxEntriesPerStudent: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Completar examen (Veces máximo)</Label>
            <Input type="number" min="1" value={mission.maxCompletionsPerStudent || 1} onChange={e => setMission({...mission, maxCompletionsPerStudent: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Chances de responder (por pregunta)</Label>
            <Input type="number" min="1" max="3" value={mission.chancesPerQuestion || 1} onChange={e => setMission({...mission, chancesPerQuestion: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Preguntas por intento (Azar del banco)</Label>
            <Input type="number" min="1" max={questions.length} value={mission.questionsPerAttempt || questions.length} onChange={e => setMission({...mission, questionsPerAttempt: e.target.value})} />
            <p className="text-[10px] text-muted-foreground italic">Total en banco: {questions.length} preguntas.</p>
          </div>
          <div className="space-y-2">
            <Label>Método de Evaluación Múltiple</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={mission.evaluationType} onChange={e => setMission({...mission, evaluationType: e.target.value})}>
              <option value="HIGHEST">Calificación más alta</option>
              <option value="AVERAGE">Promedio</option>
              <option value="FIRST">Primer intento</option>
            </select>
          </div>
        </div>

        <div className="lg:col-span-2 border border-border bg-card/60 p-6 rounded-xl space-y-6 flex flex-col max-h-[85vh]">
          <div className="flex justify-between items-center">
             <h2 className="text-xl font-bold">Cuestionario</h2>
             <div className="flex flex-wrap gap-2 justify-end">
               <Button 
                variant="outline" 
                size="sm"
                className="h-9 border-emerald-500/30 text-emerald-500 text-[9px] font-black uppercase italic gap-1.5"
                onClick={() => {
                  if (questions.length === 0) {
                    notify('No hay preguntas para guardar.', 'warning');
                    return;
                  }
                  (window as any).dispatchSaveBatchToBank?.(questions);
                }}
               >
                 <Save className="w-3.5 h-3.5" /> Guardar Todo
               </Button>
               <AIGenerationButton quizId={id as string} quizTitle={mission.title} difficulty={mission.difficulty || 'MEDIUM'} onGenerated={() => {}} />
               <Button 
                variant="outline" 
                size="sm"
                className="h-9 border-neon-blue/30 text-neon-blue text-[9px] font-black uppercase italic gap-1.5"
                onClick={() => setShowLibrarySelector(true)}
               >
                 <BookMarked className="w-3.5 h-3.5" /> Biblioteca
               </Button>
               <Button 
                variant="outline" 
                size="sm"
                className="h-9 border-neon-purple/30 text-neon-purple text-[9px] font-black uppercase italic gap-1.5"
                onClick={() => setShowRandomImport(true)}
               >
                 <Wand2 className="w-3.5 h-3.5" /> Aleatorio
               </Button>
               <select 
                 onChange={(e) => {
                   if (e.target.value) {
                     addQuestionByType(e.target.value);
                     e.target.value = '';
                   }
                 }}
                 className="h-9 rounded-md border border-neon-blue/30 bg-background px-3 text-[9px] font-black uppercase italic text-neon-blue focus:ring-neon-blue"
               >
                 <option value="">+ AÑADIR REACTIVO</option>
                 <option value="MULTIPLE_CHOICE">OPCIÓN MÚLTIPLE</option>
                 <option value="TRUE_FALSE">VERDADERO / FALSO</option>
                 <option value="SHORT_ANSWER">RESPUESTA CORTA</option>
                 <option value="IDENTIFIER_IMAGE">IDENTIFICADOR VISUAL</option>
                 <option value="MEMORAMA_PAIR">PAR DE MEMORAMA</option>
               </select>
             </div>
          </div>

          <div className="space-y-6 overflow-y-auto pr-2 pb-12 flex-1 scroll-smooth">
            <AnimatePresence mode="popLayout">
              {sortedQuestions.map((q, i) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <GenericQuestionItem 
                    index={i} 
                    question={q} 
                    quizId={id as string} 
                    onMoveUp={() => moveQuestion(i, 'up')}
                    onMoveDown={() => moveQuestion(i, 'down')}
                    isFirst={i === 0}
                    isLast={i === sortedQuestions.length - 1}
                    totalQuestions={sortedQuestions.length}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {sortedQuestions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                No hay preguntas en esta misión. Agrega preguntas manualmente o desde la biblioteca (la IA está desactivada temporalmente).
              </div>
            )}
          </div>
        </div>
      </div>
      <QuestionLibrarySelector 
        isOpen={showLibrarySelector} 
        onClose={() => setShowLibrarySelector(false)}
        onSelectQuestions={handleImportedQuestions}
      />
      <RandomImportDialog 
        isOpen={showRandomImport}
        onClose={() => setShowRandomImport(false)}
        onImport={handleRandomImport}
        subjects={subjects}
      />
      <SaveToBankDialog
        isOpen={showSaveToBank}
        onClose={() => setShowSaveToBank(false)}
        question={questionToSave}
        subjects={subjects}
      />
      <UserSelectorDialog 
        isOpen={showUserSelector}
        onClose={() => setShowUserSelector(false)}
        selectedIds={mission.assignedUserIds || []}
        onToggleUser={(uid: string) => {
          const current = mission.assignedUserIds || [];
          const updated = current.includes(uid) ? current.filter((id: string) => id !== uid) : [...current, uid];
          setMission({ ...mission, assignedUserIds: updated });
        }}
        mission={mission}
        setMission={setMission}
      />
      
      <Dialog open={showBulkQuestions} onOpenChange={setShowBulkQuestions}>
        <DialogContent className="max-w-2xl bg-black/90 border-amber-500 border shadow-[0_0_50px_rgba(245,158,11,0.3)]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic text-amber-500 flex items-center gap-2">
              <Upload className="w-5 h-5" /> CARGA MASIVA DE REACTIVOS (CSV)
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs uppercase tracking-widest leading-relaxed pt-2">
              Formato: <span className="text-neon-blue font-bold">Pregunta, Opcion1|Opcion2|Opcion3|Opcion4, Correcta, Puntos</span>
              <br/>
              * La respuesta correcta debe coincidir exactamente con una de las opciones.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              className="w-full h-64 bg-secondary/20 border border-white/10 rounded-xl p-4 font-mono text-xs focus:ring-1 focus:ring-amber-500 outline-none"
              placeholder="Ejemplo:&#10;¿Cuánto es 2+2?, 3|4|5|6, 4, 10&#10;¿Capital de Francia?, Madrid|París|Londres|Roma, París, 15"
              value={bulkQuestionsData}
              onChange={(e) => setBulkQuestionsData(e.target.value)}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowBulkQuestions(false)} disabled={isProcessingBulkQuestions}>CANCELAR</Button>
            <Button 
              onClick={handleBulkQuestionsAdd} 
              disabled={isProcessingBulkQuestions || !bulkQuestionsData.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-black font-black italic px-8"
            >
              {isProcessingBulkQuestions ? 'PROCESANDO...' : 'INICIAR IMPORTACIÓN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPreview && (
        <MissionPreview 
          type={mission.type} 
          onClose={() => setShowPreview(false)} 
        />
      )}
    </div>
  );
}

function UserSelectorDialog({ isOpen, onClose, selectedIds, onToggleUser, mission, setMission }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const { groups } = useSubjectsGroupsStore();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'INDIVIDUAL' | 'GROUPS' | 'SCHEDULE'>('INDIVIDUAL');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const q = query(collection(db, 'users'), where('role', '==', 'STUDENT'));
      getDocs(q).then(snap => {
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }).catch(e => {
        console.error(e);
        setLoading(false);
      });
    }
  }, [isOpen]);

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.matricula?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleGroup = (groupId: string) => {
    const current = mission.assignedGroupIds || [];
    const updated = current.includes(groupId) ? current.filter((id: string) => id !== groupId) : [...current, groupId];
    setMission({ ...mission, assignedGroupIds: updated });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-neon-blue bg-card/90 backdrop-blur-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neon-blue">
            <Users className="w-5 h-5" /> PANEL DE ASIGNACIÓN
          </DialogTitle>
          <DialogDescription className="text-[10px] uppercase font-mono opacity-50">Gestiona quiénes y cuándo acceden a esta misión</DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-2 p-1 bg-secondary/20 rounded-lg my-2">
            {[
              { id: 'INDIVIDUAL', label: 'Alumnos', icon: Users },
              { id: 'GROUPS', label: 'Grupos', icon: LayoutGrid },
              { id: 'SCHEDULE', label: 'Horarios', icon: Target },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[9px] font-black uppercase transition-all ${
                  tab === t.id ? 'bg-neon-blue text-black shadow-lg shadow-neon-blue/20' : 'text-muted-foreground hover:bg-white/5'
                }`}
              >
                <t.icon className="w-3 h-3" /> {t.label}
              </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar my-2">
          {tab === 'INDIVIDUAL' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                <Input 
                  placeholder="Buscar por nombre o matrícula..." 
                  className="pl-10 h-10 text-xs bg-background/50 border-white/10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {loading ? (
                  <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center p-8 opacity-40 italic text-xs">No se encontraron alumnos</div>
                ) : (
                  filteredUsers.map(u => (
                    <div 
                      key={u.id} 
                      onClick={() => onToggleUser(u.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedIds.includes(u.id) 
                        ? 'bg-neon-blue/10 border-neon-blue shadow-[0_0_10px_rgba(0,255,255,0.1)]' 
                        : 'bg-secondary/20 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-black border border-white/5">
                           {u.displayName?.slice(0,2).toUpperCase()}
                         </div>
                         <div>
                            <p className="text-xs font-bold leading-tight">{u.displayName}</p>
                            <p className="text-[9px] font-mono opacity-40 uppercase">{u.matricula || u.email || 'Invitado'}</p>
                         </div>
                      </div>
                      {selectedIds.includes(u.id) && <Check className="w-4 h-4 text-neon-blue" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'GROUPS' && (
            <div className="space-y-3">
              {groups.length === 0 ? (
                <div className="text-center p-8 opacity-40 italic text-xs">No hay grupos configurados</div>
              ) : (
                groups.map(g => (
                  <div 
                    key={g.id} 
                    onClick={() => toggleGroup(g.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      (mission.assignedGroupIds || []).includes(g.id) 
                      ? 'bg-neon-purple/10 border-neon-purple shadow-[0_0_10px_rgba(188,19,254,0.1)]' 
                      : 'bg-secondary/20 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                         <LayoutGrid className={`w-5 h-5 ${(mission.assignedGroupIds || []).includes(g.id) ? 'text-neon-purple' : 'opacity-40'}`} />
                       </div>
                       <div>
                          <p className="text-sm font-bold">{g.name}</p>
                          <p className="text-[9px] font-mono opacity-40 uppercase tracking-widest">{(g as any).studentCount || 0} ALUMNOS REGISTRADOS</p>
                       </div>
                    </div>
                    {(mission.assignedGroupIds || []).includes(g.id) && <Check className="w-4 h-4 text-neon-purple" />}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'SCHEDULE' && (
            <div className="space-y-6 pt-2">
               <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                     <Target className="w-4 h-4 text-neon-blue" />
                     <h4 className="text-[10px] font-black uppercase tracking-widest">Ventana de Disponibilidad</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-4 bg-secondary/10 p-4 rounded-xl border border-white/5">
                     <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold uppercase opacity-60">Hora de Apertura (Nivel Nacional)</Label>
                        <Input 
                          type="datetime-local" 
                          value={mission.availableFrom || ''} 
                          onChange={e => setMission({...mission, availableFrom: e.target.value})}
                          className="bg-transparent border-white/10 text-xs font-mono"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold uppercase opacity-60">Hora de Cierre (Límite)</Label>
                        <Input 
                          type="datetime-local" 
                          value={mission.availableTo || ''} 
                          onChange={e => setMission({...mission, availableTo: e.target.value})}
                          className="bg-transparent border-white/10 text-xs font-mono"
                        />
                     </div>
                  </div>
               </div>

               <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                     <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Tiempo de Resolución</h4>
                     </div>
                     <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">{mission.durationMinutes || 60} MIN</Badge>
                  </div>
                  <div className="px-2">
                     <input 
                       type="range" 
                       min="5" 
                       max="180" 
                       step="5"
                       value={mission.durationMinutes || 60}
                       onChange={e => setMission({...mission, durationMinutes: parseInt(e.target.value)})}
                       className="w-full accent-emerald-500 bg-secondary rounded-full h-1.5 cursor-pointer"
                     />
                     <div className="flex justify-between mt-2 text-[8px] font-mono opacity-40 uppercase tracking-tighter">
                        <span>5 MIN</span>
                        <span>EXAMEN ESTÁNDAR (60M)</span>
                        <span>3 HORAS</span>
                     </div>
                  </div>
               </div>
               
               <div className="p-4 bg-neon-blue/5 border border-neon-blue/20 rounded-xl">
                  <p className="text-[10px] font-bold text-neon-blue uppercase italic flex items-center gap-2">
                     <ShieldAlert className="w-3 h-3" /> Nota Crítica
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-1 leading-tight">
                    La misión se cerrará automáticamente para todos los alumnos asignados al cumplirse la hora de cierre, independientemente de si aún tienen tiempo restante en su cronómetro individual.
                  </p>
               </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose} className="w-full bg-neon-blue text-black font-black uppercase italic h-12 shadow-lg shadow-neon-blue/20">
            CONFIRMAR ASIGNACIONES ({selectedIds.length + (mission.assignedGroupIds?.length || 0)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GenericQuestionItem = ({ 
  index, 
  question, 
  quizId,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  totalQuestions
}: { 
  index: number; 
  question: any; 
  quizId: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  totalQuestions: number;
}) => {
  return (
    <Card className="relative group/card overflow-hidden border-border/40 hover:border-neon-blue/40 transition-all duration-300">
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-border/20 to-transparent" />
      
      {/* Reordering Controls (Desktop) */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity hidden md:flex z-10">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 rounded-full hover:bg-neon-blue/10 hover:text-neon-blue"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 rounded-full hover:bg-neon-blue/10 hover:text-neon-blue"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>

      <div className="md:pl-10">
        {question.type === 'IDENTIFIER_IMAGE' ? (
          <ImageIdentifierItem 
            index={index} 
            question={question} 
            quizId={quizId} 
          />
        ) : question.type === 'MEMORAMA_PAIR' ? (
          <MemoramaPairItem 
            index={index} 
            pair={question} 
            quizId={quizId} 
          />
        ) : (
          <QuestionEditor index={index} question={question} quizId={quizId} />
        )}
      </div>

      {/* Reordering Controls (Mobile) */}
      <div className="flex justify-center gap-4 p-2 bg-muted/30 md:hidden border-t">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 gap-2 text-[10px] font-bold"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <ChevronUp className="w-3 h-3" /> SUBIR
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 gap-2 text-[10px] font-bold"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <ChevronDown className="w-3 h-3" /> BAJAR
        </Button>
      </div>
    </Card>
  );
};

function QuestionEditor({ index, question, quizId }: { key?: React.Key, index: number, question: any, quizId: string }) {
  const [q, setQ] = useState(question);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setQ(question);
    setHasChanges(false);
  }, [question]);

  const saveQ = async () => {
    playSound.click();
    try {
      await updateDoc(doc(db, `quizzes/${quizId}/questions`, q.id), {
        text: q.text,
        type: q.type,
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        points: q.points || 10,
        topic: q.topic || '',
        difficulty: q.difficulty || 'MEDIUM'
      });
      setHasChanges(false);
      playSound.success();
      notify('Reactivo actualizado.', 'success');
    } catch (e) {
      playSound.error();
      errorService.handle(e, 'Save Question');
    }
  };

  const handleSaveToBank = () => {
    // We need to pass the state setter from the parent or use a context, 
    // but MissionBuilder is a single file, so we can use a custom event or property.
    // For simplicity, I'll assume we can use a window event or just lift the state if I were refactoring.
    // Actually, I can pass a prop to QuestionEditor.
    (window as any).dispatchSaveToBank?.(q);
  };

  const deleteQ = async () => {
    playSound.warning();
    if (!confirm('¿Eliminar esta pregunta?')) return;
    playSound.delete();
    try {
      await deleteDoc(doc(db, `quizzes/${quizId}/questions`, q.id));
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) {
        await updateDoc(doc(db, 'quizzes', quizId), {
           questionsCount: Math.max(0, (quizDoc.data().questionsCount || 1) - 1)
        });
      }
    } catch (e) {
      errorService.handle(e, 'Delete Question');
    }
  };

  const handleUpdate = (updates: any) => {
    setQ((prev: any) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  return (
    <div className={`group/card p-6 rounded-2xl border transition-all duration-500 overflow-hidden relative ${
      hasChanges ? 'border-neon-blue bg-neon-blue/5 shadow-[0_0_20px_rgba(0,255,255,0.1)]' : 'border-white/5 bg-secondary/10 hover:bg-secondary/20 h-max'
    }`}>
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover/card:opacity-20 transition-opacity">
         <Sigma className="w-20 h-20" />
      </div>

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-neon-blue to-neon-purple p-[1px]">
             <div className="w-full h-full rounded-[11px] bg-black flex items-center justify-center text-xs font-black italic shadow-lg">
               {index + 1}
             </div>
          </div>
          <div>
            <h4 className="font-black text-sm tracking-tight uppercase italic text-white/90">Matriz de Interrogante</h4>
            <select 
              className="mt-1 bg-transparent border-none text-[10px] text-neon-blue font-bold uppercase p-0 h-4 focus:ring-0 cursor-pointer hover:underline"
              value={q.type}
              onChange={e => handleUpdate({ 
                type: e.target.value,
                options: e.target.value === 'TRUE_FALSE' ? ['Verdadero', 'Falso'] : (e.target.value === 'MULTIPLE_CHOICE' ? ['', '', '', ''] : (e.target.value === 'MEMORAMA_PAIR' ? ['', ''] : []))
              })}
            >
               <option value="MULTIPLE_CHOICE" className="bg-black text-white">Opción Múltiple</option>
               <option value="TRUE_FALSE" className="bg-black text-white">Verdadero / Falso (Sí/No)</option>
               <option value="SHORT_ANSWER" className="bg-black text-white">Respuesta Corta / Identificación</option>
               <option value="IDENTIFIER_IMAGE" className="bg-black text-white">Identificador por Imagen</option>
               <option value="MEMORAMA_PAIR" className="bg-black text-white">Par de Memorama (Concepto-Relación)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
           {hasChanges && (
             <Button 
               size="sm" 
               className="h-8 bg-emerald-500 hover:bg-emerald-600 font-bold text-[10px] uppercase italic animate-bounce shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
               onClick={saveQ}
             >
               <Save className="w-3 h-3 mr-1" /> Sincronizar
             </Button>
           )}
           <Button size="icon" variant="ghost" className="h-8 w-8 text-neon-blue hover:bg-neon-blue/10 opacity-30 group-hover/card:opacity-100 transition-opacity" onClick={handleSaveToBank} title="Guardar en Biblioteca">
             <BookMarked className="w-4 h-4" />
           </Button>
           <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 opacity-30 group-hover/card:opacity-100 transition-opacity" onClick={deleteQ}>
             <Trash2 className="w-4 h-4" />
           </Button>
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        <div className="relative group/input">
           <div className="absolute -left-2 top-0 bottom-0 w-1 bg-neon-blue/40 rounded-full group-focus-within/input:bg-neon-blue transition-colors" />
           <Input 
             placeholder="Escribe la interrogante aquí..." 
             value={q.text} 
             onChange={e => handleUpdate({ text: e.target.value })} 
             className="text-base font-bold bg-white/5 border-none py-6 focus:ring-1 focus:ring-neon-blue placeholder:text-white/20"
           />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold opacity-60">Tema / Unidad</Label>
            <Input 
              value={q.topic} 
              onChange={e => handleUpdate({ topic: e.target.value })} 
              placeholder="Ej. Genética" 
              className="h-9 text-xs bg-background/30"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold opacity-60">Grado de Complejidad</Label>
            <select 
              className="flex h-9 w-full rounded-md border border-input bg-background/30 px-3 text-xs focus:ring-1 focus:ring-neon-blue transition-all" 
              value={q.difficulty} 
              onChange={e => handleUpdate({ difficulty: e.target.value })}
            >
               <option value="EASY">Nivel 1 (Fácil)</option>
               <option value="MEDIUM">Nivel 2 (Medio)</option>
               <option value="HARD">Nivel 3 (Difícil)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 mt-4 bg-black/20 p-4 rounded-xl border border-white/5 shadow-inner">
           <Label className="text-[9px] uppercase font-black text-neon-blue tracking-widest flex items-center gap-2">
             <Target className="w-3 h-3" /> {q.type === 'SHORT_ANSWER' ? 'Patrón de Respuesta' : 'Banco de Respuestas'}
           </Label>
           {q.type === 'SHORT_ANSWER' ? (
             <div className="space-y-2">
                <Input 
                  value={q.correctAnswer} 
                  onChange={e => handleUpdate({ correctAnswer: e.target.value })}
                  placeholder="Escribe la respuesta exacta esperada..."
                  className="bg-background/20 border-border/30 h-10 font-bold"
                />
                <p className="text-[8px] text-muted-foreground opacity-50 italic">El alumno deberá coincidir con este texto para obtener los puntos.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(q.options || (q.type === 'TRUE_FALSE' ? ['Verdadero', 'Falso'] : ['', '', '', ''])).map((opt: string, optIdx: number) => (
                  <div key={optIdx} className={`flex gap-2 items-center p-2 rounded-lg border transition-all ${
                    q.correctAnswer === opt && opt !== '' ? 'bg-neon-blue/10 border-neon-blue' : 'bg-background/20 border-border/30'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleUpdate({ correctAnswer: opt })}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        q.correctAnswer === opt && opt !== '' 
                        ? 'bg-neon-blue border-white shadow-[0_0_8px_rgba(0,255,255,0.5)]' 
                        : 'border-muted-foreground/30 hover:border-neon-blue/50'
                      }`}
                    >
                      {q.correctAnswer === opt && opt !== '' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </button>
                    <textarea 
                      value={opt} 
                      onChange={e => {
                        const newOpts = [...q.options];
                        newOpts[optIdx] = e.target.value;
                        handleUpdate({ options: newOpts });
                      }} 
                      placeholder={`Respuesta ${optIdx + 1}`} 
                      className="flex-1 bg-transparent border-none focus-visible:ring-0 text-xs min-h-[40px] py-2 px-1 resize-none custom-scrollbar" 
                      readOnly={q.type === 'TRUE_FALSE'}
                    />
                  </div>
                ))}
             </div>
           )}
           {q.type !== 'SHORT_ANSWER' && <p className="text-[9px] text-muted-foreground italic text-center font-mono opacity-50">Pulsa el círculo para marcar la opción como correcta.</p>}
        </div>

        <div className="space-y-1 mt-2">
          <Label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-2">
            <BrainCircuit className="w-3 h-3 text-neon-purple" /> Justificación de Respuesta
          </Label>
          <Input 
            placeholder="Retroalimentación para el alumno..." 
            value={q.explanation} 
            onChange={e => handleUpdate({ explanation: e.target.value })} 
            className="h-9 text-xs bg-background/30 italic"
          />
        </div>
      </div>
    </div>
  );
}

function ImageIdentifierItem({ question, quizId, index }: { question: any, quizId: string, index: number }) {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateQ = async (updates: any) => {
    try {
      await updateDoc(doc(db, `quizzes/${quizId}/questions`, question.id), updates);
    } catch(e) {
      console.error(e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        updateQ({ mediaUrl: event.target?.result as string });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const addHotspot = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!question.mediaUrl || draggingIdx !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const newOptions = [...(question.options || [])];
    newOptions.push(JSON.stringify({ x, y, answer: '', type: 'TEXT' }));
    updateQ({ options: newOptions });
  };

  const updateHotspotData = (optIndex: number, field: string, value: any) => {
    const newOptions = [...(question.options || [])];
    const data = JSON.parse(newOptions[optIndex]);
    data[field] = value;
    newOptions[optIndex] = JSON.stringify(data);
    updateQ({ options: newOptions });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingIdx === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    
    // We update local state first if we wanted smooth movement, 
    // but for simplicity in this reactive pattern with Firestore, we update on release or use a debounced update.
    // However, the user asked to fix the functionality.
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingIdx === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    
    updateHotspotData(draggingIdx, 'x', x);
    updateHotspotData(draggingIdx, 'y', y);
    setDraggingIdx(null);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, optIndex: number | null = null, field: string = 'mediaUrl') => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (optIndex === null) {
          updateQ({ [field]: result });
        } else {
          updateHotspotData(optIndex, field, result);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const deleteHotspot = (optIndex: number) => {
    const newOptions = [...(question.options || [])];
    newOptions.splice(optIndex, 1);
    updateQ({ options: newOptions });
  };

  return (
    <div className="p-6 border border-border rounded-xl bg-card/50 shadow-md space-y-6">
      <div className="flex justify-between items-center mb-6 gap-4">
        <h3 className="text-lg font-bold italic uppercase tracking-tighter">Elemento {index + 1} - Identificación Espacial</h3>
        <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10" onClick={() => deleteDoc(doc(db, `quizzes/${quizId}/questions`, question.id))}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
           <Label className="text-[10px] font-black uppercase opacity-50">Base de la Prueba</Label>
           <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-[10px] font-bold" onClick={() => updateQ({ mediaType: 'IMAGE' })}>IMAGEN</Button>
              <Button variant="outline" size="sm" className="flex-1 text-[10px] font-bold" onClick={() => updateQ({ mediaType: 'TEXT' })}>TEXTO / EQ</Button>
           </div>
        </div>
        <div className="space-y-1">
           <Label className="text-[10px] font-black uppercase opacity-50">Instrucción Específica</Label>
           <Input value={question.text} onChange={e => updateQ({ text: e.target.value })} placeholder="Ej. Identifica las partes..." className="h-9 text-xs" />
        </div>
      </div>
      
      {(!question.mediaType || question.mediaType === 'IMAGE') && (
        <div className="space-y-4">
          {!question.mediaUrl ? (
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center relative overflow-hidden group hover:border-neon-blue transition-all">
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleMediaUpload(e)} />
              <div className="flex flex-col items-center gap-2 pointer-events-none group-hover:scale-110 transition-transform">
                <ImageIcon className="w-10 h-10 text-muted-foreground group-hover:text-neon-blue" />
                <span className="font-semibold text-lg">Subir imagen base</span>
                <p className="text-xs text-muted-foreground">Para colocar los puntos identificables</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col xl:flex-row gap-6">
              <div 
                ref={containerRef}
                className="flex-1 relative cursor-crosshair border border-border rounded-lg overflow-hidden h-max shadow-sm select-none" 
                onClick={addHotspot}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img src={question.mediaUrl} alt="Upload" className="w-full h-auto block pointer-events-none" />
                {(question.options || []).map((opt: string, i: number) => {
                  let data: any = {};
                  try { data = JSON.parse(opt); } catch(e){}
                  return (
                    <div 
                      key={i} 
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingIdx(i);
                      }}
                      className={`absolute w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing shadow-[0_0_15px_rgba(0,243,255,0.6)] z-20 ${
                        draggingIdx === i ? 'bg-neon-pink animate-pulse scale-125' : 'bg-neon-blue'
                      }`}
                      style={{ top: `${data.y}%`, left: `${data.x}%` }}
                    >
                      {i + 1}
                    </div>
                  );
                })}
                <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white font-mono pointer-events-none uppercase">Modo: Edición de Hotspots</div>
              </div>
              <div className="w-full xl:w-96 space-y-4">
                <div className="bg-card/60 p-4 rounded-xl border border-border shadow-inner">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-black text-xs uppercase italic tracking-widest text-neon-blue">Componentes (Arrastra p/ mover)</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-[8px] font-black" onClick={() => updateQ({ mediaUrl: '' })}>CAMBIAR IMAGEN</Button>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {(question.options || []).map((opt: string, i: number) => {
                      let data: any = {};
                      try { data = JSON.parse(opt); } catch(e){}
                      if (!data) return null;
                      return (
                        <div key={i} className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-2">
                          <div className="flex gap-2 items-center">
                            <span className="w-5 h-5 flex-shrink-0 bg-neon-blue rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm">{i + 1}</span>
                            <div className="flex-1 flex gap-1">
                               <select 
                                 className="h-7 bg-background border border-white/10 rounded px-1 text-[9px] font-bold"
                                 value={data.type || 'TEXT'}
                                 onChange={e => updateHotspotData(i, 'type', e.target.value)}
                               >
                                  <option value="TEXT">TEXTO</option>
                                  <option value="MATH">ECUACIÓN</option>
                                  <option value="IMAGE">IMAGEN</option>
                                  <option value="AUDIO">AUDIO</option>
                               </select>
                               <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteHotspot(i)}>
                                 <Trash2 className="w-3 h-3" />
                               </Button>
                            </div>
                          </div>
                          
                          {data.type === 'TEXT' || !data.type ? (
                            <Input 
                              value={data.answer || ''}
                              onChange={(e) => updateHotspotData(i, 'answer', e.target.value)}
                              placeholder="Nombre del componente..."
                              className="h-8 text-xs bg-background/50"
                            />
                          ) : data.type === 'MATH' ? (
                            <div className="space-y-2">
                               <Input 
                                 value={data.answer || ''}
                                 onChange={(e) => updateHotspotData(i, 'answer', e.target.value)}
                                 placeholder="Fórmula en LaTeX..."
                                 className="h-8 text-[10px] font-mono bg-background/50"
                               />
                               {data.answer && (
                                 <div className="p-2 bg-black/40 rounded border border-white/5 flex justify-center scale-75 origin-top">
                                   <InlineMath math={data.answer} />
                                 </div>
                               )}
                            </div>
                          ) : data.type === 'IMAGE' ? (
                            <div className="relative group/img h-20 bg-black/40 rounded border border-dashed border-white/10 flex items-center justify-center overflow-hidden">
                               {data.answer ? (
                                 <>
                                   <img src={data.answer} className="w-full h-full object-contain" />
                                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleMediaUpload(e, i, 'answer')} />
                                      <span className="text-[9px] font-black pointer-events-none">CAMBIAR</span>
                                   </div>
                                 </>
                               ) : (
                                 <>
                                   <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleMediaUpload(e, i, 'answer')} />
                                   <ImageIcon className="w-4 h-4 opacity-30" />
                                 </>
                               )}
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <div className="flex-1 relative h-8 bg-black/40 rounded border border-white/10 flex items-center justify-center overflow-hidden px-2">
                                 {data.answer ? (
                                   <>
                                     <Volume2 className="w-3 h-3 text-neon-blue animate-pulse" />
                                     <span className="text-[8px] truncate ml-1">AUDIO CARGADO</span>
                                     <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="audio/*" onChange={(e) => handleMediaUpload(e, i, 'answer')} />
                                   </>
                                 ) : (
                                   <>
                                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="audio/*" onChange={(e) => handleMediaUpload(e, i, 'answer')} />
                                      <span className="text-[8px] opacity-40">SUBIR AUDIO</span>
                                   </>
                                 )}
                              </div>
                              {data.answer && <audio src={data.answer} className="sr-only" />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(question.options || []).length === 0 && (
                      <div className="text-center py-4 text-[10px] text-muted-foreground italic border border-dashed border-border rounded-lg">
                        Haz click en la imagen para añadir un componente.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {question.mediaType === 'TEXT' && (
        <div className="space-y-4">
           <Label className="text-[10px] font-black uppercase opacity-50">Contenido Base (Texto o Ecuación Principal)</Label>
           <textarea 
             className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm font-medium focus:ring-1 focus:ring-neon-blue focus:outline-none placeholder:opacity-30"
             value={question.mediaUrl || ''}
             onChange={e => updateQ({ mediaUrl: e.target.value })}
             placeholder="Escribe el texto o código LaTeX aquí..."
           />
           {question.mediaUrl && (
             <div className="p-6 bg-secondary/20 rounded-xl border border-border flex items-center justify-center min-h-[100px]">
                <div className="prose prose-invert max-w-none text-center">
                   <InlineMath math={question.mediaUrl} />
                </div>
             </div>
           )}
           <div className="bg-card/60 p-4 rounded-xl border border-border shadow-inner">
              <h4 className="font-black text-xs uppercase italic tracking-widest text-neon-blue mb-4">Componentes a identificar en el texto</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {(question.options || []).map((opt: string, i: number) => {
                    let data: any = {};
                    try { data = JSON.parse(opt); } catch(e){}
                    return (
                      <div key={i} className="flex gap-2 items-center bg-black/20 p-2 rounded-lg border border-white/10">
                        <Input 
                          value={data.answer || ''} 
                          onChange={e => updateHotspotData(i, 'answer', e.target.value)}
                          placeholder="Fragmento a identificar..."
                          className="h-8 text-xs bg-background/50"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteHotspot(i)}>
                           <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                 })}
                 <Button variant="outline" size="sm" className="border-dashed h-12" onClick={() => {
                    const newOptions = [...(question.options || [])];
                    newOptions.push(JSON.stringify({ answer: '' }));
                    updateQ({ options: newOptions });
                 }}>
                    <Plus className="w-4 h-4 mr-2" /> Añadir Componente
                 </Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function AIGenerationButton({ quizId, quizTitle, difficulty = 'MEDIUM', onGenerated }: { quizId: string, quizTitle: string, difficulty?: 'EASY' | 'MEDIUM' | 'HARD', onGenerated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(5);
  const [topic, setTopic] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('review');
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'global'), (snap) => {
      if (snap.exists()) {
        setAiEnabled(snap.data().aiEnabled !== false);
      }
    });
  }, []);

  if (!aiEnabled) return null;

  const handleGenerate = async () => {
    if (!topic.trim()) {
      notify('Agrega temas específicos para una mejor precisión.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const templatePrompt = PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.prompt || '';
      const genType = selectedTemplate === 'exam' ? 'VARIED_BATTERY' : 'MULTIPLE_CHOICE';
      
      console.log(`[AI Generation] Requesting ${count} questions for "${quizTitle}" (Topic: ${topic}, Type: ${genType})`);
      
      const generated = await generateQuestionsAI(topic, count, genType, difficulty, quizTitle, templatePrompt);
      
      if (!generated || !Array.isArray(generated) || generated.length === 0) {
        throw new Error("La IA no devolvió reactivos válidos. Intenta con un tema diferente.");
      }

      const batch = writeBatch(db);
      generated.forEach((qData: any) => {
        const newRef = doc(collection(db, `quizzes/${quizId}/questions`));
        batch.set(newRef, { ...qData, quizId, createdAt: Date.now() });
      });
      await batch.commit();
      
      const qRef = doc(db, 'quizzes', quizId);
      const qSnap = await getDoc(qRef);
      if (qSnap.exists()) {
        await updateDoc(qRef, { questionsCount: (qSnap.data().questionsCount || 0) + generated.length });
      }
      
      onGenerated();
      setOpen(false);
      notify(`${generated.length} preguntas generadas con éxito.`, 'success');
      playSound.success();
    } catch (e: any) {
      console.error("[AI Generation Error]", e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      
      if (errorMsg.includes('quota')) {
        notify('Cuota de base de datos excedida. No se pueden guardar las preguntas.', 'error');
      } else {
        errorService.handle(e, 'Generate AI Questions');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-neon-pink hover:bg-neon-pink/80 text-white font-bold h-9 text-[10px] uppercase italic animate-pulse">
        <Sparkles className="w-3.5 h-3.5 mr-2" /> IA Magic Generate
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-neon-pink max-w-md bg-card/90 backdrop-blur-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neon-pink font-black italic uppercase">
              <Sparkles className="w-5 h-5" /> Generador IA Educativo
            </DialogTitle>
            <DialogDescription className="text-xs italic">
              Gemini analizará el título <strong>"{quizTitle}"</strong> y los temas que proporciones.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-black opacity-60">Plantilla de Contexto</Label>
              <select 
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value)}
                className="flex h-11 w-full rounded-md border border-neon-pink/20 bg-background/50 px-3 py-1 text-[10px] font-black uppercase focus:ring-1 focus:ring-neon-pink outline-none"
              >
                {PROMPT_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-black opacity-60">Temas Específicos (Subtemas)</Label>
              <Input 
                value={topic} 
                onChange={e => setTopic(e.target.value)} 
                placeholder="Ej. Glucólisis, Cadena de transporte..."
                className="bg-background/50 border-neon-pink/20 text-xs italic h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-black opacity-60">Cantidad</Label>
                <Input type="number" value={count} onChange={e => setCount(parseInt(e.target.value))} min={1} max={15} className="h-11 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-black opacity-60">Dificultad Base</Label>
                <div className="flex h-11 items-center px-4 bg-secondary/30 rounded-md border border-neon-pink/10 text-[10px] font-bold">
                  {difficulty === 'HARD' ? '🔴 ALTA' : difficulty === 'MEDIUM' ? '🟡 MEDIA' : '🟢 BÁSICA'}
                </div>
              </div>
            </div>

            <div className="p-3 bg-neon-pink/5 rounded-lg border border-neon-pink/10 text-[10px] italic text-muted-foreground opacity-70">
              {PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.prompt}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleGenerate} disabled={loading || !topic} className="w-full bg-neon-pink text-white font-black italic uppercase h-12 shadow-[0_0_20px_rgba(236,72,153,0.3)]">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> GENERANDO REACTIVOS...</> : 'REESCRIBIR REALIDAD (GENERAR)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AILogoButton({ quizTitle, onGenerated }: { quizTitle: string, onGenerated: (url: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'global'), (snap) => {
      if (snap.exists()) {
        setAiEnabled(snap.data().aiEnabled !== false);
      }
    });
  }, []);

  if (!aiEnabled) return null;
  
  const generateLogo = async () => {
    setLoading(true);
    playSound.click();
    try {
      const keywords = encodeURIComponent(`${quizTitle} neon minimalist logo futuristic`);
      const logoUrl = `https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=400&q=80`; // Specialized placeholder
      
      await new Promise(r => setTimeout(r, 2000));
      
      onGenerated(logoUrl);
      playSound.success();
      notify('Identidad visual generada por IA', 'success');
    } catch (e) {
      playSound.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={generateLogo} 
      disabled={loading}
      className={`h-8 border-neon-blue/30 text-neon-blue bg-neon-blue/5 hover:bg-neon-blue/10 font-bold ${loading ? 'animate-pulse' : ''}`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
      IA
    </Button>
  );
}

function MemoramaPairItem({ pair, quizId, index }: { pair: any, quizId: string, index: number }) {
  const updatePair = async (updates: any) => {
    await updateDoc(doc(db, `quizzes/${quizId}/questions`, pair.id), updates);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, itemKey: 'itemA' | 'itemB') => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const item = { ...pair[itemKey], content: event.target?.result as string };
        updatePair({ [itemKey]: item });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const renderItemEditor = (itemKey: 'itemA' | 'itemB', label: string) => {
    const item = pair[itemKey] || { type: 'TEXT', content: '' };
    
    return (
      <div className="flex-1 space-y-3 p-4 bg-black/20 rounded-xl border border-white/5">
        <div className="flex justify-between items-center">
           <Label className="text-[10px] font-black uppercase text-neon-blue/70">{label}</Label>
           <select 
             className="bg-transparent border-none text-[9px] font-bold uppercase focus:ring-0 cursor-pointer"
             value={item.type}
             onChange={e => updatePair({ [itemKey]: { ...item, type: e.target.value } })}
           >
              <option value="TEXT">Texto</option>
              <option value="IMAGE">Imagen</option>
              <option value="MATH">Ecuación</option>
              <option value="AUDIO">Audio</option>
           </select>
        </div>

        {item.type === 'TEXT' ? (
          <Input 
            value={item.content} 
            onChange={e => updatePair({ [itemKey]: { ...item, content: e.target.value } })} 
            placeholder="Escribe el concepto..."
            className="h-10 bg-background/50 text-xs"
          />
        ) : item.type === 'MATH' ? (
          <div className="space-y-2">
            <Input 
              value={item.content} 
              onChange={e => updatePair({ [itemKey]: { ...item, content: e.target.value } })} 
              placeholder="Fórmula LaTeX..."
              className="h-10 bg-black/50 text-[10px] font-mono border-neon-blue/20"
            />
            {item.content && (
              <div className="flex justify-center p-2 bg-neon-blue/5 rounded border border-neon-blue/10 scale-90">
                <InlineMath math={item.content} />
              </div>
            )}
          </div>
        ) : item.type === 'IMAGE' ? (
          <div className="h-32 border border-dashed border-white/10 rounded-lg relative overflow-hidden bg-secondary/10 group">
             {item.content ? (
               <>
                 <img src={item.content} className="w-full h-full object-contain" />
                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleMediaUpload(e, itemKey)} />
                    <span className="text-[10px] font-black text-white">REEMPLAZAR</span>
                 </div>
               </>
             ) : (
               <>
                 <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleMediaUpload(e, itemKey)} />
                 <div className="flex flex-col items-center gap-1 opacity-40">
                   <ImageIcon className="w-6 h-6" />
                   <span className="text-[8px] font-bold">SUBIR IMAGEN</span>
                 </div>
               </>
             )}
          </div>
        ) : (
          <div className="h-12 border border-white/10 rounded-lg relative overflow-hidden bg-secondary/10 flex items-center justify-between px-4 group">
             {item.content ? (
               <>
                 <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-neon-pink animate-pulse" />
                    <span className="text-[9px] font-bold">AUDIO CARGADO</span>
                 </div>
                 <Button variant="ghost" size="icon" className="h-6 w-6"><RefreshCw className="w-3 h-3" /></Button>
                 <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="audio/*" onChange={e => handleMediaUpload(e, itemKey)} />
               </>
             ) : (
               <>
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="audio/*" onChange={e => handleMediaUpload(e, itemKey)} />
                  <div className="flex items-center gap-2 opacity-40">
                    <FileAudio className="w-4 h-4" />
                    <span className="text-[9px] font-bold">SUBIR AUDIO</span>
                  </div>
               </>
             )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 border border-border rounded-2xl bg-card shadow-lg relative group overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-neon-blue opacity-30 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-lg bg-neon-blue/20 flex items-center justify-center text-[10px] font-black italic text-neon-blue border border-neon-blue/30">
              {index + 1}
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Configuración de Par</span>
        </div>
        <Button variant="ghost" size="icon" className="text-secondary-foreground/20 hover:text-red-500 hover:bg-red-500/10 transition-colors" onClick={() => deleteDoc(doc(db, `quizzes/${quizId}/questions`, pair.id))}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-4">
         <div className="flex gap-4 items-start">
            {renderItemEditor('itemA', 'Elemento A')}
            <div className="pt-10">
               <Target className="w-4 h-4 text-muted-foreground/30" />
            </div>
            {renderItemEditor('itemB', 'Elemento B')}
         </div>
      </div>
    </div>
  );
}

function RandomImportDialog({ isOpen, onClose, onImport, subjects }: any) {
  const [filters, setFilters] = useState({
    subjectId: '',
    topic: '',
    difficulty: 'ALL',
    count: 5
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-3xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-neon-purple flex items-center gap-2">
            <Wand2 className="w-5 h-5" /> Inyección de Reactivos al Azar
          </DialogTitle>
          <DialogDescription className="text-xs uppercase font-mono opacity-50">Selección automática basada en parámetros de biblioteca</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase">Materia Origen</Label>
            <select 
              className="flex h-10 w-full rounded-md border border-white/5 bg-secondary/30 px-3 text-sm focus:ring-neon-purple"
              value={filters.subjectId}
              onChange={e => setFilters({...filters, subjectId: e.target.value})}
            >
              <option value="">Cualquier Materia</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase">Tema/Filtro</Label>
            <Input 
              placeholder="EJ: CÉLULA"
              value={filters.topic}
              onChange={e => setFilters({...filters, topic: e.target.value})}
              className="bg-secondary/30 border-white/5 h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Dificultad</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-white/5 bg-secondary/30 px-3 text-sm focus:ring-neon-purple"
                value={filters.difficulty}
                onChange={e => setFilters({...filters, difficulty: e.target.value})}
              >
                <option value="ALL">Todo</option>
                <option value="EASY">Fácil</option>
                <option value="MEDIUM">Medio</option>
                <option value="HARD">Difícil</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Cantidad</Label>
              <Input 
                type="number"
                min="1"
                max="50"
                value={filters.count}
                onChange={e => setFilters({...filters, count: parseInt(e.target.value)})}
                className="bg-secondary/30 border-white/5 h-10"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase italic">Cancelar</Button>
          <Button 
            onClick={() => onImport(filters)}
            className="bg-neon-purple text-white font-black uppercase italic text-[11px] h-10 px-6"
          >
            Ejecutar Selección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveToBankDialog({ isOpen, onClose, question, subjects }: any) {
  const { user } = useAuthStore();
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [loading, setLoading] = useState(false);
  const [newBankMode, setNewBankMode] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      const fetchBanks = async () => {
        const q = query(
          collection(db, 'question_banks'),
          where('teacherId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const bankData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBanks(bankData);
        if (bankData.length > 0) setSelectedBankId(bankData[0].id);
        else setNewBankMode(true);
      };
      fetchBanks();
    }
  }, [isOpen, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question || !user) return;
    setLoading(true);
    try {
      let bankId = selectedBankId;
      const isBatch = question.isBatch;
      const questionsToSave = isBatch ? question.questions : [question];

      if (newBankMode) {
        const formData = new FormData(e.target as HTMLFormElement);
        const bankData = {
          title: formData.get('bankTitle') as string,
          subjectId: formData.get('subjectId') as string,
          topic: (isBatch ? questionsToSave[0]?.topic : question.topic) || '',
          teacherId: user.uid,
          createdAt: Date.now(),
          questionsCount: questionsToSave.length
        };
        const bankRef = await addDoc(collection(db, 'question_banks'), bankData);
        bankId = bankRef.id;
      } else {
        await updateDoc(doc(db, 'question_banks', bankId), {
          questionsCount: (banks.find(b => b.id === bankId)?.questionsCount || 0) + questionsToSave.length
        });
      }

      const batch = writeBatch(db);
      for (const q of questionsToSave) {
        const qRef = doc(collection(db, 'library_questions'));
        batch.set(qRef, {
          bankId,
          text: q.text,
          type: q.type,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          points: q.points || 10,
          difficulty: q.difficulty || 'MEDIUM',
          topic: q.topic || '',
          teacherId: user.uid,
          createdAt: Date.now()
        });
      }
      await batch.commit();

      notify(isBatch ? `${questionsToSave.length} reactivos exportados a la biblioteca.` : 'Reactivo guardado en tu biblioteca.', 'success');
      playSound.success();
      onClose();
    } catch (err) {
      errorService.handle(err, 'Save to Bank');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-border/50 bg-card/95 backdrop-blur-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black italic uppercase text-neon-blue">Guardar en Biblioteca</DialogTitle>
          <DialogDescription className="text-xs uppercase opacity-50">Resguarda este reactivo para uso preventivo en misiones futuras</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          <div className="flex items-center gap-2 mb-4 bg-white/5 p-3 rounded-lg border border-white/5">
            <BookMarked className="w-5 h-5 text-neon-blue" />
            <div className="flex-1 min-w-0">
               <p className="text-[10px] font-black uppercase opacity-40">Reactivos a Guardar</p>
               <p className="text-xs font-bold truncate italic">
                 {question?.isBatch 
                   ? `${question.questions.length} reactivos seleccionados de esta misión` 
                   : `"${question?.text}"`
                 }
               </p>
            </div>
          </div>

          <div className="flex gap-2">
             <Button 
              type="button" 
              variant={!newBankMode ? 'secondary' : 'ghost'} 
              className="flex-1 text-[10px] font-black uppercase"
              onClick={() => setNewBankMode(false)}
             >Existente</Button>
             <Button 
              type="button" 
              variant={newBankMode ? 'secondary' : 'ghost'} 
              className="flex-1 text-[10px] font-black uppercase"
              onClick={() => setNewBankMode(true)}
             >Nuevo Banco</Button>
          </div>

          {!newBankMode ? (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Seleccionar Banco Destino</Label>
              <select 
                value={selectedBankId} 
                onChange={e => setSelectedBankId(e.target.value)}
                className="flex h-11 w-full rounded-md border border-white/5 bg-secondary/30 px-3 text-sm focus:ring-neon-blue font-bold shadow-inner"
                required
              >
                {banks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({subjects.find((s: any) => s.id === b.subjectId)?.name || 'General'})
                  </option>
                ))}
                {banks.length === 0 && <option value="" disabled>No hay bancos disponibles</option>}
              </select>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold">Título del Nuevo Banco</Label>
                  <Input name="bankTitle" placeholder="EJ: FÍSICA SUPERIOR" required className="bg-secondary/30 h-11" />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold">Materia</Label>
                  <select name="subjectId" className="flex h-11 w-full rounded-md border border-white/5 bg-secondary/30 px-3 text-sm font-bold shadow-inner" required>
                    {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
               </div>
            </div>
          )}

          <DialogFooter className="pt-4">
             <Button type="button" variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase italic">Cancelar</Button>
             <Button 
               type="submit" 
               disabled={loading || (!selectedBankId && !newBankMode)}
               className="bg-neon-blue text-black font-black uppercase h-10 px-8 text-[11px] shadow-[0_0_15px_rgba(0,255,255,0.2)]"
             >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Guardado'}
             </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

