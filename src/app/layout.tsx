import type { Metadata, Viewport } from 'next';
import { Inter, Oswald } from 'next/font/google';
import { supabaseConfigurado } from '@/lib/supabase/client';
import './globals.css';

const corpo = Inter({ subsets: ['latin'], variable: '--font-corpo' });
const titulo = Oswald({ subsets: ['latin'], variable: '--font-titulo' });

export const metadata: Metadata = {
  title: 'Atlético Desterro — Gestão do Clube',
  description: 'Plataforma de gestão esportiva e financeira do Atlético Desterro Futebol Clube.',
  icons: { icon: '/escudo.jpg', apple: '/escudo.jpg' },
};
export const viewport: Viewport = { themeColor: '#111111', width: 'device-width', initialScale: 1 };

function ConfiguracaoPendente() {
  const cod = 'rounded bg-zinc-200 px-1';
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/escudo.jpg" alt="Escudo do Atlético Desterro" className="mb-6 h-24 w-24 rounded-2xl shadow" />
      <h1 className="text-3xl font-bold uppercase">Falta conectar o banco de dados</h1>
      <p className="mt-3 text-zinc-600">O sistema precisa de um projeto Supabase para funcionar. Siga os passos:</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
        <li>Crie um projeto gratuito em <strong>supabase.com</strong>.</li>
        <li>No <strong>SQL Editor</strong>, cole e execute o conteúdo de <code className={cod}>supabase/migrations/0001_schema.sql</code>.</li>
        <li>Copie <code className={cod}>.env.example</code> para <code className={cod}>.env.local</code> e preencha a URL e as chaves do projeto (Project Settings → API).</li>
        <li>Reinicie o servidor (<code className={cod}>npm run dev</code>) e recarregue esta página.</li>
      </ol>
      <p className="mt-4 text-sm text-zinc-500">O passo a passo completo está no arquivo README.md.</p>
    </main>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${corpo.variable} ${titulo.variable}`}>
      <body>{supabaseConfigurado ? children : <ConfiguracaoPendente />}</body>
    </html>
  );
}
