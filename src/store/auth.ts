import { create } from 'zustand';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { errorService } from '../services/errorService';

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PENDING';

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  full_name?: string;
  generatedId?: string;
  active: boolean;
  isFirstTime?: boolean;
  groupIds?: string[];
  subjectIds?: string[];
  matricula?: string;
  wildcards?: Record<string, number>;
  averageGrade?: number;
  id?: string;
  lastSeenAt?: number;
}

interface AuthStore {
  user: AppUser | null;
  canonicalRole: UserRole | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  is_teacher_domain: boolean;
  setUser: (user: AppUser | null, sbUser: SupabaseUser | null) => void;
  setActiveRole: (role: UserRole) => void;
  setLoading: (loading: boolean) => void;
  fetchProfile: (uid: string) => Promise<AppUser | null>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  canonicalRole: null,
  supabaseUser: null,
  loading: true,
  is_teacher_domain: false,
  setUser: (user, supabaseUser) => set((state) => {
    const newCanonical = user?.role || null;
    let activeRole = newCanonical;
    if (state.user && state.canonicalRole && state.user.role !== state.canonicalRole) {
      activeRole = state.user.role;
    }

    const email = user?.email || '';
    const is_teacher_domain = email.endsWith('@gmail.com'); // Example domain logic

    return { 
      user: user ? { ...user, role: activeRole as UserRole, full_name: user.displayName || user.full_name } : null, 
      canonicalRole: newCanonical,
      supabaseUser, 
      loading: false,
      is_teacher_domain
    };
  }),
  setActiveRole: (role) => set((state) => ({ 
    user: state.user ? { ...state.user, role } : null 
  })),
  setLoading: (loading) => set({ loading }),
  fetchProfile: async (uid) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      const profile: AppUser = {
        uid: data.id,
        email: data.email,
        role: data.role as UserRole,
        displayName: data.display_name,
        full_name: data.display_name,
        active: data.active,
        groupIds: data.group_ids,
        subjectIds: data.subject_ids,
        matricula: data.matricula,
        wildcards: data.wildcards,
        averageGrade: data.average_grade,
        lastSeenAt: data.last_seen_at ? new Date(data.last_seen_at).getTime() : undefined,
        isFirstTime: data.is_first_time
      };

      return profile;
    } catch (e) {
      console.error("Profile Fetch Error:", e);
      return null;
    }
  }
}));
