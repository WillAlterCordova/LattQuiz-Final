import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BookMarked, Search, Filter, Layers, CheckCircle2, ChevronRight, LayoutGrid, Check } from 'lucide-react';
import playSound from '../lib/sounds';

export function QuestionLibrarySelector({ isOpen, onClose, onSelectQuestions }: any) {
  const { user } = useAuthStore();
  const { subjects } = useSubjectsGroupsStore();
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    
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
    };
    fetchBanks();
  }, [isOpen, user]);

  useEffect(() => {
    if (!selectedBankId) return;
    
    const fetchQuestions = async () => {
      setLoading(true);
      const q = query(
        collection(db, 'library_questions'),
        where('bankId', '==', selectedBankId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetchQuestions();
  }, [selectedBankId]);

  const toggleSelect = (id: string) => {
    playSound.click();
    setSelectedQuestionIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleImport = () => {
    const selected = questions.filter(q => selectedQuestionIds.includes(q.id));
    onSelectQuestions(selected);
    playSound.powerUp();
    onClose();
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.toLowerCase().includes(search.toLowerCase());
    const matchesDifficulty = filterDifficulty === 'ALL' || q.difficulty === filterDifficulty;
    return matchesSearch && matchesDifficulty;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border-border/50 bg-card/95 backdrop-blur-3xl p-0">
        <DialogHeader className="p-6 border-b border-white/5">
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-neon-blue flex items-center gap-3">
             <BookMarked className="w-6 h-6" /> Importar desde Biblioteca
          </DialogTitle>
          <DialogDescription className="text-xs uppercase font-mono opacity-50">Selecciona reactivos validados de tus bancos académicos</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex">
           {/* Sidebar: Banks */}
           <div className="w-1/3 border-r border-white/5 overflow-y-auto p-4 space-y-2 bg-black/20">
              <Label className="text-[10px] font-black uppercase text-white/30 px-2">Mis Bancos</Label>
              {banks.map(bank => (
                 <button
                  key={bank.id}
                  onClick={() => { setSelectedBankId(bank.id); playSound.click(); }}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${
                    selectedBankId === bank.id 
                    ? 'border-neon-blue bg-neon-blue/10 text-white' 
                    : 'border-white/5 hover:border-white/10 text-white/50 hover:text-white/80'
                  }`}
                 >
                    <div className="flex items-center gap-2 mb-1">
                       <Badge className="text-[8px] bg-neon-blue/20 text-neon-blue border-none px-1 h-3.5">
                          {subjects.find(s => s.id === bank.subjectId)?.name || 'General'}
                       </Badge>
                       <span className="text-[9px] font-mono opacity-40">{bank.questionsCount || 0} Qs</span>
                    </div>
                    <div className="text-xs font-black uppercase italic truncate">{bank.title}</div>
                 </button>
              ))}
           </div>

           {/* Content: Questions */}
           <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-2 sticky top-0 bg-card/50 backdrop-blur-md pb-4 z-10">
                 <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input 
                      placeholder="Filtrar reactivos..." 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9 h-9 bg-secondary/30 border-white/5 text-[10px] uppercase font-bold"
                    />
                 </div>
                 <select 
                  className="bg-secondary/30 border border-white/5 rounded-md px-3 text-[9px] font-bold uppercase italic outline-none h-9"
                  value={filterDifficulty}
                  onChange={e => setFilterDifficulty(e.target.value)}
                >
                   <option value="ALL">DIFICULTAD</option>
                   <option value="EASY">FÁCIL</option>
                   <option value="MEDIUM">MEDIO</option>
                   <option value="HARD">DIFÍCIL</option>
                </select>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs italic opacity-30 animate-pulse">Consultando Red Neural...</div>
              ) : (
                <div className="space-y-3">
                   {filteredQuestions.map(q => (
                      <div 
                        key={q.id}
                        onClick={() => toggleSelect(q.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                          selectedQuestionIds.includes(q.id)
                          ? 'border-neon-blue bg-neon-blue/5'
                          : 'border-white/5 hover:border-white/10 bg-white/5'
                        }`}
                      >
                         <div className="flex gap-4">
                            <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              selectedQuestionIds.includes(q.id) ? 'bg-neon-blue border-neon-blue' : 'border-white/10'
                            }`}>
                               {selectedQuestionIds.includes(q.id) && <Check className="w-3.5 h-3.5 text-black" />}
                            </div>
                            <div className="flex-1">
                               <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className={`text-[7px] uppercase font-black px-1 py-0 h-3.5 ${
                                    q.difficulty === 'EASY' ? 'text-emerald-500 border-emerald-500/30' :
                                    q.difficulty === 'HARD' ? 'text-neon-pink border-neon-pink/30' :
                                    'text-amber-500 border-amber-500/30'
                                  }`}>
                                     {q.difficulty}
                                  </Badge>
                                  <span className="text-[9px] font-mono opacity-30 uppercase">{q.type}</span>
                                  {q.subtopic && <span className="text-[9px] font-bold text-neon-purple uppercase italic">#{q.subtopic}</span>}
                               </div>
                               <p className="text-xs font-bold text-white/90 leading-tight">{q.text}</p>
                            </div>
                         </div>
                      </div>
                   ))}
                   {filteredQuestions.length === 0 && (
                      <div className="py-12 text-center opacity-20 italic text-xs">No se encontraron reactivos.</div>
                   )}
                </div>
              )}
           </div>
        </div>

        <DialogFooter className="p-6 border-t border-white/5 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="text-[10px] font-black uppercase text-neon-blue italic">
                 {selectedQuestionIds.length} Reactivos Seleccionados
              </div>
              {filteredQuestions.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    const allIds = filteredQuestions.map(q => q.id);
                    const allSelected = allIds.every(id => selectedQuestionIds.includes(id));
                    if (allSelected) {
                      setSelectedQuestionIds(prev => prev.filter(id => !allIds.includes(id)));
                    } else {
                      setSelectedQuestionIds(prev => Array.from(new Set([...prev, ...allIds])));
                    }
                    playSound.click();
                  }}
                  className="h-7 text-[8px] uppercase font-black border border-white/10 hover:bg-white/5"
                >
                  {filteredQuestions.every(q => selectedQuestionIds.includes(q.id)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </Button>
              )}
           </div>
           <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase italic">Cancelar</Button>
              <Button 
                onClick={handleImport}
                disabled={selectedQuestionIds.length === 0}
                className="bg-neon-blue text-black font-black uppercase italic text-[11px] h-10 px-8"
              >
                 Importar a la Misión
              </Button>
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
