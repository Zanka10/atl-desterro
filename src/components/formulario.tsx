'use client';

import { Paperclip } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { enviarArquivo } from '@/lib/arquivos';
import type { Opcao } from '@/lib/constants';
import { inputParaISO, isoParaInput } from '@/lib/format';
import type { Linha } from '@/lib/types';
import { useApp } from './contexto';
import { Botao, Modal, Rotulo, cx, estiloCampo } from './ui';

export type Campo = {
  nome: string;
  rotulo: string;
  tipo?: 'texto' | 'tel' | 'email' | 'senha' | 'numero' | 'dinheiro' | 'data' | 'datahora' | 'selecao' | 'area' | 'caixa' | 'imagem' | 'arquivo' | 'cor';
  opcoes?: Opcao[] | ((v: Linha) => Opcao[]);
  obrigatorio?: boolean;
  largo?: boolean;
  dica?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  mostrar?: (v: Linha) => boolean;
  validar?: (valor: unknown, v: Linha) => string | undefined;
};

const vazio = (v: unknown) => v === null || v === undefined || v === '';

export function FormModal({ aberto, titulo, campos, inicial, aoSalvar, aoFechar, pasta = 'geral', textoBotao = 'Salvar' }: {
  aberto: boolean;
  titulo: string;
  campos: Campo[];
  inicial?: Linha | null;
  aoSalvar: (valores: Linha) => Promise<void>;
  aoFechar: () => void;
  pasta?: string;
  textoBotao?: string;
}) {
  const { supabase, erro } = useApp();
  const [v, setV] = useState<Linha>({});
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const ini: Linha = {};
    for (const c of campos) {
      const bruto = inicial?.[c.nome];
      if (c.tipo === 'datahora') ini[c.nome] = isoParaInput(bruto);
      else if (c.tipo === 'caixa') ini[c.nome] = !!bruto;
      else ini[c.nome] = bruto ?? '';
    }
    setV(ini);
    setArquivos({});
    setErros({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const visiveis = campos.filter((c) => !c.mostrar || c.mostrar(v));
  const definir = (nome: string, valor: unknown) => setV((a) => ({ ...a, [nome]: valor }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    for (const c of visiveis) {
      const val = v[c.nome];
      const temArquivo = !!arquivos[c.nome];
      if (c.obrigatorio && c.tipo !== 'caixa' && vazio(typeof val === 'string' ? val.trim() : val) && !temArquivo) novos[c.nome] = 'Campo obrigatório.';
      else if (!vazio(val)) {
        if (c.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) novos[c.nome] = 'E-mail inválido.';
        if (c.tipo === 'tel' && String(val).replace(/\D/g, '').length < 10) novos[c.nome] = 'Informe o telefone com DDD.';
        if (c.tipo === 'senha' && String(val).length < 8) novos[c.nome] = 'A senha deve ter pelo menos 8 caracteres.';
        if (c.tipo === 'numero' || c.tipo === 'dinheiro') {
          const n = Number(val);
          if (Number.isNaN(n)) novos[c.nome] = 'Número inválido.';
          else if (c.min != null && n < c.min) novos[c.nome] = `O valor mínimo é ${c.min}.`;
          else if (c.max != null && n > c.max) novos[c.nome] = `O valor máximo é ${c.max}.`;
        }
      }
      const personalizado = !novos[c.nome] && c.validar?.(val, v);
      if (personalizado) novos[c.nome] = personalizado;
    }
    setErros(novos);
    if (Object.keys(novos).length) return;

    setSalvando(true);
    try {
      const saida: Linha = {};
      for (const c of visiveis) {
        let val = v[c.nome];
        if (c.tipo === 'imagem' || c.tipo === 'arquivo') {
          if (arquivos[c.nome]) val = await enviarArquivo(supabase, c.tipo === 'imagem' ? 'fotos' : 'documentos', pasta, arquivos[c.nome]);
          saida[c.nome] = vazio(val) ? null : val;
        } else if (c.tipo === 'caixa') saida[c.nome] = !!val;
        else if (vazio(val)) saida[c.nome] = null;
        else if (c.tipo === 'numero' || c.tipo === 'dinheiro') saida[c.nome] = Number(val);
        else if (c.tipo === 'datahora') saida[c.nome] = inputParaISO(val);
        else saida[c.nome] = typeof val === 'string' ? val.trim() : val;
      }
      await aoSalvar(saida);
      aoFechar();
    } catch (ex) {
      erro(ex);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar} largo={visiveis.length > 6}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" form="form-modal" carregando={salvando}>{textoBotao}</Botao>
      </>}>
      <form id="form-modal" onSubmit={enviar} noValidate className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {visiveis.map((c) => {
          const comum = { value: v[c.nome] ?? '', placeholder: c.placeholder, className: estiloCampo, 'aria-invalid': !!erros[c.nome] };
          const mudar = (e: { target: { value: string } }) => definir(c.nome, e.target.value);
          const opcoes = typeof c.opcoes === 'function' ? c.opcoes(v) : c.opcoes ?? [];
          let entrada;
          switch (c.tipo) {
            case 'selecao':
              entrada = (
                <select {...comum} onChange={mudar}>
                  <option value="">Selecione…</option>
                  {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              );
              break;
            case 'area':
              entrada = <textarea {...comum} rows={3} onChange={mudar} />;
              break;
            case 'caixa':
              entrada = (
                <span className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" checked={!!v[c.nome]} onChange={(e) => definir(c.nome, e.target.checked)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
                  <span className="text-sm text-zinc-700">{c.dica ?? 'Sim'}</span>
                </span>
              );
              break;
            case 'imagem':
            case 'arquivo':
              entrada = (
                <span className="flex items-center gap-3">
                  {c.tipo === 'imagem' && (arquivos[c.nome] || v[c.nome]) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={arquivos[c.nome] ? URL.createObjectURL(arquivos[c.nome]) : v[c.nome]} alt="" className="h-14 w-14 rounded-lg border border-zinc-200 object-cover" />
                  )}
                  <span className={cx(estiloCampo, 'flex cursor-pointer items-center gap-2 text-zinc-600')}>
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">{arquivos[c.nome]?.name ?? (v[c.nome] ? 'Arquivo anexado — clique para trocar' : 'Selecionar arquivo…')}</span>
                    <input type="file" className="hidden" accept={c.tipo === 'imagem' ? 'image/*' : 'image/*,application/pdf'}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setArquivos((a) => ({ ...a, [c.nome]: f })); }} />
                  </span>
                </span>
              );
              break;
            case 'cor':
              entrada = (
                <span className="flex items-center gap-2">
                  <input type="color" value={v[c.nome] || '#000000'} onChange={mudar} className="h-9 w-12 rounded border border-zinc-300 bg-white p-0.5" />
                  <input {...comum} onChange={mudar} />
                </span>
              );
              break;
            default: {
              const tipos: Record<string, string> = { tel: 'tel', email: 'email', senha: 'password', numero: 'number', dinheiro: 'number', data: 'date', datahora: 'datetime-local' };
              entrada = <input {...comum} type={tipos[c.tipo ?? ''] ?? 'text'} onChange={mudar} step={c.tipo === 'dinheiro' ? '0.01' : undefined}
                min={c.min} max={c.max} inputMode={c.tipo === 'dinheiro' ? 'decimal' : undefined} autoComplete={c.tipo === 'senha' ? 'new-password' : 'off'} />;
            }
          }
          return (
            <div key={c.nome} className={cx((c.largo || c.tipo === 'area') && 'sm:col-span-2')}>
              <Rotulo rotulo={c.rotulo} obrigatorio={c.obrigatorio} erro={erros[c.nome]} dica={c.tipo === 'caixa' ? undefined : c.dica}>{entrada}</Rotulo>
            </div>
          );
        })}
      </form>
    </Modal>
  );
}
