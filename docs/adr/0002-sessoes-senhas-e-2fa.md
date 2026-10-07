# ADR 0002: Sessões por cookie, hash de senha e 2FA

**Situação:** aceita (Etapa 1)

## Sessões

- Sessão opaca: um token aleatório de 256 bits vai para o navegador em cookie `httpOnly`, `SameSite=Lax` e, em produção, `Secure`. O banco guarda só o SHA-256 do token.
- Encerrar uma sessão é marcar a linha como revogada, o que vale na requisição seguinte. Por isso sessões opacas em vez de JWT: dá para listar dispositivos, sair de todos e derrubar tudo ao trocar a senha.
- O painel chama a API pelo mesmo endereço (`/api`), por proxy do Vite em desenvolvimento e por proxy reverso em produção. O cookie é de mesma origem.
- CSRF: além do `SameSite=Lax`, a API recusa requisições de escrita cujo cabeçalho `Origin` não esteja em `WEB_ORIGINS`.

## Senhas

- Hash com **scrypt** (nativo do Node), parâmetros N=2^15, r=8, p=3, sal de 16 bytes por senha. É uma das configurações recomendadas pela OWASP.
- O formato guarda os parâmetros junto do hash. Se eles forem endurecidos, o login regrava a senha com os novos parâmetros (`needsRehash`).
- Argon2id foi considerado. Ficou para depois porque exige uma dependência nativa; trocar é localizado em `apps/api/src/crypto/password.ts`.
- O login gasta o mesmo tempo e devolve a mesma mensagem para e-mail inexistente e senha errada.

## Tentativas erradas

- Um contador só, por conta: senha errada no login, código errado do segundo fator e senha errada nas rotas que a pedem de novo (trocar a senha, ativar ou desativar o 2FA) somam juntos. Cinco erros bloqueiam a conta por 15 minutos.
- O incremento é feito pelo banco, então requisições simultâneas não ganham tentativas extras.
- Com 2FA ativo, o contador só zera quando o segundo fator passa. Acertar a senha e entrar de novo não devolve tentativas.
- Código do telefone: 5 tentativas por código e 5 códigos por hora.
- Redefinição de senha: um pedido por minuto por conta, e um pedido novo não invalida o link anterior. Assim, quem só conhece o e-mail de alguém não inutiliza o link que a pessoa acabou de receber.

## 2FA

- TOTP (RFC 6238, SHA-1, 6 dígitos, 30 segundos), implementado com `node:crypto` e testado com os vetores das RFCs 4226 e 6238.
- O segredo fica cifrado no banco com AES-256-GCM, usando `APP_ENCRYPTION_KEY`.
- Cada código vale uma vez: o banco guarda o último passo de tempo aceito e só avança.
- Oito códigos de recuperação, guardados como hash e de uso único.
- Ativar pede a senha atual e encerra as outras sessões da conta.
- Enquanto o segundo fator está pendente, a sessão só acessa as rotas de login, e `GET /auth/me` não devolve nenhum dado da conta.

## Ambiente

- Sem `NODE_ENV` a API se comporta como produção. Esquecer a variável nunca afrouxa as checagens (chave de cifra, cookie seguro).
- A caixa de saída só responde com `DEV_OUTBOX=true`, e a API não sobe com essa variável em produção.
- Em produção, `TRUST_PROXY_HOPS` precisa ser declarado: o IP do cliente, usado no limite de requisições e na auditoria, depende dele.

## Pendências conhecidas

- **Bloqueio como forma de atrapalhar.** Quem conhece o e-mail de alguém consegue manter a conta bloqueada errando a senha de propósito. A saída é trocar o bloqueio fixo por atraso progressivo por conta e IP. Tratar antes de abrir a plataforma ao público.
- **A resposta de bloqueio e o cadastro revelam se um e-mail tem conta.** O login comum não revela; o aviso "conta bloqueada" e o "e-mail já cadastrado" revelam. É a escolha usual, por clareza para o usuário, mas precisa ser decidida de forma consciente antes do lançamento.
- **Corpo das mensagens na caixa de saída.** Links e códigos ficam em texto na tabela `outbox_messages`. Com um provedor real de e-mail e SMS, o corpo deixa de ser gravado.
- **Limite de requisições na memória do processo.** Com mais de uma instância da API, o contador precisa ir para o Redis.
