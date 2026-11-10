'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Botao, Rotulo, estiloCampo } from './ui';

const ERROS: [RegExp, string][] = [
  [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/Email not confirmed/i, 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).'],
  [/already registered/i, 'Este e-mail já está cadastrado.'],
  [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
  [/should be different/i, 'A nova senha deve ser diferente da anterior.'],
  [/Failed to fetch/i, 'Falha de conexão. Verifique sua internet.'],
];
const traduzir = (m: string) => ERROS.find(([re]) => re.test(m))?.[1] ?? m;

function Moldura({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8"
      style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cor-primaria) 45%, transparent), transparent 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escudo.jpg" alt="Escudo do Atlético Desterro" className="h-28 w-28 rounded-3xl shadow-2xl ring-2 ring-white/20" />
          <p className="font-display mt-4 text-2xl font-bold uppercase tracking-wide text-white">Atlético Desterro</p>
          <p className="text-xs uppercase tracking-[0.25em] text-accent">Gestão do clube</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <h1 className="text-xl font-bold uppercase text-zinc-900">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-zinc-500">{descricao}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </main>
  );
}

const Alerta = ({ tipo, children }: { tipo: 'erro' | 'ok'; children: ReactNode }) => (
  <p role="alert" className={`mb-3 rounded-lg px-3 py-2 text-sm ${tipo === 'erro' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{children}</p>
);

function FormLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(params.get('erro') === 'link' ? 'O link utilizado é inválido ou expirou. Solicite um novo.' : '');
  const [carregando, setCarregando] = useState(false);
  const [inicializado, setInicializado] = useState(true);

  useEffect(() => {
    createClient().rpc('sistema_inicializado').then(({ data }: { data: boolean | null }) => setInicializado(data !== false));
  }, []);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !senha) return setErro('Informe e-mail e senha.');
    setCarregando(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(traduzir(error.message));
      setCarregando(false);
      return;
    }
    router.replace('/');
    router.refresh();
  };

  return (
    <Moldura titulo="Entrar" descricao="Acesse com seu e-mail e senha.">
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <form onSubmit={entrar} className="space-y-3" noValidate>
        <Rotulo rotulo="E-mail"><input type="email" autoComplete="email" className={estiloCampo} value={email} onChange={(e) => setEmail(e.target.value)} /></Rotulo>
        <Rotulo rotulo="Senha"><input type="password" autoComplete="current-password" className={estiloCampo} value={senha} onChange={(e) => setSenha(e.target.value)} /></Rotulo>
        <Botao type="submit" carregando={carregando} className="w-full">Entrar</Botao>
      </form>
      <div className="mt-4 flex flex-col gap-1.5 text-center text-sm">
        <Link href="/recuperar-senha" className="text-primary hover:underline">Esqueci minha senha</Link>
        {!inicializado && <Link href="/primeiro-acesso" className="font-medium text-primary hover:underline">Primeiro acesso: criar o administrador</Link>}
      </div>
    </Moldura>
  );
}
export const TelaLogin = () => <Suspense><FormLogin /></Suspense>;

export function TelaPrimeiroAcesso() {
  const router = useRouter();
  const [estado, setEstado] = useState<'verificando' | 'livre' | 'bloqueado' | 'enviado'>('verificando');
  const [f, setF] = useState({ nome: '', email: '', senha: '', confirma: '' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    createClient().rpc('sistema_inicializado').then(({ data, error }: { data: boolean | null; error: unknown }) => {
      if (error) setErro('Não foi possível consultar o banco. Confirme se o arquivo SQL foi executado no Supabase.');
      setEstado(data === false ? 'livre' : 'bloqueado');
    });
  }, []);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.nome.trim()) return setErro('Informe seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setErro('Informe um e-mail válido.');
    if (f.senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.');
    if (f.senha !== f.confirma) return setErro('As senhas não conferem.');
    setCarregando(true);
    const { data, error } = await createClient().auth.signUp({
      email: f.email.trim(), password: f.senha,
      options: { data: { nome: f.nome.trim() }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setCarregando(false);
    if (error) return setErro(traduzir(error.message));
    if (data.session) { router.replace('/'); router.refresh(); } else setEstado('enviado');
  };

  const campo = (k: keyof typeof f) => ({ className: estiloCampo, value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Moldura titulo="Primeiro acesso" descricao="Crie a conta do administrador do sistema.">
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {estado === 'verificando' && <p className="text-sm text-zinc-500">Verificando…</p>}
      {estado === 'bloqueado' && !erro && <Alerta tipo="ok">O sistema já possui administrador. Novos usuários são criados por ele em Usuários.</Alerta>}
      {estado === 'enviado' && <Alerta tipo="ok">Conta criada! Enviamos um link de confirmação para {f.email}. Abra-o neste mesmo navegador para concluir.</Alerta>}
      {estado === 'livre' && (
        <form onSubmit={criar} className="space-y-3" noValidate>
          <Rotulo rotulo="Nome completo"><input {...campo('nome')} autoComplete="name" /></Rotulo>
          <Rotulo rotulo="E-mail"><input {...campo('email')} type="email" autoComplete="email" /></Rotulo>
          <Rotulo rotulo="Senha" dica="Mínimo de 8 caracteres."><input {...campo('senha')} type="password" autoComplete="new-password" /></Rotulo>
          <Rotulo rotulo="Confirmar senha"><input {...campo('confirma')} type="password" autoComplete="new-password" /></Rotulo>
          <Botao type="submit" carregando={carregando} className="w-full">Criar administrador</Botao>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar para o login</Link></p>
    </Moldura>
  );
}

export function TelaRecuperar() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg({ tipo: 'erro', texto: 'Informe um e-mail válido.' });
    setCarregando(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha` });
    setCarregando(false);
    setMsg(error ? { tipo: 'erro', texto: traduzir(error.message) } : { tipo: 'ok', texto: 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.' });
  };
  return (
    <Moldura titulo="Recuperar senha" descricao="Enviaremos um link para o seu e-mail.">
      {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}
      <form onSubmit={enviar} className="space-y-3" noValidate>
        <Rotulo rotulo="E-mail"><input type="email" autoComplete="email" className={estiloCampo} value={email} onChange={(e) => setEmail(e.target.value)} /></Rotulo>
        <Botao type="submit" carregando={carregando} className="w-full">Enviar link</Botao>
      </form>
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar para o login</Link></p>
    </Moldura>
  );
}

