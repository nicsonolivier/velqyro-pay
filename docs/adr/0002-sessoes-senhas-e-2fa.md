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
- Cinco senhas erradas bloqueiam a conta por 15 minutos. O login gasta o mesmo tempo e devolve a mesma mensagem para e-mail inexistente e senha errada.

## 2FA

- TOTP (RFC 6238, SHA-1, 6 dígitos, 30 segundos), implementado com `node:crypto` e testado com os vetores das RFCs 4226 e 6238.
- O segredo fica cifrado no banco com AES-256-GCM, usando `APP_ENCRYPTION_KEY`.
- Oito códigos de recuperação, guardados como hash e de uso único.
- Enquanto o segundo fator está pendente, a sessão só acessa as rotas de login. Cinco códigos errados encerram a sessão.

## Pendências conhecidas

- O mesmo código TOTP pode ser reutilizado dentro da janela de 90 segundos. Guardar o último passo aceito resolve e entra junto das ações que exigem 2FA (saques, Etapa 5).
- O limite de requisições fica na memória do processo. Com mais de uma instância da API, o contador precisa ir para o Redis.
