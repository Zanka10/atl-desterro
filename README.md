# Atlético Desterro — Gestão Esportiva e Financeira

Plataforma web do clube: atletas, mensalidades, caixa, partidas, convocação, escalação visual, arte da escalação, estatísticas, disciplina, portal do atleta e relatórios.

**Tecnologia:** Next.js 16 (React 19) · Tailwind CSS 4 · Supabase (PostgreSQL, autenticação e Storage) · jsPDF · SheetJS · Recharts.

---

## 1. Colocar no ar (primeira vez)

### 1.1 Criar o banco no Supabase

1. Crie uma conta e um projeto em <https://supabase.com> (o plano gratuito atende).
2. No menu **SQL Editor**, abra uma nova consulta, cole **todo** o conteúdo de
   [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e clique em **Run**.
   Isso cria as tabelas, as regras de permissão, a auditoria e as pastas de arquivos.
   Em seguida, faça o mesmo, nesta ordem, com [`0002_taxa_por_jogo.sql`](supabase/migrations/0002_taxa_por_jogo.sql) (taxa por jogo e crédito) e [`0003_acesso_telefone.sql`](supabase/migrations/0003_acesso_telefone.sql) (entrada do atleta por telefone + PIN).
3. Em **Authentication → URL Configuration**:
   - **Site URL:** o endereço do sistema (em testes: `http://localhost:3000`).
   - **Redirect URLs:** adicione `http://localhost:3000/auth/callback` e, depois de publicar, `https://SEU-DOMINIO/auth/callback`.

### 1.2 Configurar as chaves

Copie `.env.example` para `.env.local` e preencha (as chaves ficam em **Project Settings → API**):

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Endereço do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública (anon / publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim* | Chave secreta, usada só no servidor para o administrador criar e excluir usuários |
| `OPENAI_API_KEY` | não | Habilita “Gerar fundo com IA” na arte da escalação |
| `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` | não | Habilita o envio direto pela WhatsApp Business Cloud API |

\* Sem ela o sistema funciona, mas a tela **Usuários** não consegue criar novos acessos.
**Nunca** exponha a `service_role` no navegador nem a publique em repositórios.

### 1.3 Rodar

```bash
npm install
npm run dev        # desenvolvimento: http://localhost:3000
npm run build && npm start   # produção
```

### 1.4 Criar o administrador

Abra o sistema, clique em **“Primeiro acesso: criar o administrador”** e cadastre-se.
O **primeiro** usuário criado vira administrador automaticamente. Depois disso, novos usuários só são criados pelo administrador em **Usuários** (cadastros avulsos ficam bloqueados até liberação).

> O Supabase envia um e-mail de confirmação no primeiro cadastro. Abra o link **no mesmo navegador**.
> Para uso contínuo, configure um SMTP próprio em *Authentication → Emails* (o envio padrão do Supabase tem limite baixo de e-mails por hora).

### 1.5 Publicar na internet

O sistema está publicado na [Vercel](https://vercel.com) (plano Hobby, gratuito) em <https://atletico-desterro-chi.vercel.app>, no projeto **atletico-desterro** da equipe *thiago-zanchets-projects*, com o código em <https://github.com/Zanka10/atl-desterro>.

- As variáveis de ambiente de produção ficam em **Vercel → Settings → Environment Variables** (as mesmas do `.env.local`).
- Com o repositório conectado em **Vercel → Settings → Git**, cada envio para a branch `main` publica automaticamente.
- No Supabase, **Authentication → URL Configuration** precisa ter o endereço do site em *Site URL* e `https://atletico-desterro-chi.vercel.app/auth/callback` em *Redirect URLs*.
- Os commits precisam ser feitos com um e-mail ligado à conta do GitHub que é dona do projeto na Vercel; caso contrário, a Vercel bloqueia a publicação (*TEAM_ACCESS_REQUIRED*).

---

## 2. Perfis de acesso

| Perfil | Acesso |
|---|---|
| **Administrador** | Tudo, incluindo usuários, configurações e backup |
| **Diretoria** | Atletas, partidas, financeiro, relatórios e configurações |
| **Tesoureiro** | Mensalidades, caixa, patrocinadores, inadimplência e relatórios financeiros |
| **Comissão técnica** | Elenco, convocações, escalações, estatísticas, disciplina e lesões |
| **Atleta** | Somente o portal individual (seus dados, mensalidades, jogos, escalações publicadas e estatísticas) |

As permissões são aplicadas **no banco de dados** (Row Level Security), não apenas na tela:
a situação financeira de um atleta não é visível para os outros atletas nem para a comissão técnica;
lesões e observações da comissão ficam restritas a administrador e comissão técnica.

**Acesso dos atletas:** o atleta entra em `/entrar` com o **telefone cadastrado** e um **PIN de 4 números** — sem e-mail nem senha. A comissão/diretoria gera o PIN em **Atletas → Acessos ao portal** (todos de uma vez) ou na ficha do atleta; o WhatsApp abre com a mensagem pronta (link, telefone e PIN). O PIN é guardado só como hash, aparece uma única vez e pode ser trocado pelo atleta em *Meus dados*. Após 5 PINs errados, a entrada fica bloqueada por 15 minutos. Se o atleta esquecer o PIN, gere um novo. O link enviado na convocação leva direto para essa tela.

---

## 3. Como as principais regras funcionam

- **Taxa por jogo:** o clube não cobra mensalidade. Cada atleta que **confirma presença** em um jogo recebe uma taxa (inicialmente R$ 25,00) com pagamento **até a data do jogo**. O valor é alterado em **Taxas de jogo → Configurar**, com a opção de aplicar o novo valor às taxas em aberto dos próximos jogos (taxas pagas não mudam).
- **Crédito:** se o atleta pagou e não foi ao jogo — avisou ausência, foi retirado da convocação, o jogo foi cancelado/excluído ou a comissão marcou "Não poderá comparecer" depois do jogo — o valor pago vira **crédito**, descontado automaticamente no próximo jogo que ele confirmar (inteiro ou parcial, se o valor do jogo mudou). O crédito já está no caixa, então o abatimento não gera novo lançamento. Saldo, extrato e ajuste manual (ex.: devolução em dinheiro) ficam na aba **Créditos**; o atleta vê o próprio saldo no portal. Se a taxa ainda não tinha sido paga, ela simplesmente é removida.
- **Presença:** o atleta só pode confirmar ou desmarcar presença até o horário do jogo; depois disso, só a comissão técnica altera.
- **Inadimplência:** taxa não paga até o dia do jogo torna o atleta **inadimplente** a partir do dia seguinte. Situações: Em dia, Pendente, Inadimplente, Isento, Em negociação.
- **Pagamento:** ao registrar o pagamento de uma taxa, a receita entra no caixa (categoria “Taxas de jogo”) na mesma operação; o estorno desfaz as duas coisas.
- **Caixa:** o saldo é sempre a soma dos lançamentos confirmados. Toda inclusão, alteração e exclusão fica no **registro de auditoria**.
- **Escalação:** atleta suspenso, lesionado, afastado ou que avisou ausência só é escalado com autorização de administrador/diretoria — a regra é verificada também no banco.
- **Horários:** tudo em horário de Brasília; valores em R$; datas no padrão brasileiro.

---

## 4. WhatsApp e arte da escalação — o que é automático e o que não é

- **WhatsApp (padrão):** os botões abrem o WhatsApp com a mensagem pronta (convocação, lembrete, alteração de horário, cobrança da taxa, confirmação de pagamento, comunicados) — **você confere e toca em enviar**. Imagens e PDFs usam o menu “compartilhar” do celular; no computador o arquivo é baixado para anexar. O sistema não simula envios.
- **WhatsApp Business API (opcional):** com `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`, aparece o botão “Enviar pela API oficial”. A Meta só entrega texto livre dentro da janela de 24 h de conversa; fora dela são necessários modelos (templates) aprovados na conta do clube.
- **Arte da escalação:** escudo, fotos, nomes, números, formação e reservas são desenhados pelo próprio sistema (sempre corretos), em três formatos (feed 4:5, story 9:16, quadrado 1:1) e três estilos, com download em PNG, JPG e PDF. A **IA** (opcional, `OPENAI_API_KEY`) gera o cenário de fundo da arte — não os textos nem os rostos, que geradores de imagem costumam distorcer.

---

## 5. Backup

Em **Configurações → Backup** (administrador): baixa um arquivo JSON com todos os dados e permite restaurá-lo.
Fotos, comprovantes e contas de usuário ficam no Supabase e não entram no arquivo.

---

## 6. Estrutura do projeto

```
supabase/migrations/0001_schema.sql   banco: tabelas, funções, permissões (RLS), storage
scripts/testar-sql.mjs                testes das regras do banco (npm run test:sql)
src/proxy.ts                          sessão e redirecionamento de quem não está logado
src/app/(auth)/                       login, primeiro acesso, recuperação de senha
src/app/(app)/                        módulos do sistema (painel, atletas, partidas, caixa…)
src/app/api/                          usuários (admin), WhatsApp Business API, fundo por IA
src/components/                       interface: layout, formulários, editor de escalação, arte, gráficos
src/lib/                              formatação, constantes, exportações, mensagens, regras
```

`npm run test:sql` executa o schema em um PostgreSQL embarcado e valida 80 regras de negócio e de permissão
(primeiro usuário vira admin, pagamento lança no caixa, atleta não vê dados de outros, bloqueio de suspensos etc.).
