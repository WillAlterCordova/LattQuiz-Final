import { supabase } from '../lib/supabase';

export const dbService = {
  // QUIZZES
  async getQuizzes(teacherId?: string) {
    let query = supabase.from('quizzes').select('*, subjects(*), groups(*)');
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getQuiz(id: string) {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*, subjects(*), groups(*), questions(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createQuiz(quiz: any) {
    const { data, error } = await supabase
      .from('quizzes')
      .insert([quiz])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateQuiz(id: string, updates: any) {
    const { data, error } = await supabase
      .from('quizzes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // QUESTIONS
  async getQuestions(quizId: string) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsertQuestions(questions: any[]) {
    const { data, error } = await supabase
      .from('questions')
      .upsert(questions)
      .select();
    if (error) throw error;
    return data;
  },

  // SESSIONS
  async createSession(session: any) {
    const { data, error } = await supabase
      .from('sessions')
      .insert([session])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getSessionByCode(code: string) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, quizzes(*)')
      .eq('join_code', code.toUpperCase())
      .single();
    if (error) throw error;
    return data;
  },

  // REALTIME WRAPPERS
  subscribeToSession(sessionId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sessions', 
        filter: `id=eq.${sessionId}` 
      }, callback)
      .subscribe();
  }
};
