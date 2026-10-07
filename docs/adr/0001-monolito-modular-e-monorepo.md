# ADR 0001: Monólito modular em monorepo

**Situação:** aceita (Etapa 1)

## Contexto

O repositório tinha só o painel React + Vite, com dados fixos e sem servidor. A plataforma precisa de API, banco, regras financeiras e, mais tarde, checkout público e painel administrativo.

## Decisão

- Um repositório com workspaces do npm: `apps/web` (painel existente, mantido), `apps/api` (NestJS) e `packages/shared` (regras usadas pelos dois lados).
- A API é um monólito modular: uma pasta por módulo (`auth`, `account`, `organizations`, `audit`, `notifications`), cada uma com fronteira clara. Pagamentos, livro-razão, webhooks e saques entram como novos módulos e podem virar serviços separados depois, se o volume pedir.
- O painel continua em React + Vite. Reescrever em Next.js agora não traria ganho para telas atrás de login; a decisão volta à mesa na etapa do site público e do checkout.
- O schema do Prisma fica em `apps/api/prisma`, e não em um pacote separado, porque só a API fala com o banco.

## Consequências

- `packages/shared` é a única fonte da matriz de permissões e das validações de CPF, CNPJ, e-mail, telefone e senha. A API aplica a regra; o painel só esconde o que a API já negaria.
- A API consome `@velqyro/shared` compilado (`dist`), então `npm run build -w @velqyro/shared` roda antes do build e dos testes da API. Os scripts da raiz já fazem isso. O painel lê o código-fonte direto, por alias do Vite.
