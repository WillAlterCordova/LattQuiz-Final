import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, addDoc, deleteDoc, doc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { 
  BookOpen, Plus, Search, Filter, Trash2, Pencil, Copy, 
  ChevronRight, ArrowLeft, BookMarked, Globe, Layers, 
  Zap, BrainCircuit, CheckCircle2, XCircle, Info,
  MoreVertical, FileJson, LayoutGrid, Clock, Upload, FileText, Loader2
} from 'lucide-react';
import { notify } from '../components/NeonNotification';
import playSound from '../lib/sounds';
import { motion, AnimatePresence } from 'motion/react';
import { errorService } from '../services/errorService';

export function QuestionLibrary() {
  const { user } = useAuthStore();
  const { subjects } = useSubjectsGroupsStore();
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('ALL');
  
  // Modals
  const [showBankModal, setShowBankModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editBank, setEditBank] = useState<any>(null);
  const [editQuestion, setEditQuestion] = useState<any>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  const downloadQuestionTemplate = () => {
    const headers = ['TEXTO', 'TIPO', 'OPCIONES', 'RESPUESTA_CORRECTA', 'EXPLICACION', 'DIFICULTAD', 'SUBTEMA', 'PUNTOS'];
    const example = ['¿Cuál es la capital de Francia?', 'MULTIPLE_CHOICE', 'París;Madrid;Roma;Berlín', 'París', 'París es la capital y ciudad más poblada de Francia.', 'EASY', 'GEOGRAFIA', '10'];
    const csvContent = [headers, example].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'plantilla_reactivos_lattquiz.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Plantilla de reactivos generada.', 'success');
  };

  const handleBulkQuestionUpload = async () => {
    if (!bulkData.trim() || !selectedBank) return;
    setIsProcessingBulk(true);
    playSound.click();
    
    try {
      const rows = bulkData.split('\n').filter(r => r.trim());
      const startIndex = rows[0]?.toUpperCase().includes('TEXTO') ? 1 : 0;
      let count = 0;
      const batch = writeBatch(db);

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const [text, type, optionsStr, correctAnswer, explanation, difficulty, subtopic, points] = row.split(',').map(s => s?.trim());
        
        if (!text || !type || !correctAnswer) continue;

        const options = optionsStr ? optionsStr.split(';').map(o => o.trim()) : [];
        const finalType = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].includes(type.toUpperCase()) ? type.toUpperCase() : 'MULTIPLE_CHOICE';
        const finalDifficulty = ['EASY', 'MEDIUM', 'HARD'].includes(difficulty?.toUpperCase()) ? difficulty.toUpperCase() : 'MEDIUM';

        const qRef = doc(collection(db, 'library_questions'));
        batch.set(qRef, {
          text,
          type: finalType,
          options,
          correctAnswer,
          explanation: explanation || '',
          difficulty: finalDifficulty,
          subtopic: subtopic || '',
          points: parseInt(points) || 10,
          bankId: selectedBank.id,
          teacherId: user?.uid,
          subjectId: selectedBank.subjectId,
          topic: selectedBank.topic || '',
          createdAt: Date.now()
        });
        count++;
      }

      if (count > 0) {
        await batch.commit();
        await updateDoc(doc(db, 'question_banks', selectedBank.id), {
          questionsCount: (selectedBank.questionsCount || 0) + count
        });
        notify(`${count} Reactivos importados con éxito.`, 'success');
      }
      
      setShowBulkUpload(false);
      setBulkData('');
      playSound.success();
    } catch (err) {
      errorService.handle(err, 'Bulk Question Import');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'question_banks'), 
      where('teacherId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!selectedBank) {
      setQuestions([]);
      return;
    }

    const q = query(
      collection(db, 'library_questions'),
      where('bankId', '==', selectedBank.id),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [selectedBank]);

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      subjectId: formData.get('subjectId') as string,
      topic: formData.get('topic') as string,
      teacherId: user?.uid,
      createdAt: Date.now(),
      questionsCount: 0
    };

    try {
      if (editBank) {
        await updateDoc(doc(db, 'question_banks', editBank.id), data);
        notify('Banco de preguntas actualizado.', 'success');
      } else {
        await addDoc(collection(db, 'question_banks'), data);
        notify('Nuevo banco de preguntas creado.', 'success');
      }
      setShowBankModal(false);
      setEditBank(null);
      playSound.success();
    } catch (err) {
      errorService.handle(err, 'Save Question Bank');
    }
  };

  const handleDeleteBank = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Seguro que quieres eliminar este banco y todas sus preguntas?')) return;
    
    try {
      // 1. Delete all questions in bank
      const qSnap = await getDocs(query(collection(db, 'library_questions'), where('bankId', '==', id)));
      const batch = writeBatch(db);
      qSnap.docs.forEach(d => batch.delete(d.ref));
      
      // 2. Delete bank
      batch.delete(doc(db, 'question_banks', id));
      await batch.commit();
      
      notify('Banco eliminado con éxito.', 'success');
      if (selectedBank?.id === id) setSelectedBank(null);
      playSound.delete();
    } catch (err) {
      errorService.handle(err, 'Delete Question Bank');
    }
  };

  const handleSaveQuestion = async (qData: any) => {
    if (!selectedBank) return;
    
    const data = {
      ...qData,
      bankId: selectedBank.id,
      teacherId: user?.uid,
      subjectId: selectedBank.subjectId,
      topic: selectedBank.topic || qData.topic || '',
      createdAt: Date.now()
    };

    try {
      if (editQuestion) {
        await updateDoc(doc(db, 'library_questions', editQuestion.id), data);
        notify('Pregunta actualizada.', 'success');
      } else {
        await addDoc(collection(db, 'library_questions'), data);
        await updateDoc(doc(db, 'question_banks', selectedBank.id), {
          questionsCount: (selectedBank.questionsCount || 0) + 1
        });
        notify('Pregunta añadida a la biblioteca.', 'success');
      }
      setShowQuestionModal(false);
      setEditQuestion(null);
      playSound.success();
    } catch (err) {
      errorService.handle(err, 'Save Library Question');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('¿Eliminar esta pregunta de la biblioteca?')) return;
    try {
      await deleteDoc(doc(db, 'library_questions', id));
      await updateDoc(doc(db, 'question_banks', selectedBank.id), {
        questionsCount: Math.max(0, (selectedBank.questionsCount || 0) - 1)
      });
      notify('Pregunta eliminada.', 'success');
      playSound.delete();
    } catch (err) {
      errorService.handle(err, 'Delete Question');
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.toLowerCase().includes(search.toLowerCase()) || 
                          (q.subtopic && q.subtopic.toLowerCase().includes(search.toLowerCase()));
    const matchesDifficulty = filterDifficulty === 'ALL' || q.difficulty === filterDifficulty;
    return matchesSearch && matchesDifficulty;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase flex items-center gap-3">
            <BookMarked className="w-8 h-8 text-neon-blue" />
            Biblioteca de Reactivos
          </h1>
          <p className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground mt-1">
            Gestión Avanzada de Bancos Académicos
          </p>
        </div>
        {!selectedBank ? (
          <Button 
            className="bg-neon-blue text-black font-black italic uppercase text-[10px] h-9 gap-2 shadow-[0_0_15px_rgba(0,255,255,0.3)] animate-pulse"
            onClick={() => { setEditBank(null); setShowBankModal(true); playSound.click(); }}
          >
            <Plus className="w-4 h-4" /> Crear Nuevo Banco
          </Button>
        ) : (
          <Button 
            variant="ghost"
            className="text-[10px] font-black uppercase italic gap-2 h-9 border border-white/5"
            onClick={() => { setSelectedBank(null); playSound.click(); }}
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Bancos
          </Button>
        )}
      </div>

      {!selectedBank ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse border border-white/10" />
             ))
          ) : (
            banks.map(bank => (
              <Card 
                key={bank.id} 
                className="group relative border-white/5 bg-secondary/10 hover:bg-secondary/20 hover:border-neon-blue/30 transition-all duration-500 cursor-pointer overflow-hidden"
                onClick={() => { setSelectedBank(bank); playSound.click(); }}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                  <LayoutGrid className="w-16 h-16" />
                </div>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="text-[8px] border-neon-blue text-neon-blue uppercase">
                      {subjects.find(s => s.id === bank.subjectId)?.name || 'General'}
                    </Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-white" onClick={(e) => { e.stopPropagation(); setEditBank(bank); setShowBankModal(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/50 hover:text-destructive" onClick={(e) => handleDeleteBank(bank.id, e)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg font-black italic uppercase mt-2 tracking-tight">
                    {bank.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 uppercase italic mb-4 font-medium opacity-60">
                    {bank.description || 'Sin descripción'}
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-blue" />
                      <span className="text-[10px] font-black uppercase text-neon-blue">{bank.questionsCount || 0} Reactivos</span>
                    </div>
                    {bank.topic && (
                       <div className="flex items-center gap-1.5 opacity-60">
                         <Layers className="w-3 h-3" />
                         <span className="text-[9px] font-mono uppercase tracking-tighter truncate max-w-[100px]">{bank.topic}</span>
                       </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {banks.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
              <BookOpen className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm font-medium italic opacity-40">Aún no tienes bancos de preguntas configurados.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-neon-blue/20 bg-neon-blue/5 overflow-hidden">
             <div className="p-6 flex flex-col md:flex-row justify-between gap-6 items-center">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-neon-blue/10 flex items-center justify-center p-3 border border-neon-blue/20">
                      <Layers className="w-full h-full text-neon-blue" />
                   </div>
                   <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-neon-blue text-black text-[8px] font-black italic uppercase">
                           {subjects.find(s => s.id === selectedBank.subjectId)?.name || 'General'}
                        </Badge>
                        <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">{selectedBank.topic}</span>
                      </div>
                      <h2 className="text-2xl font-black italic uppercase tracking-tighter">{selectedBank.title}</h2>
                      <p className="text-xs opacity-60 italic">{selectedBank.description}</p>
                   </div>
                </div>
                <div className="flex gap-2">
                   <Button 
                    variant="outline"
                    className="h-10 border-neon-blue/30 text-neon-blue font-black italic uppercase text-[10px] gap-2 px-6 hover:bg-neon-blue/10"
                    onClick={() => { setShowBulkUpload(true); playSound.click(); }}
                   >
                     <Upload className="w-4 h-4" /> Importar CSV
                   </Button>
                   <Button 
                    className="h-10 bg-white text-black font-black italic uppercase text-[10px] gap-2 px-6"
                    onClick={() => { setEditQuestion(null); setShowQuestionModal(true); playSound.click(); }}
                   >
                     <Plus className="w-4 h-4" /> Añadir Reactivo
                   </Button>
                </div>
             </div>
          </Card>

          <div className="flex flex-col md:flex-row gap-4">
             <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Filtrar por texto del reactivo o subtema..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-11 bg-secondary/20 border-white/5 text-sm uppercase italic font-bold"
                />
             </div>
             <div className="flex gap-2 h-11">
                <select 
                  className="bg-secondary/20 border border-white/5 rounded-md px-4 text-[10px] font-black uppercase italic outline-none focus:ring-1 focus:ring-neon-blue"
                  value={filterDifficulty}
                  onChange={e => setFilterDifficulty(e.target.value)}
                >
                   <option value="ALL">TODAS LAS DIFICULTADES</option>
                   <option value="EASY">NIVEL: FÁCIL</option>
                   <option value="MEDIUM">NIVEL: MEDIO</option>
                   <option value="HARD">NIVEL: DIFÍCIL</option>
                </select>
                <div className="px-4 bg-secondary/30 rounded-md flex items-center gap-3 border border-white/5">
                   <Filter className="w-3 h-3 opacity-40" />
                   <span className="text-[10px] font-black italic uppercase text-neon-blue">{filteredQuestions.length} FILTRADOS</span>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
             {filteredQuestions.map(q => (
               <Card key={q.id} className="group border-white/5 bg-secondary/5 hover:bg-secondary/10 transition-colors overflow-hidden">
                  <div className="p-5 flex gap-5">
                     <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border ${
                          q.difficulty === 'EASY' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' :
                          q.difficulty === 'HARD' ? 'border-neon-pink/20 text-neon-pink bg-neon-pink/5' :
                          'border-amber-500/20 text-amber-500 bg-amber-500/5'
                        }`}>
                          {q.difficulty === 'EASY' ? 'F' : q.difficulty === 'HARD' ? 'D' : 'M'}
                        </div>
                        <Badge variant="outline" className="text-[7px] p-0 h-4 w-10 flex items-center justify-center opacity-50 uppercase font-mono">
                           {q.type.split('_')[0]}
                        </Badge>
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                           <div className="flex items-center gap-3">
                              {q.subtopic && (
                                <Badge className="bg-neon-purple/80 text-white text-[8px] font-black px-1.5 py-0 h-4">
                                   {q.subtopic}
                                </Badge>
                              )}
                              <span className="text-[8px] font-mono opacity-40 uppercase">{new Date(q.createdAt).toLocaleDateString()}</span>
                           </div>
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-neon-blue" onClick={() => { setEditQuestion(q); setShowQuestionModal(true); }}>
                                 <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white" onClick={() => { 
                                const qCopy = {...q}; delete qCopy.id; delete qCopy.createdAt;
                                setEditQuestion(qCopy); 
                                setShowQuestionModal(true);
                                notify('Clonando reactivo...', 'success');
                              }}>
                                 <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-destructive" onClick={() => handleDeleteQuestion(q.id)}>
                                 <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                           </div>
                        </div>
                        <h4 className="text-sm font-bold text-white/90 leading-snug">{q.text}</h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                           {q.options?.map((opt: string, idx: number) => (
                             <div key={idx} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                               opt === q.correctAnswer ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-500' : 'border-white/5 bg-white/5 opacity-40'
                             }`}>
                               {opt}
                             </div>
                           ))}
                        </div>
                        {(q.explanation || (q.incorrectExplanations && Object.keys(q.incorrectExplanations).length > 0)) && (
                           <div className="mt-3 p-3 bg-white/5 rounded-lg border-l-2 border-neon-blue text-[11px] leading-relaxed italic opacity-70">
                              <span className="text-neon-blue font-black mr-2">FEEDBACK:</span>
                              {q.explanation}
                           </div>
                        )}
                     </div>
                  </div>
               </Card>
             ))}
             {filteredQuestions.length === 0 && (
                <div className="py-20 text-center border border-dashed border-white/5 rounded-3xl opacity-30">
                   <LayoutGrid className="w-10 h-10 mx-auto mb-3" />
                   <p className="text-xs italic">No se encontraron reactivos con los filtros actuales.</p>
                </div>
             )}
          </div>
        </div>
      )}

      {/* Bank Modal */}
      <Dialog open={showBankModal} onOpenChange={setShowBankModal}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-neon-blue">
              {editBank ? 'Editar Banco Académico' : 'Protocolo de Nuevo Banco'}
            </DialogTitle>
            <DialogDescription className="text-xs uppercase font-mono opacity-50">Configurar parámetros raíz del contenedor</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveBank} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Título del Banco</Label>
              <Input name="title" defaultValue={editBank?.title} placeholder="EJ: FÍSICA CLÁSICA UNIT 1" required className="bg-secondary/30 h-11 border-white/5" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Materia Vinculada</Label>
              <select name="subjectId" defaultValue={editBank?.subjectId || ''} className="flex h-11 w-full rounded-md border border-white/5 bg-secondary/30 px-3 text-sm focus:ring-neon-blue" required>
                <option value="">-- Seleccionar Materia --</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Eje Temático Principal</Label>
              <Input name="topic" defaultValue={editBank?.topic} placeholder="EJ: TERMODINÁMICA" className="bg-secondary/30 h-11 border-white/5" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold">Descripción (Opcional)</Label>
              <textarea 
                name="description" 
                defaultValue={editBank?.description} 
                placeholder="NOTAS SOBRE ESTE BANCO..."
                className="flex min-h-[80px] w-full rounded-md border border-white/5 bg-secondary/30 px-3 py-2 text-sm focus:ring-neon-blue"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowBankModal(false)} className="text-[10px] font-black uppercase italic">Cancelar</Button>
              <Button type="submit" className="bg-neon-blue text-black font-black uppercase italic text-[10px] px-8 h-10">
                {editBank ? 'Confirmar Cambios' : 'Inicializar Banco'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Question Library Modal */}
      {showQuestionModal && (
        <QuestionEditorModal 
          selectedBank={selectedBank}
          editQuestion={editQuestion}
          onClose={() => setShowQuestionModal(false)}
          onSave={handleSaveQuestion}
        />
      )}

      {/* Bulk Upload Modal */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-3xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-neon-blue flex items-center gap-2">
              <Upload className="w-5 h-5" /> Importación Masiva Quark
            </DialogTitle>
            <DialogDescription className="text-xs uppercase font-mono opacity-50">Sincronización de base de reactivos vía CSV</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex justify-between items-center bg-secondary/20 p-4 rounded-xl border border-white/5">
              <div>
                <p className="text-[10px] font-black uppercase italic">Protocolo de Plantilla</p>
                <p className="text-[9px] opacity-50 font-mono">Descarga el formato base para evitar errores de paridad</p>
              </div>
              <Button variant="outline" size="sm" className="text-[10px] font-black" onClick={downloadQuestionTemplate}>
                <FileText className="w-3.5 h-3.5 mr-2" /> PLANTILLA.CSV
              </Button>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Flujo de Datos CSV (Pega aquí)</Label>
              <textarea 
                value={bulkData}
                onChange={e => setBulkData(e.target.value)}
                placeholder="Pregunta,MULTIPLE_CHOICE,Op1;Op2;Op3,Op1,Explicación,EASY,Tema,10"
                className="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-[11px] focus:ring-1 focus:ring-neon-blue outline-none custom-scrollbar"
              />
              <div className="p-3 bg-neon-blue/5 border-l-2 border-neon-blue/30 rounded-r-lg">
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  <span className="text-neon-blue font-black">ESTRUCTURA:</span> Texto, Tipo, Opciones (separadas por ;), Respuesta Correcta, Explicación, Dificultad, Subtema, Puntos.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowBulkUpload(false)} className="text-[10px] font-black uppercase italic">Cancelar</Button>
            <Button 
              className="bg-neon-blue text-black font-black uppercase italic text-[11px] px-10 h-11 gap-2"
              disabled={!bulkData || isProcessingBulk}
              onClick={handleBulkQuestionUpload}
            >
              {isProcessingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              INICIAR PROCESADO DE DATOS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionEditorModal({ selectedBank, editQuestion, onClose, onSave }: any) {
  const [q, setQ] = useState<any>(editQuestion || {
    text: '',
    type: 'MULTIPLE_CHOICE',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    incorrectExplanations: {},
    difficulty: 'MEDIUM',
    subtopic: '',
    points: 10
  });

  const handleUpdate = (updates: any) => setQ({ ...q, ...updates });

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-3xl max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-neon-blue">
            {editQuestion?.id ? 'Editar Reactivo Maestro' : 'Generación de Nuevo Reactivo'}
          </DialogTitle>
          <div className="flex items-center gap-3 mt-1">
             <Badge className="bg-neon-blue/10 text-neon-blue border-neon-blue/20 text-[8px] italic font-black uppercase">{selectedBank.title}</Badge>
             <p className="text-[10px] uppercase font-mono opacity-50 tracking-widest">Metadata Integrada LattQuiz</p>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-6">
          <div className="lg:col-span-12 space-y-4">
            <Label className="text-[10px] uppercase font-black tracking-widest text-white/50">Cuerpo de la Interrogante</Label>
            <textarea 
              value={q.text}
              onChange={e => handleUpdate({ text: e.target.value })}
              placeholder="Escribe el planteamiento aquí..."
              className="w-full min-h-[100px] p-4 bg-white/5 border border-white/10 rounded-2xl text-xl font-bold italic focus:ring-2 focus:ring-neon-blue outline-none transition-all placeholder:text-white/10"
            />
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <Label className="text-[10px] uppercase font-black text-white/50">Opciones de Respuesta</Label>
                  <Button variant="ghost" size="sm" onClick={() => handleUpdate({ options: [...q.options, ''] })} className="h-6 text-[8px] uppercase font-black text-neon-blue hover:bg-neon-blue/10">Añadir Distractor</Button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {q.options?.map((opt: string, idx: number) => (
                    <div key={idx} className="relative group/opt">
                       <Input 
                         value={opt}
                         onChange={e => {
                            const newOpts = [...q.options];
                            newOpts[idx] = e.target.value;
                            handleUpdate({ options: newOpts });
                         }}
                         placeholder={`Distractor ${idx + 1}`}
                         className={`h-11 pl-12 font-bold text-sm bg-white/5 border-white/5 transition-all ${q.correctAnswer === opt && opt !== '' ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30' : ''}`}
                       />
                       <button 
                        onClick={() => handleUpdate({ correctAnswer: opt })}
                        className={`absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${q.correctAnswer === opt && opt !== '' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/50' : 'bg-white/5 text-white/20 hover:text-white'}`}
                       >
                         {idx === 0 ? 'A' : idx === 1 ? 'B' : idx === 2 ? 'C' : 'D'}
                       </button>
                       {q.options.length > 2 && (
                          <button 
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive opacity-0 group-hover/opt:opacity-50 hover:opacity-100 p-1"
                            onClick={() => {
                              const newOpts = q.options.filter((_: any, i: number) => i !== idx);
                              handleUpdate({ options: newOpts });
                            }}
                          >
                             <XCircle className="w-4 h-4" />
                          </button>
                       )}
                    </div>
                  ))}
               </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-white/5">
               <Label className="text-[10px] uppercase font-black text-neon-blue flex items-center gap-2">
                  <Info className="w-3 h-3" /> Explicación Pedagógica (Feedback Correcto)
               </Label>
               <textarea 
                  value={q.explanation}
                  onChange={e => handleUpdate({ explanation: e.target.value })}
                  placeholder="Explica qué hace que esta respuesta sea la correcta..."
                  className="w-full min-h-[80px] p-3 bg-secondary/30 border border-white/5 rounded-xl text-sm italic focus:ring-1 focus:ring-neon-blue outline-none"
               />
            </div>

            <div className="space-y-4 pt-4">
               <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase font-black text-neon-pink">Feedback para Distractores (Opcional)</Label>
                  <p className="text-[8px] opacity-40 uppercase">Específico por cada opción incorrecta</p>
               </div>
               <div className="grid grid-cols-1 gap-2">
                  {q.options.filter((opt: string) => opt !== q.correctAnswer && opt !== '').map((opt: string, idx: number) => (
                    <div key={idx} className="flex gap-3 items-center">
                       <Badge variant="outline" className="h-6 w-12 flex items-center justify-center text-[8px] opacity-60">ERROR</Badge>
                       <Input 
                         value={q.incorrectExplanations?.[opt] || ''}
                         onChange={e => {
                            const newExps = { ...q.incorrectExplanations };
                            newExps[opt] = e.target.value;
                            handleUpdate({ incorrectExplanations: newExps });
                         }}
                         placeholder={`¿Por qué "${opt}" es incorrecta?`}
                         className="h-9 bg-white/5 border-white/5 text-[10px] italic"
                       />
                    </div>
                  ))}
               </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
             <div className="p-5 bg-secondary/20 rounded-2xl border border-white/5 space-y-5">
                <h4 className="text-[9px] uppercase font-black tracking-widest text-white/40 mb-2">Metadata del Reactivo</h4>
                
                <div className="space-y-2">
                   <Label className="text-[10px] font-bold">Tipo</Label>
                   <select 
                    className="w-full h-10 bg-secondary/50 border border-white/10 rounded-lg px-3 text-xs font-bold uppercase"
                    value={q.type}
                    onChange={e => handleUpdate({ type: e.target.value })}
                   >
                     <option value="MULTIPLE_CHOICE">Opción Múltiple</option>
                     <option value="TRUE_FALSE">Verdadero / Falso</option>
                     <option value="SHORT_ANSWER">Respuesta Corta</option>
                     <option value="IDENTIFY_COMPONENTS">Identificar Componentes</option>
                   </select>
                </div>

                <div className="space-y-2">
                   <Label className="text-[10px] font-bold">Dificultad</Label>
                   <div className="flex gap-2">
                      {['EASY', 'MEDIUM', 'HARD'].map(d => (
                         <button 
                           key={d}
                           onClick={() => handleUpdate({ difficulty: d })}
                           className={`flex-1 h-9 rounded-lg text-[9px] font-black uppercase transition-all border ${
                              q.difficulty === d 
                              ? d === 'EASY' ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/20' :
                                d === 'HARD' ? 'bg-neon-pink border-neon-pink text-white shadow-lg shadow-neon-pink/20' :
                                'bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/20'
                              : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                           }`}
                         >
                            {d === 'EASY' ? 'Fácil' : d === 'HARD' ? 'Difícil' : 'Medio'}
                         </button>
                      ))}
                   </div>
                </div>

                <div className="space-y-2">
                   <Label className="text-[10px] font-bold">Subtema Específico</Label>
                   <Input 
                    value={q.subtopic}
                    onChange={e => handleUpdate({ subtopic: e.target.value })}
                    placeholder="EJ: LEYES DE NEWTON"
                    className="h-10 bg-secondary/50 border-white/10 text-xs font-bold"
                   />
                </div>

                <div className="space-y-2">
                   <Label className="text-[10px] font-bold">Valor Neural (Puntos)</Label>
                   <Input 
                    type="number"
                    value={q.points}
                    onChange={e => handleUpdate({ points: parseInt(e.target.value) })}
                    className="h-10 bg-secondary/50 border-white/10 text-xs font-bold"
                   />
                </div>
             </div>

             <div className="p-4 bg-neon-purple/5 border border-neon-purple/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-neon-purple">
                   <Zap className="w-3.5 h-3.5 animate-pulse" />
                   <span className="text-[10px] font-black uppercase">Consistencia de Datos</span>
                </div>
                <p className="text-[9px] opacity-60 leading-tight">Asegúrate de que la respuesta correcta coincida exactamente con una de las opciones listadas.</p>
             </div>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t border-white/5">
           <Button variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase italic">Cancelar</Button>
           <Button 
            onClick={() => onSave(q)}
            disabled={!q.text || !q.correctAnswer}
            className="bg-neon-blue text-black font-black uppercase italic text-[11px] px-10 h-11 gap-2 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
           >
              {editQuestion?.id ? 'Actualizar Reactivo' : 'Guardar en Biblioteca'}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