export function TelaRedefinir() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [logado, setLogado] = useState<boolean | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }: { data: { user: unknown } }) => setLogado(!!data.user));
  }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.');
    if (senha !== confirma) return setErro('As senhas não conferem.');
    setCarregando(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    if (error) { setCarregando(false); return setErro(traduzir(error.message)); }
    router.replace('/');
    router.refresh();
  };
  return (
    <Moldura titulo="Nova senha" descricao="Defina uma nova senha de acesso.">
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {logado === false ? (
        <>
          <Alerta tipo="erro">Link inválido ou expirado. Solicite uma nova recuperação de senha.</Alerta>
          <p className="text-center text-sm"><Link href="/recuperar-senha" className="text-primary hover:underline">Solicitar novo link</Link></p>
        </>
      ) : (
        <form onSubmit={salvar} className="space-y-3" noValidate>
          <Rotulo rotulo="Nova senha" dica="Mínimo de 8 caracteres."><input type="password" autoComplete="new-password" className={estiloCampo} value={senha} onChange={(e) => setSenha(e.target.value)} /></Rotulo>
          <Rotulo rotulo="Confirmar nova senha"><input type="password" autoComplete="new-password" className={estiloCampo} value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Rotulo>
          <Botao type="submit" carregando={carregando} className="w-full">Salvar nova senha</Botao>
        </form>
      )}
    </Moldura>
  );
}
