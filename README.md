# VELQYRO PAY

Plataforma de pagamentos para o mercado brasileiro: checkout, painel do lojista, API e, nas próximas etapas, Pix, cartão, saldo e saques por meio de provedores externos.

> **Situação atual: Etapa 1 (Fundação).** Cadastro, login, sessões, verificação em duas etapas, organizações, equipe com papéis e auditoria já funcionam de verdade, com banco de dados. As telas de Produtos, Checkout, Vendas, Clientes e Financeiro ainda mostram **dados de demonstração** e passam a usar a API nas etapas 3 a 5. Nenhum pagamento real é processado.

## Estrutura

```
apps/
  web/        Painel (React + Vite + TypeScript)
  api/        API (NestJS + Prisma + PostgreSQL)
packages/
  shared/     Regras usadas pela API e pelo painel: papéis, permissões, CPF/CNPJ, senha
infrastructure/docker/   PostgreSQL local
docs/         Decisões de arquitetura (adr/) e relatório de cada etapa
```

## Como rodar

Você precisa de **Node.js 22** e de **Docker** (ou de um PostgreSQL 14 ou mais novo já instalado).

```bash
# 1. Dependências
npm install

# 2. Configuração da API (no Windows: copy apps\api\.env.example apps\api\.env)
cp apps/api/.env.example apps/api/.env

# 3. Banco de dados local
npm run db:up        # sobe o PostgreSQL no Docker
npm run db:deploy    # cria as tabelas
npm run db:seed      # opcional: cria a conta de demonstração

# 4. API e painel juntos
npm run dev
```

- Painel: http://localhost:5173
- API: http://localhost:3333/api/health
- Caixa de saída de desenvolvimento: http://localhost:5173/dev/caixa-de-saida

Em desenvolvimento **nenhum e-mail ou SMS sai de verdade**. Links de confirmação, de redefinição de senha e convites aparecem na caixa de saída.

Duas variáveis do `apps/api/.env` merecem atenção:

- `NODE_ENV`: sem ela a API se comporta como produção e exige a configuração completa de produção. O `.env.example` já traz `development`.
- `DEV_OUTBOX=true`: liga a caixa de saída. A API se recusa a subir com ela em produção, porque a caixa mostra links de acesso e códigos.

### Conta de demonstração

Criada por `npm run db:seed`:

| E-mail | Senha | Papel em Estúdio Pixel Norte |
| --- | --- | --- |
| marina@exemplo.com | velqyro123 | Proprietário |
| rafael@exemplo.com | velqyro123 | Financeiro |
| bianca@exemplo.com | velqyro123 | Desenvolvedor |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API e painel em modo de desenvolvimento |
| `npm run build` | Compila as regras compartilhadas, a API e o painel |
| `npm run typecheck` | Confere os tipos de tudo |
| `npm run lint` | ESLint |
| `npm test` | Testes das regras compartilhadas e da API |
| `npm run db:migrate` | Cria uma migration nova depois de mudar `schema.prisma` |
| `npm run db:deploy` | Aplica as migrations pendentes |

Os testes de ponta a ponta da API **apagam as tabelas antes de rodar**. Por isso usam sempre um banco separado, `velqyro_test`, criado sozinho na primeira execução. Para apontar para outro servidor, defina `TEST_DATABASE_URL` (o nome do banco precisa terminar em `_test`).

## O que a Etapa 1 entrega

- **Conta:** cadastro, login, logout, confirmação de e-mail por link e de telefone por código, recuperação e troca de senha.
- **Segurança:** senha com hash scrypt, bloqueio da conta após 5 tentativas erradas (senha ou código), sessão em cookie `httpOnly`, lista de dispositivos, 2FA por aplicativo autenticador com códigos de uso único e códigos de recuperação, limite de requisições e proteção contra CSRF.
- **Organizações:** cadastro PF ou PJ com CPF/CNPJ validado (inclusive o CNPJ com letras, emitido desde julho de 2026), várias organizações por pessoa e seletor no painel.
- **Equipe:** convites por e-mail, seis papéis (Proprietário, Administrador, Financeiro, Desenvolvedor, Suporte, Visualizador), troca de papel e remoção.
- **Permissões:** uma matriz única em `packages/shared`, aplicada no servidor em cada rota. Ninguém concede nem retira um papel com mais poder que o seu.
- **Isolamento:** uma organização nunca lê dados de outra.
- **Auditoria:** registro de ações sensíveis que o banco não deixa alterar, apagar nem esvaziar.

## Regras do projeto

1. Interface, e-mails e erros em português do Brasil.
2. Dinheiro sempre em centavos inteiros (a partir da Etapa 3). Nunca `float`.
3. Dados de cartão nunca são armazenados: só token, bandeira e últimos 4 dígitos.
4. Saldo é consequência do livro-razão. Nunca `saldo = saldo + valor`.
5. Validação sempre no servidor. O painel valida para ajudar, não para proteger.
6. Segredos em variáveis de ambiente. O `.env` nunca vai para o repositório.
7. Nenhuma tela finge movimentar dinheiro real.

## Próximas etapas

| Etapa | Conteúdo |
| --- | --- |
| 2 | Site público e onboarding com envio de documentos (KYC/KYB) |
| 3 | Produtos, clientes, pedidos, links de pagamento e checkout com dados reais |
| 4 | Orquestrador de pagamentos, provedor Sandbox, Pix e cartão |
| 5 | Livro-razão, saldos, taxas, extrato, saques e reembolsos |
| 6 | Chaves de API, API pública, webhooks, logs e documentação |
| 7 | Painel administrativo, antifraude, contestações |

Decisões de arquitetura: [`docs/adr`](docs/adr). Relatório desta etapa: [`docs/etapa-1-relatorio.md`](docs/etapa-1-relatorio.md).
