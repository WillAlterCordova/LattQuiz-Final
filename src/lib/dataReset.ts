import { supabase } from './supabase';
import { notify } from '../components/NeonNotification';

export interface ResetOptions {
  attempts?: boolean;
  violations?: boolean;
  rankings?: boolean;
  studentsStats?: boolean;
  groups?: boolean;
  quizzes?: boolean;
}

export async function resetSystemData(options: ResetOptions = { attempts: true, violations: true, studentsStats: true }) {
  try {
    // 1. Reset User Stats and Wildcards
    if (options.studentsStats || options.rankings) {
      const { data: users, error: fetchErr } = await supabase.from('profiles').select('id').neq('role', 'ADMIN');
      if (fetchErr) throw fetchErr;

      if (users && users.length > 0) {
        const uids = users.map(u => u.id);
        const updates: any = {};
        
        if (options.rankings || options.studentsStats) {
          updates.average_grade = 0;
          updates.total_points = 0;
          updates.stats = {
            quizzesAttempted: 0,
            quizzesCompleted: 0,
            perfectScores: 0,
            totalTimeSpent: 0
          };
        }
        
        if (options.studentsStats) {
          updates.wildcards = { '50_50': 0, 'EXTRA_POINTS': 0, 'CHANGE_QUESTION': 0, 'REVEAL_ANSWER': 0 };
          updates.treasure_missions = { dailyCount: 0, lastResetDay: '' };
          updates.last_daily_reward_at = 0;
          updates.tab_violations = 0;
          updates.phone_violations = 0;
          updates.is_blocked = false;
          updates.active = true;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await supabase.from('profiles').update(updates).in('id', uids);
          if (updateErr) throw updateErr;
        }
      }
    }

    // 2. Delete attempts
    if (options.attempts) {
      const { error } = await supabase.from('attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    }

    // 3. Delete violations
    if (options.violations) {
      const { error } = await supabase.from('violations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    }

    // 4. Reset quiz metrics or delete quizzes
    if (options.quizzes) {
       const { error } = await supabase.from('quizzes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
       if (error) throw error;
    } else if (options.attempts) {
       const { error } = await supabase.from('quizzes').update({
         attemptsCount: 0,
         averageScore: 0
       }).neq('id', '00000000-0000-0000-0000-000000000000');
       if (error) throw error;
    }

    // 5. Delete groups
    if (options.groups) {
       const { error } = await supabase.from('groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
       if (error) throw error;
    }

    notify('SISTEMA ACTUALIZADO: La limpieza granular se completó con éxito.', 'success');
    return true;
  } catch (error) {
    console.error('Error resetting data:', error);
    notify('ERROR EN PURGA DE DATOS: No se pudo completar la limpieza.', 'error');
    return false;
  }
}
