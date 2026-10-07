import { randomBytes } from "node:crypto";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { decryptSecret, encryptSecret } from "./secretbox";
import { normalizeRecoveryCode, randomDigits, randomRecoveryCode, randomToken, sha256Hex } from "./tokens";
import { base32Decode, base32Encode, generateTotpSecret, hotp, matchTotpStep, otpauthUri, totp, totpStep, verifyTotp } from "./totp";

describe("senhas", () => {
  it("gera hashes diferentes para a mesma senha e confere só a senha certa", async () => {
    const a = await hashPassword("Senha1234");
    const b = await hashPassword("Senha1234");
    expect(a).not.toEqual(b);
    expect(a.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("Senha1234", a)).toBe(true);
    expect(await verifyPassword("senha1234", a)).toBe(false);
    expect(await verifyPassword("Senha1234", "formato-invalido")).toBe(false);
  });

  it("pede novo hash quando os parâmetros guardados são mais fracos", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash("scrypt$32768$8$3$c2FsdA==$aGFzaA==")).toBe(false);
  });
});

describe("TOTP", () => {
  // Vetores de teste da RFC 4226 (HOTP), segredo "12345678901234567890".
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

  it("bate com os vetores da RFC 4226", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(rfcSecret, counter)).toEqual(code));
  });

  it("bate com o vetor da RFC 6238 em 59 segundos", () => {
    expect(totp(rfcSecret, 59_000)).toEqual("287082");
  });

  it("aceita o passo vizinho e recusa código distante ou malformado", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });

  it("diz em qual passo de tempo o código vale, para o mesmo código não ser aceito duas vezes", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(step).toEqual(56_666_666);
    // Segredo e instante fixos, sem colisão entre os três passos da janela.
    expect([hotp(rfcSecret, step - 1), hotp(rfcSecret, step), hotp(rfcSecret, step + 1)]).toEqual(["276857", "921300", "732303"]);
    expect(matchTotpStep(rfcSecret, totp(rfcSecret, now), now)).toEqual(step);
    expect(matchTotpStep(rfcSecret, hotp(rfcSecret, step - 1), now)).toEqual(step - 1);
    expect(matchTotpStep(rfcSecret, hotp(rfcSecret, step + 1), now)).toEqual(step + 1);
    expect(matchTotpStep(rfcSecret, hotp(rfcSecret, step + 2), now)).toBeNull();
    expect(matchTotpStep(rfcSecret, hotp(rfcSecret, step - 2), now)).toBeNull();
    expect(matchTotpStep(rfcSecret, "12345", now)).toBeNull();
    expect(matchTotpStep(rfcSecret, "", now)).toBeNull();
  });

  it("codifica e decodifica base32", () => {
    const raw = randomBytes(20);
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    expect(base32Encode(Buffer.from("foobar"))).toEqual("MZXW6YTBOI");
  });

  it("monta o endereço otpauth", () => {
    const uri = otpauthUri({ issuer: "VELQYRO PAY", account: "marina@exemplo.com", secret: "ABC" });
    expect(uri.startsWith("otpauth://totp/VELQYRO%20PAY%3Amarina%40exemplo.com?")).toBe(true);
    expect(uri).toContain("secret=ABC");
  });
});

describe("segredos e tokens", () => {
  it("cifra, decifra e detecta adulteração", () => {
    const key = randomBytes(32);
    const boxed = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(boxed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(boxed, key)).toEqual("JBSWY3DPEHPK3PXP");
    expect(() => decryptSecret(boxed, randomBytes(32))).toThrow();
    const parts = boxed.split(".");
    parts[3] = Buffer.from("outra-coisa").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("gera tokens, códigos e hashes no formato esperado", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toEqual(randomToken());
    expect(randomDigits(6)).toMatch(/^\d{6}$/);
    expect(randomRecoveryCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(normalizeRecoveryCode("abcde fghjk")).toEqual("ABCDE-FGHJK");
    expect(sha256Hex("abc")).toEqual("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
