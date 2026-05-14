-- MIGRACIÓN DE NEURAL MISIONES A SUPABASE (POSTGRESQL)
-- Copia y pega este script en el SQL Editor de tu proyecto Supabase.

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PERFILES DE USUARIO
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  email TEXT UNIQUE,
  role TEXT CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN')),
  active BOOLEAN DEFAULT TRUE,
  matricula TEXT,
  group_ids TEXT[], -- Array de IDs de grupos
  subject_ids TEXT[], -- Array de IDs de materias
  average_grade NUMERIC DEFAULT 0,
  wildcards JSONB DEFAULT '{}'::jsonb,
  treasure_missions JSONB DEFAULT '{"dailyCount": 0, "lastResetDay": ""}'::jsonb,
  student_code TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. QUIZZES (MISIONES)
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. QUIZZES (MISIONES)
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users NOT NULL,
  subject_id UUID REFERENCES public.subjects ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT,
  group_id UUID REFERENCES public.groups ON DELETE SET NULL,
  status TEXT DEFAULT 'DRAFT',
  is_open BOOLEAN DEFAULT FALSE,
  questions_count INTEGER DEFAULT 0,
  custom_logo_url TEXT,
  custom_phrase TEXT,
  difficulty TEXT CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  assigned_user_ids UUID[],
  show_feedback BOOLEAN DEFAULT FALSE,
  enable_ai_feedback BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PREGUNTAS
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id UUID REFERENCES public.quizzes ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  type TEXT,
  options JSONB, -- Array de opciones
  correct_answer TEXT,
  explanation TEXT,
  points INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SESIONES (JUEGO EN VIVO)
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id UUID REFERENCES public.quizzes ON DELETE SET NULL,
  teacher_id UUID REFERENCES auth.users NOT NULL,
  status TEXT DEFAULT 'WAITING',
  join_code TEXT UNIQUE,
  type TEXT CHECK (type IN ('CLASICO', 'POR_EQUIPOS', 'A_LA_CIMA', 'LA_TORRE')),
  teams JSONB DEFAULT '[]'::jsonb,
  current_question_index INTEGER DEFAULT 0,
  current_turn_team INTEGER,
  current_turn_player_id TEXT,
  current_turn_player_name TEXT,
  question_start_time TIMESTAMPTZ,
  last_response_correct BOOLEAN,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RESPUESTAS
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users NOT NULL,
  question_id UUID REFERENCES public.questions NOT NULL,
  answer TEXT,
  is_correct BOOLEAN,
  points INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEGURIDAD (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Políticas básicas
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update their own profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Subjects are viewable by authenticated users" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins/Teachers can manage subjects" ON public.subjects FOR ALL USING (auth.role() = 'authenticated'); -- Simplificado para prototipo

CREATE POLICY "Groups are viewable by authenticated users" ON public.groups FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins/Teachers can manage groups" ON public.groups FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Quizzes visible by everyone" ON public.quizzes FOR SELECT USING (TRUE);
CREATE POLICY "Teachers can manage their quizzes" ON public.quizzes FOR ALL USING (auth.uid() = teacher_id);

-- Trigger para crear perfil automáticamente al registrarse en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'STUDENT');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
