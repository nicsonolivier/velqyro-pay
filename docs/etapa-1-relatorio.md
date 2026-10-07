# Relatório da Etapa 1: Fundação

Data: 07/10/2026

## Ponto de partida

O repositório tinha 14 arquivos (706 linhas): um painel React + Vite com telas de acesso, dashboard, Produtos, construtor de checkout, Vendas, Clientes e Financeiro. Tudo era visual: sem servidor, sem banco, com dados fixos nos componentes, e qualquer e-mail e senha entravam.

## O que foi criado

**Estrutura**
- Monorepo com workspaces do npm: `apps/web`, `apps/api`, `packages/shared`.
- PostgreSQL local por Docker Compose, `.env.example`, ESLint e GitHub Actions.

**Regras compartilhadas (`packages/shared`)**
- Matriz de permissões: 6 papéis por 11 áreas.
- Validação e formatação de CPF, CNPJ, e-mail e telefone; regras e medidor de senha; estados da conta.

**API (`apps/api`, NestJS + Prisma)**
- Autenticação: cadastro, login, logout, confirmação de e-mail e telefone, recuperação e troca de senha.
- Sessões opacas em cookie, com lista e encerramento por dispositivo.
- 2FA por TOTP com códigos de recuperação.
- Organizações (PF e PJ), membros, convites e troca de papel.
- Guarda de isolamento por organização e de permissão por rota.
- Auditoria somente inserção.
- Erros padronizados em português, validação de entrada, limite de requisições, checagem de origem e ID de requisição.
- Caixa de saída de desenvolvimento no lugar de e-mail e SMS reais.

**Painel (`apps/web`)**
- Telas de acesso ligadas à API, com validação por campo e estados de carregamento e erro.
- Novas telas: verificação em duas etapas, confirmação de e-mail, redefinição de senha, aceite de convite, Equipe, Configurações (Perfil, Segurança, Negócio) e caixa de saída.
- Rotas com endereço próprio, seletor de organização e menu conforme o papel.

## O que mudou no que já existia

- Os arquivos do painel foram movidos para `apps/web` com `git mv`, preservando o histórico.
- `App.tsx` virou o mapa de rotas; o dashboard foi para `pages/Overview.tsx` sem mudança visual.
- `Auth.tsx` manteve o visual e passou a chamar a API.
- Produtos, Checkout, Vendas, Clientes e Financeiro seguem como estavam, com dados de demonstração.
- Removido o cartão "Plano Pro" da barra lateral: o botão não tinha ação e a plataforma ainda não tem planos. No lugar entraram o seletor de organização e o cartão do usuário.
- Integrações e API / Webhooks, que eram botões sem ação, agora abrem uma página que diz em que etapa chegam.
- Corrigido um estouro de largura no celular (a grade do painel não deixava as tabelas rolarem dentro do cartão).

## Banco e migrations

Uma migration, `20261007000000_etapa1_fundacao`, com 10 tabelas: `users`, `sessions`, `verification_tokens`, `two_factor_methods`, `recovery_codes`, `organizations`, `organization_members`, `invitations`, `audit_logs` e `outbox_messages`. Inclui o gatilho que impede alterar ou apagar a auditoria.

## O que foi verificado e como

O ambiente em que este código foi escrito não tinha acesso ao registro de pacotes (npm). Por isso parte da verificação ficou para o GitHub Actions.

| Item | Situação |
| --- | --- |
| Migration aplicada em PostgreSQL 16 real | Passou |
| Gatilho da auditoria recusa `UPDATE` e `DELETE` | Passou |
| Exclusão de usuário remove vínculos e preserva a auditoria | Passou |
| Testes das regras compartilhadas (11) | Passaram |
| Testes de senha, TOTP, cifra e tokens (9), com vetores das RFCs 4226 e 6238 | Passaram, em um executor local equivalente ao Jest |
| Tipos da API e do painel | Conferidos com tipagens substitutas das bibliotecas; falta a conferência com as tipagens reais |
| Telas novas (18 capturas em computador e 5 em celular) | Conferidas com dados simulados e bibliotecas substitutas; sem erros de página nem estouro de largura |
| `npm install`, build da API e do painel | **Não executado.** Roda no GitHub Actions |
| Testes de ponta a ponta da API (22 cenários) | **Escritos, não executados.** Rodam no GitHub Actions |
| Conferência de que a migration bate com o `schema.prisma` | **Não executada.** A migration foi escrita à mão no formato do Prisma; o CI confere com `prisma migrate diff` |
| Lint | **Não executado.** Roda no GitHub Actions |

## Problemas encontrados

- Registro de pacotes bloqueado no ambiente de desenvolvimento (descrito acima).
- O painel original guarda preços como número decimal. Não foi alterado nesta etapa; passa a centavos inteiros na Etapa 3, quando Produtos ganhar API.

## Riscos pendentes

1. **Primeira execução do CI.** Como o build e os testes de ponta a ponta ainda não rodaram, é esperado que apareçam ajustes pequenos (tipagens, versões de dependências, formato da migration).
2. **E-mail e SMS reais.** Só existe a caixa de saída. Antes de qualquer uso real é preciso ligar um provedor de envio.
3. **RLS no PostgreSQL.** O isolamento entre organizações é aplicado na API. A segunda barreira, no banco, entra na Etapa 3.
4. **Limite de requisições em memória.** Com mais de uma instância da API, precisa ir para o Redis.
5. **Reuso de código TOTP** dentro da janela de 90 segundos. Corrigir antes das ações que exigem 2FA (saques).
6. **Hash de senha.** scrypt atende a recomendação da OWASP; a troca para Argon2id está isolada em um arquivo.
7. **Troca de e-mail e transferência de posse** ainda não existem.
8. **Revisão jurídica/compliance.** Termos de uso, política de privacidade, LGPD e o modelo de KYC não foram tratados nesta etapa.

## Próximo passo recomendado

1. Rodar o CI no pull request e corrigir o que aparecer.
2. Etapa 2: site público e onboarding com envio de documentos (KYC/KYB), incluindo o estado "KYC em análise".
