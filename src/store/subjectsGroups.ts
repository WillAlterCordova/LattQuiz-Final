import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorService } from '../services/errorService';

interface Subject {
  id: string;
  name: string;
  createdAt: number;
}

interface Group {
  id: string;
  name: string;
  createdAt: number;
}

interface SubjectsGroupsStore {
  subjects: Subject[];
  groups: Group[];
  loading: boolean;
  init: () => void;
  addSubject: (name: string) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
}

export const useSubjectsGroupsStore = create<SubjectsGroupsStore>((set, get) => ({
  subjects: [],
  groups: [],
  loading: true,

  init: () => {
    const fetchData = async () => {
      try {
        set({ loading: true });
        const [resS, resG] = await Promise.all([
          supabase.from('subjects').select('*').order('name'),
          supabase.from('groups').select('*').order('name')
        ]);
        
        if (resS.error) throw resS.error;
        if (resG.error) throw resG.error;

        const subjects = resS.data.map(s => ({ 
          id: s.id, 
          name: s.name, 
          createdAt: new Date(s.created_at).getTime() 
        } as Subject));
        
        const groups = resG.data.map(g => ({ 
          id: g.id, 
          name: g.name, 
          createdAt: new Date(g.created_at).getTime() 
        } as Group));
        
        set({ subjects, groups, loading: false });
      } catch (err) {
        console.warn('Store load failed:', err);
        set({ loading: false });
      }
    };

    fetchData();
  },

  addSubject: async (name: string) => {
    try {
      if (get().subjects.some(s => s.name === name)) return;
      const { data, error } = await supabase
        .from('subjects')
        .insert([{ name }])
        .select()
        .single();
      
      if (error) throw error;
      set(state => ({ 
        subjects: [...state.subjects, { id: data.id, name: data.name, createdAt: new Date(data.created_at).getTime() }] 
      }));
    } catch (e) {
      errorService.handle(e, 'Add Subject');
    }
  },

  removeSubject: async (id: string) => {
    try {
      const { error } = await supabase.from('subjects').delete().eq('id', id);
      if (error) throw error;
      set(state => ({ subjects: state.subjects.filter(s => s.id !== id) }));
    } catch (e) {
      errorService.handle(e, 'Remove Subject');
    }
  },

  addGroup: async (name: string) => {
    try {
      if (get().groups.some(g => g.name === name)) return;
      const { data, error } = await supabase
        .from('groups')
        .insert([{ name }])
        .select()
        .single();
      
      if (error) throw error;
      set(state => ({ 
        groups: [...state.groups, { id: data.id, name: data.name, createdAt: new Date(data.created_at).getTime() }] 
      }));
    } catch (e) {
      errorService.handle(e, 'Add Group');
    }
  },

  removeGroup: async (id: string) => {
    try {
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if (error) throw error;
      set(state => ({ groups: state.groups.filter(g => g.id !== id) }));
    } catch (e) {
      errorService.handle(e, 'Remove Group');
    }
  },
}));
