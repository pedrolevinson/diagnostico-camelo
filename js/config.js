'use strict';
/* Configuração do backend (Supabase). A chave "anon" é pública por
   definição: só permite ENVIAR dados (as leituras são bloqueadas por
   RLS e exigem o código da equipe via função painel). */
const CONFIG = {
  centralCode: 'agua-camelo-2026',
  supabaseUrl: 'https://wggmvmiqbdyxvfjxbjxn.supabase.co',
  supabaseAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZ212bWlxYmR5eHZmanhianhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDkyMTgsImV4cCI6MjEwMDgyNTIxOH0.tEYkpxgghsQiM0dyCdkyzIZpolNHYqIYG88nv7XDVTY'
};
