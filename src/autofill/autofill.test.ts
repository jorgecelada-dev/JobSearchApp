import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { autofill, classifyField, closeAutofillBrowser } from "./autofill.js";

test("reconoce los campos habituales de un formulario de empleo", () => {
  const f = (text: string, type = "text", tag = "input") => classifyField({ type, tag, text });
  assert.equal(f("Nombre y apellidos"), "fullName");
  assert.equal(f("first_name"), "firstName");
  assert.equal(f("Apellidos"), "lastName");
  assert.equal(f("Nombre"), "firstName"); // si no hay «Apellidos», autofill() le pone el nombre completo
  assert.equal(f("Correo electrónico"), "email");
  assert.equal(f("whatever", "email"), "email");
  assert.equal(f("Carta de presentación", "textarea", "textarea"), "coverLetter");
  assert.equal(f("Mensaje"), null); // un input de una línea no es la carta
  assert.equal(f("Sube tu CV (PDF)", "file"), "cv");
  assert.equal(f("", "file"), "cv");
  assert.equal(f("Foto de perfil", "file"), null);
  assert.equal(f("Teléfono", "tel"), null);
  assert.equal(f("Enviar", "submit"), null);
});

const dir = mkdtempSync(path.join(tmpdir(), "jsa-autofill-"));
const cv = path.join(dir, "cv.pdf");
writeFileSync(cv, "%PDF-1.4 prueba");
let posted = 0;
const server = createServer((req, res) => {
  if (req.method === "POST") posted++;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><form method="post" action="/enviar">
    <label for="n">Nombre y apellidos</label><input id="n" name="name">
    <label>Correo electrónico <input type="email" name="mail"></label>
    <input name="phone" placeholder="Teléfono">
    <label for="c">Carta de presentación</label><textarea id="c"></textarea>
    <label for="f">Sube tu CV</label><input id="f" type="file" name="cv">
    <button type="submit">Enviar candidatura</button></form>`);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(async () => {
  await closeAutofillBrowser();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test("rellena nombre, email, carta y CV en un navegador real y NO envía", async () => {
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oferta`;
  const r = await autofill(url, { name: "Ana López", email: "ana@ejemplo.com", coverLetter: "Hola,\nme interesa.", cvPath: cv }, { headless: true });
  assert.deepEqual([...r.filled].sort(), ["coverLetter", "cv", "email", "fullName"]);
  assert.deepEqual(r.missing, []);
  assert.equal(await r.page.inputValue("#n"), "Ana López");
  assert.equal(await r.page.inputValue("[name=mail]"), "ana@ejemplo.com");
  assert.equal(await r.page.inputValue("#c"), "Hola,\nme interesa.");
  assert.equal(await r.page.inputValue("[name=phone]"), "");
  assert.equal(await r.page.$eval("#f", (e) => (e as HTMLInputElement).files?.[0]?.name), "cv.pdf");
  await new Promise((res) => setTimeout(res, 300));
  assert.equal(posted, 0);
});

test("sin datos, avisa de lo que falta", async () => {
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oferta`;
  const r = await autofill(url, { name: null, email: null, coverLetter: "x", cvPath: path.join(dir, "no-existe.pdf") }, { headless: true });
  assert.deepEqual(r.filled, ["coverLetter"]);
  assert.equal(r.missing.length, 3);
});
