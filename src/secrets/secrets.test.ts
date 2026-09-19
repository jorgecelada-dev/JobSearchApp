import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getSmtp, publicSmtp, removeSmtp, saveSmtp } from "./accounts.js";
import { deleteSecret, getSecret, setSecret } from "./keychain.js";

// Servicio de prueba distinto del real: no toca tus secretos.
process.env.KEYCHAIN_SERVICE = "jobsearchapp-test";
after(async () => {
  await removeSmtp();
  await deleteSecret("t1");
});

test("guarda, lee, actualiza y borra un secreto en el llavero", async () => {
  assert.equal(await getSecret("t1"), null);
  await setSecret("t1", 'p@ss "con" \'comillas\' y $var `x` ñ');
  assert.equal(await getSecret("t1"), 'p@ss "con" \'comillas\' y $var `x` ñ');
  await setSecret("t1", "nuevo");
  assert.equal(await getSecret("t1"), "nuevo");
  await deleteSecret("t1");
  assert.equal(await getSecret("t1"), null);
  await deleteSecret("t1"); // borrar algo que no existe no falla
});

test("la cuenta SMTP se guarda cifrada y la vista pública no incluye la contraseña", async () => {
  await saveSmtp({ host: "smtp.gmail.com", port: 465, user: "yo@gmail.com", pass: "abcd efgh ijkl mnop" });
  assert.equal((await getSmtp())?.pass, "abcd efgh ijkl mnop");
  const pub = await publicSmtp();
  assert.equal(pub.connected, true);
  assert.doesNotMatch(JSON.stringify(pub), /abcd/);
  await removeSmtp();
  assert.deepEqual(await publicSmtp(), { connected: false });
});
