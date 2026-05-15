import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, Send, Sparkles, User, GraduationCap, ShieldCheck, FileText } from 'lucide-react';
import { useSubjectsGroupsStore } from '../store/subjectsGroups';
import { supabase } from '../lib/supabase'; // Importación de Supabase añadida
import { errorService } from '../services/errorService';

export default function RequestAccessPage() {
  const navigate = useNavigate();
  const { subjects, groups, init } = useSubjectsGroupsStore();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    motherLastName: '',
    matricula: '',
    subjectId: '',
    groupId: '',
    role: 'STUDENT',
    email: ''
  });

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      const sanitizedMatricula = formData.matricula.trim().toUpperCase();
      const sanitizedEmail = (formData.email || '').trim().toLowerCase();
      
      if (sanitizedMatricula && sanitizedMatricula.length < 5) {
        throw new Error('La matrícula es demasiado corta.');
      }

      if (sanitizedMatricula) {
        // 1. Validar si ya existe el usuario registrado en Supabase (Tabla: 'users')
        const { data: userCheck, error: userError } = await supabase
          .from('users')
          .select('matricula')
          .eq('matricula', sanitizedMatricula);

        if (userError) throw userError;
        if (userCheck && userCheck.length > 0) {
          throw new Error('Ya existe un usuario registrado con esta matrícula.');
        }
        
        // 2. Validar si ya existe una solicitud pendiente en Supabase (Tabla: 'requests')
        const { data: reqCheck, error: reqError } = await supabase
          .from('requests')
          .select('matricula, status')
          .eq('matricula', sanitizedMatricula)
          .eq('status', 'PENDING');

        if (reqError) throw reqError;
        if (reqCheck && reqCheck.length > 0) {
          throw new Error('Ya tienes una solicitud pendiente con esta matrícula.');
        }
      }

      // Preparar la estructura de datos sanitizada mapeando las columnas
      const sanitizedData = {
        name: formData.name.trim().toUpperCase(),
        last_name: formData.lastName.trim().toUpperCase(), // Ajustado a snake_case para Postgres estándar
        mother_last_name: formData.motherLastName.trim().toUpperCase(), // Ajustado a snake_case
        matricula: sanitizedMatricula || null,
        subject_id: formData.subjectId || null, // Ajustado a snake_case
        group_id: formData.groupId || null, // Ajustado a snake_case
        role: formData.role,
        email: sanitizedEmail || null,
        status: 'PENDING',
        created_at: new Date().toISOString() // Estándar timestamp de Supabase/PostgreSQL
      };
      
      // 3. Insertar la solicitud en la tabla 'requests' de Supabase
      const { error: insertError } = await supabase
        .from('requests')
        .insert([sanitizedData]);

      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (error: any) {
      errorService.handle(error, 'Request Access');
    } compression: finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen cosmic-grid flex flex-col items-center justify-center p-4">
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl"
      >
        <button 
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground hover:text-neon-blue transition-colors mb-6 tracking-widest"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Volver al Nexus
        </button>

        <Card className="bg-black/60 backdrop-blur-2xl border-white/5 neo-glow-blue overflow-hidden rounded-3xl shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink"></div>
          
          <CardHeader className="bg-white/5 py-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Sparkles className="w-5 h-5 text-neon-blue animate-pulse" />
              <CardTitle className="text-3xl text-center text-neon-blue font-black italic tracking-tighter uppercase">SOLICITUD DE ACCESO</CardTitle>
            </div>
            <CardDescription className="text-center font-black text-[9px] uppercase tracking-[0.3em] opacity-40">
              Protocolo de Registro Neural v4.0
            </CardDescription>
          </CardHeader>

          <CardContent className="p-8">
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-6 py-12"
                >
                  <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                    <ShieldCheck className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black italic text-emerald-400">TRANSMISIÓN COMPLETADA</h3>
                  <div className="max-w-xs mx-auto space-y-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-relaxed">
                      Tu solicitud ha sido encriptada y enviada a la cola de validación. 
                      Consulta con tu docente para el desbloqueo de tu ID.
                    </p>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 font-mono text-[8px] text-muted-foreground opacity-40 uppercase">
                      ID TRANSMISIÓN: {Math.random().toString(36).substring(7).toUpperCase()}
                    </div>
                  </div>
                  <Button 
                    className="w-full h-12 bg-neon-blue text-black font-black uppercase italic tracking-tighter" 
                    onClick={() => navigate('/')}
                  >
                    FINALIZAR SESIÓN DE REGISTRO
                  </Button>
                </motion.div>
              ) : (
                <motion.form 
                  key="form"
                  initial={{ opacity: 0, rotateX: -10, transformOrigin: 'top' }}
                  animate={{ opacity: 1, rotateX: 0 }}
                  onSubmit={handleSubmit} 
                  className="space-y-6"
                >
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50 flex items-center gap-2">
                         <User className="w-3 h-3" /> Nombres
                       </label>
                       <Input 
                         value={formData.name} 
                         onChange={e => setFormData({...formData, name: e.target.value})} 
                         required 
                         className="bg-black/40 border-white/10 uppercase italic font-bold text-neon-blue h-12 focus:border-neon-blue transition-all" 
                       />
                    </div>
                    <div className="grid grid-cols-1 space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50 flex items-center gap-2">
                         <FileText className="w-3 h-3" /> Matrícula / Control
                       </label>
                       <Input 
                         value={formData.matricula} 
                         onChange={e => setFormData({...formData, matricula: e.target.value})} 
                         className="bg-black/40 border-white/10 font-mono uppercase italic h-12" 
                         placeholder="EJ: 21311050" 
                       />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50 flex items-center gap-2">
                       Correo Electrónico (Opcional)
                    </label>
                    <Input 
                      type="email"
                      value={formData.email} 
                      onChange={e => setFormData({...formData, email: e.target.value})} 
                      placeholder="Para recibir notificaciones (opcional)"
                      className="bg-black/40 border-white/10 italic font-bold h-12 focus:border-neon-blue transition-all" 
                    />
                    <p className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest leading-relaxed mt-1">
                      No es obligatorio. Usarás tu Matrícula para entrar al sistema.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Apellido Paterno</label>
                       <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} required className="bg-black/40 border-white/10 uppercase italic font-bold h-12 focus:border-neon-purple transition-all" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Apellido Materno</label>
                       <Input value={formData.motherLastName} onChange={e => setFormData({...formData, motherLastName: e.target.value})} className="bg-black/40 border-white/10 uppercase italic h-12 opacity-60" placeholder="OPCIONAL" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Rol de Operación</label>
                       <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, role: 'STUDENT'})}
                            className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                              formData.role === 'STUDENT' 
                                ? 'bg-neon-blue/10 border-neon-blue text-neon-blue' 
                                : 'bg-black/20 border-white/5 text-muted-foreground'
                            }`}
                          >
                            <GraduationCap className="w-4 h-4" />
                            <span className="text-[10px] font-black italic">ALUMNO</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, role: 'TEACHER'})}
                            className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                              formData.role === 'TEACHER' 
                                ? 'bg-neon-purple/10 border-neon-purple text-neon-purple' 
                                : 'bg-black/20 border-white/5 text-muted-foreground'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                            <span className="text-[10px] font-black italic">DOCENTE</span>
                          </button>
                       </div>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Nodo de Materia</label>
                      <select 
                        required 
                        value={formData.subjectId}
                        onChange={e => setFormData({...formData, subjectId: e.target.value})}
                        disabled={loading && subjects.length === 0}
                        className="flex h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:ring-1 focus:ring-neon-blue outline-none transition-all font-bold uppercase italic disabled:opacity-30"
                      >
                        <option value="">
                          {loading ? 'Sincronizando con Nexus...' : (subjects.length === 0 ? 'Sin Materias Disponibles' : 'Selecciona Materia')}
                        </option>
                        {subjects.map(s => <option key={s.id} value={s.id} className="bg-black">{s.name}</option>)}
                      </select>
                      {subjects.length === 0 && !loading && (
                        <div className="flex items-center justify-between px-1 mt-1">
                          <p className="text-[8px] text-amber-500 uppercase font-black">
                            No se detectaron materias.
                          </p>
                          <button 
                            type="button" 
                            onClick={init}
                            className="text-[8px] text-neon-blue uppercase font-black hover:underline"
                          >
                            Reintentar
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Identificador de Grupo</label>
                      <select 
                        required 
                        value={formData.groupId}
                        onChange={e => setFormData({...formData, groupId: e.target.value})}
                        disabled={loading && groups.length === 0}
                        className="flex h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:ring-1 focus:ring-neon-blue outline-none transition-all font-bold uppercase italic disabled:opacity-30"
                      >
                        <option value="">{loading ? 'Sincronizando...' : (groups.length === 0 ? 'Sin Grupos' : 'Selecciona Grupo')}</option>
                        {groups.map(g => <option key={g.id} value={g.id} className="bg-black">{g.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 pt-4">
                    <Button 
                      type="submit" 
                      disabled={loading} 
                      className="w-full bg-neon-blue text-black font-black uppercase italic h-14 shadow-[0_0_25px_rgba(0,243,255,0.3)] hover:shadow-[0_0_35px_rgba(0,243,255,0.5)] transition-all flex items-center justify-center gap-3"
                    >
                       {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                         <>
                           <Send className="w-5 h-5" /> EXPEDIR SOLICITUD AL DOCENTE
                         </>
                       )}
                    </Button>
                    <p className="text-[8px] text-muted-foreground text-center uppercase tracking-widest font-black opacity-30">
                      Verificando integridad de datos en el Nexus Central...
                    </p>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
