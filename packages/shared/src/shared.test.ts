import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSIGNABLE_ROLES,
  ROLES,
  accountState,
  can,
  formatCnpj,
  formatCpf,
  formatPhoneBR,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  isValidEmail,
  isValidPhoneBR,
  maskDocument,
  maskEmail,
  passwordIssues,
  passwordStrength,
} from "./index";

describe("CPF e CNPJ", () => {
  it("aceita documentos com dígito verificador correto", () => {
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224725"), true);
    assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  });
  it("recusa dígito errado, tamanho errado e sequências repetidas", () => {
    assert.equal(isValidCpf("529.982.247-26"), false);
    assert.equal(isValidCpf("111.111.111-11"), false);
    assert.equal(isValidCpf("123"), false);
    assert.equal(isValidCnpj("11.222.333/0001-82"), false);
    assert.equal(isValidCnpj("00.000.000/0000-00"), false);
  });
  it("exige CPF para PF e CNPJ para PJ", () => {
    assert.equal(isValidDocument("PF", "529.982.247-25"), true);
    assert.equal(isValidDocument("PJ", "529.982.247-25"), false);
    assert.equal(isValidDocument("PJ", "11.222.333/0001-81"), true);
  });
  it("formata e mascara", () => {
    assert.equal(formatCpf("52998224725"), "529.982.247-25");
    assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
    assert.equal(formatCpf("5299"), "529.9");
    assert.equal(maskDocument("52998224725"), "***.982.247-**");
    assert.equal(maskDocument("11222333000181"), "**.222.333/****-**");
  });
});

describe("Contato", () => {
  it("valida e-mail e telefone", () => {
    assert.equal(isValidEmail(" Marina@Exemplo.com "), true);
    assert.equal(isValidEmail("marina@exemplo"), false);
    assert.equal(isValidPhoneBR("(11) 98822-4410"), true);
    assert.equal(isValidPhoneBR("(11) 3322-4410"), true);
    assert.equal(isValidPhoneBR("(11) 88822-4410"), false);
    assert.equal(isValidPhoneBR("98822-4410"), false);
  });
  it("formata telefone e mascara e-mail", () => {
    assert.equal(formatPhoneBR("11988224410"), "(11) 98822-4410");
    assert.equal(formatPhoneBR("1133224410"), "(11) 3322-4410");
    assert.equal(maskEmail("marina@exemplo.com"), "m***a@exemplo.com");
  });
});

describe("Senha", () => {
  it("explica o que falta", () => {
    assert.deepEqual(passwordIssues("Senha1234"), []);
    assert.equal(passwordIssues("abc").length, 2);
    assert.equal(passwordIssues("somenteletras").length, 1);
  });
  it("dá nota de força", () => {
    assert.equal(passwordStrength(""), 0);
    assert.equal(passwordStrength("Senha1234!extra"), 4);
  });
});

describe("Permissões", () => {
  it("segue a matriz definida para cada papel", () => {
    assert.equal(can("OWNER", "payouts", "manage"), true);
    assert.equal(can("ADMIN", "payouts", "manage"), false);
    assert.equal(can("ADMIN", "payouts", "view"), true);
    assert.equal(can("FINANCE", "refunds", "manage"), true);
    assert.equal(can("SUPPORT", "refunds", "manage"), false);
    assert.equal(can("SUPPORT", "refunds", "request"), true);
    assert.equal(can("DEVELOPER", "developers", "manage"), true);
    assert.equal(can("DEVELOPER", "balance"), false);
    assert.equal(can("VIEWER", "team"), false);
    assert.equal(can("VIEWER", "catalog", "manage"), false);
  });
  it("só o proprietário gerencia os dados do negócio e ninguém atribui a posse por convite", () => {
    for (const role of ROLES) assert.equal(can(role, "business", "manage"), role === "OWNER");
    assert.equal(ASSIGNABLE_ROLES.includes("OWNER"), false);
  });
});

describe("Estado da conta", () => {
  it("deriva o estado antes e depois de existir organização", () => {
    assert.equal(accountState({ emailVerified: false, organizationStatus: null }), "EMAIL_VERIFICATION");
    assert.equal(accountState({ emailVerified: true, organizationStatus: null }), "PENDING");
    assert.equal(accountState({ emailVerified: true, organizationStatus: "ACTIVE" }), "ACTIVE");
  });
});
